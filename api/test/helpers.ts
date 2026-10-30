import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { closePool } from '../src/shared/db';

export const PASSWORD = 'ShopCart2026!';
export const USERS = {
  admin: 'admin@shopcart.test',
  operador: 'operador@shopcart.test',
  cliente: 'cliente@shopcart.test',
  cliente2: 'cliente2@shopcart.test',
} as const;

export const app: Express = createApp();
export const api = (): ReturnType<typeof request> => request(app);
export const uid = (): string => randomUUID().slice(0, 8);

/** Inicia sesión con un usuario del seed y devuelve su access token. */
export async function loginAs(correo: string, contrasena = PASSWORD): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ correo, contrasena });
  if (res.status !== 200) throw new Error(`Login de ${correo} falló: ${res.status} ${res.text}`);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

export const bearer = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

// ── Verificaciones directas en BD (solo tests): conexión como sa ──────────────

let saPool: sql.ConnectionPool | undefined;

export async function saQuery<T = Record<string, unknown>>(text: string): Promise<T[]> {
  saPool ??= await new sql.ConnectionPool({
    server: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    user: 'sa',
    password: process.env.MSSQL_SA_PASSWORD,
    database: process.env.DB_NAME ?? 'ShopCart',
    options: { encrypt: true, trustServerCertificate: true },
  }).connect();
  const r = await saPool.request().query(text);
  return r.recordset as T[];
}

export async function closeAll(): Promise<void> {
  await closePool();
  await saPool?.close();
  saPool = undefined;
}

// ── Fixtures de compra ────────────────────────────────────────────────────────

export const DIRECCION = {
  alias: 'Casa',
  destinatario: 'Carla Cliente',
  linea1: '5a avenida 10-20 zona 10',
  ciudad: 'Guatemala',
  departamento: 'Guatemala',
  telefono: '5555-1234',
};

export interface Comprador {
  token: string;
  idDireccion: number;
}

/** Cliente nuevo (carrito y usos de cupón limpios) con una dirección. */
export async function nuevoComprador(): Promise<Comprador> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ nombre: 'Comprador Test', correo: `c-${uid()}@shopcart.test`, contrasena: PASSWORD });
  const token = (res.body as { data: { accessToken: string } }).data.accessToken;
  const dir = await request(app).post('/api/v1/me/direcciones').set(bearer(token)).send(DIRECCION);
  return { token, idDireccion: (dir.body as { data: { idDireccion: number } }).data.idDireccion };
}

export interface VarianteTest {
  idVariante: number;
  idCategoria: number;
  sku: string;
}

/** Categoría+producto+variante nuevos con `stock` unidades (vía API, como lo haría la UI). */
export async function nuevaVariante(
  admin: string,
  operador: string,
  precio: number,
  stock: number,
  idCategoria?: number,
): Promise<VarianteTest> {
  const m = uid();
  let cat = idCategoria;
  if (cat === undefined) {
    const c = await request(app)
      .post('/api/v1/catalog/categorias')
      .set(bearer(admin))
      .send({ nombre: `Cat ${m}` });
    cat = (c.body as { data: { idCategoria: number } }).data.idCategoria;
  }
  const prod = await request(app)
    .post('/api/v1/catalog/productos')
    .set(bearer(admin))
    .send({ idCategoria: cat, nombre: `Prod ${m}` });
  const idProducto = (prod.body as { data: { idProducto: number } }).data.idProducto;
  const v = await request(app)
    .post(`/api/v1/catalog/productos/${idProducto}/variantes`)
    .set(bearer(admin))
    .send({ sku: `T-${m}`, atributos: { Talla: 'M' }, precio });
  const idVariante = (v.body as { data: { variantes: { idVariante: number }[] } }).data
    .variantes[0]!.idVariante;
  if (stock > 0) {
    await request(app)
      .post('/api/v1/inventory/entradas')
      .set(bearer(operador))
      .send({ idVariante, cantidad: stock, motivo: 'Stock de prueba' });
  }
  return { idVariante, idCategoria: cat, sku: `T-${m}` };
}

/** Agrega al carrito, inicia checkout y devuelve lo necesario para pagar. */
export async function prepararCheckout(
  c: Comprador,
  lineas: { idVariante: number; cantidad: number }[],
  cupon?: string,
): Promise<{ total: number; envio: number }> {
  for (const l of lineas) {
    const r = await request(app).post('/api/v1/cart/items').set(bearer(c.token)).send(l);
    if (r.status !== 201) throw new Error(`add ${r.status} ${r.text}`);
  }
  if (cupon) {
    const r = await request(app)
      .post('/api/v1/cart/coupon')
      .set(bearer(c.token))
      .send({ codigo: cupon });
    if (r.status !== 200) throw new Error(`cupón ${r.status} ${r.text}`);
  }
  const ck = await request(app).post('/api/v1/checkout').set(bearer(c.token));
  if (ck.status !== 200) throw new Error(`checkout ${ck.status} ${ck.text}`);
  const opciones = (
    ck.body as {
      data: {
        opcionesEnvio: { idMetodoEnvio: number; total: number; costo: number; aplica: boolean }[];
      };
    }
  ).data.opcionesEnvio;
  const op = opciones.find((o) => o.aplica)!;
  return { total: op.total, envio: op.idMetodoEnvio };
}

export const pagar = (c: Comprador, envio: number, total: number, llave = crypto.randomUUID()) =>
  request(app)
    .post('/api/v1/orders')
    .set(bearer(c.token))
    .set('Idempotency-Key', llave)
    .send({ idDireccion: c.idDireccion, idMetodoEnvio: envio, totalEsperado: total });
