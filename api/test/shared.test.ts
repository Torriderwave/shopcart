import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { ZodError } from 'zod';
import { HEADER_IDEMPOTENCY_KEY, sortQuery } from '@shopcart/contracts';
import {
  hashPassword,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from '../src/shared/auth';
import { camelKey } from '../src/shared/db';
import { AppError, mapSqlError } from '../src/shared/errors';
import { idempotencyKey } from '../src/shared/http';

describe('camelKey (columnas de SP → JSON)', () => {
  it.each([
    ['IDProducto', 'idProducto'],
    ['IDUsuarioSesion', 'idUsuarioSesion'],
    ['SKU', 'sku'],
    ['TotalFilas', 'totalFilas'],
    ['Nombre', 'nombre'],
    ['FechaCreacion', 'fechaCreacion'],
    ['DirLinea1', 'dirLinea1'],
  ])('%s → %s', (input, expected) => {
    expect(camelKey(input)).toBe(expected);
  });
});

describe('mapSqlError (THROW y constraints → AppError)', () => {
  it('traduce los códigos 5xxxx a código estable + HTTP', () => {
    const err = mapSqlError({ number: 50001, message: 'Stock insuficiente para SKU X' });
    expect(err).toMatchObject({
      code: 'STOCK_INSUFICIENTE',
      status: 409,
      message: 'Stock insuficiente para SKU X',
    });
    expect(mapSqlError({ number: 50043, message: 'x' })).toMatchObject({
      code: 'PROHIBIDO',
      status: 403,
    });
    expect(mapSqlError({ number: 50044, message: 'x' })).toMatchObject({
      code: 'NO_ENCONTRADO',
      status: 404,
    });
    expect(mapSqlError({ number: 50030, message: 'x' })).toMatchObject({
      code: 'TRANSICION_INVALIDA',
      status: 409,
    });
  });

  it('lee el número desde originalError cuando no viene en el nivel superior', () => {
    expect(
      mapSqlError({ originalError: { info: { number: 50060, message: 'neg' } } }),
    ).toMatchObject({
      code: 'AJUSTE_INVALIDO',
    });
  });

  it('un THROW 50xxx sin mapeo es regla de negocio → 400', () => {
    expect(mapSqlError({ number: 50999, message: 'otra regla' })).toMatchObject({
      code: 'VALIDACION',
      status: 400,
    });
  });

  it('UNIQUE duplicado indica el campo según la constraint', () => {
    const err = mapSqlError({
      number: 2627,
      message:
        "Violation of UNIQUE KEY constraint 'UQ_Usuarios_Correo'. Cannot insert duplicate key",
    });
    expect(err).toMatchObject({ code: 'DUPLICADO', status: 409, details: [{ campo: 'correo' }] });
  });

  it('deadlock → CONCURRENCIA 503; FK → REFERENCIA_INVALIDA', () => {
    expect(mapSqlError({ number: 1205, message: 'deadlock' })).toMatchObject({
      code: 'CONCURRENCIA',
      status: 503,
    });
    expect(mapSqlError({ number: 547, message: 'fk' })).toMatchObject({
      code: 'REFERENCIA_INVALIDA',
      status: 400,
    });
  });

  it('errores que no son de BD no se mapean', () => {
    expect(mapSqlError(new Error('boom'))).toBeUndefined();
    expect(mapSqlError(null)).toBeUndefined();
  });
});

describe('auth', () => {
  it('argon2id: verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('Secreta#123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Secreta#123')).toBe(true);
    expect(await verifyPassword(hash, 'otra')).toBe(false);
    expect(await verifyPassword('no-es-un-hash', 'x')).toBe(false);
  });

  it('JWT: ida y vuelta conserva sub, rol y nombre', () => {
    const { token } = signAccessToken({ idUsuario: 7, rol: 'Operador', nombre: 'Ana' });
    expect(verifyAccessToken(token)).toEqual({ idUsuario: 7, rol: 'Operador', nombre: 'Ana' });
  });

  it('JWT manipulado → 401 NO_AUTENTICADO', () => {
    const { token } = signAccessToken({ idUsuario: 7, rol: 'Cliente', nombre: 'Ana' });
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(() => verifyAccessToken(tampered)).toThrow(AppError);
    try {
      verifyAccessToken(tampered);
    } catch (e) {
      expect(e).toMatchObject({ code: 'NO_AUTENTICADO', status: 401 });
    }
  });

  it('hashToken es SHA-256 hex determinista de 64 caracteres', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('http', () => {
  const reqWith = (headers: Record<string, string>) =>
    ({ header: (n: string) => headers[n.toLowerCase()] }) as unknown as Request;

  it('Idempotency-Key: obligatoria y UUID', () => {
    expect(() => idempotencyKey(reqWith({}))).toThrow(/Idempotency-Key/);
    expect(() => idempotencyKey(reqWith({ [HEADER_IDEMPOTENCY_KEY]: 'no-uuid' }))).toThrow(
      AppError,
    );
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(idempotencyKey(reqWith({ [HEADER_IDEMPOTENCY_KEY]: uuid }))).toBe(uuid);
  });
});

describe('contracts: sortQuery (lista blanca de orden)', () => {
  const schema = sortQuery(['nombre', 'precio'] as const, 'nombre');

  it('acepta campos permitidos y devuelve campo/dirección', () => {
    expect(schema.parse('precio:desc')).toEqual({ campo: 'precio', direccion: 'desc' });
  });
  it('usa el valor por defecto', () => {
    expect(schema.parse(undefined)).toEqual({ campo: 'nombre', direccion: 'asc' });
  });
  it('rechaza campos fuera de la lista blanca (sin SQL dinámico posible)', () => {
    expect(() => schema.parse('password:asc')).toThrow(ZodError);
    expect(() => schema.parse('nombre;DROP:asc')).toThrow(ZodError);
  });
});
