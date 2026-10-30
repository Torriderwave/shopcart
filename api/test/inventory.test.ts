import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, closeAll, loginAs, saQuery, uid, USERS } from './helpers';

afterAll(closeAll);

let admin = '';
let operador = '';
let cliente = '';
let idVariante = 0;

beforeAll(async () => {
  admin = await loginAs(USERS.admin);
  operador = await loginAs(USERS.operador);
  cliente = await loginAs(USERS.cliente);

  const m = uid();
  const cat = await api()
    .post('/api/v1/catalog/categorias')
    .set(bearer(admin))
    .send({ nombre: `Inv ${m}` });
  const prod = await api()
    .post('/api/v1/catalog/productos')
    .set(bearer(admin))
    .send({ idCategoria: cat.body.data.idCategoria, nombre: `Inv ${m}` });
  const v = await api()
    .post(`/api/v1/catalog/productos/${prod.body.data.idProducto}/variantes`)
    .set(bearer(admin))
    .send({ sku: `INV-${m}`, atributos: { Talla: 'L' }, precio: 50 });
  idVariante = v.body.data.variantes[0].idVariante;
});

describe('inventario y kardex (RF-03)', () => {
  it('el cliente no accede; operador y administrador sí', async () => {
    expect((await api().get('/api/v1/inventory/existencias').set(bearer(cliente))).status).toBe(
      403,
    );
    expect(
      (
        await api()
          .post('/api/v1/inventory/entradas')
          .set(bearer(cliente))
          .send({ idVariante, cantidad: 1, motivo: 'x y z' })
      ).status,
    ).toBe(403);
    expect((await api().get('/api/v1/inventory/existencias').set(bearer(operador))).status).toBe(
      200,
    );
    expect((await api().get('/api/v1/inventory/existencias').set(bearer(admin))).status).toBe(200);
  });

  it('una variante nueva nace con existencia 0; la entrada la sube y queda en kardex', async () => {
    const entrada = await api()
      .post('/api/v1/inventory/entradas')
      .set(bearer(operador))
      .send({ idVariante, cantidad: 10, motivo: 'Compra proveedor' });
    expect(entrada.status).toBe(201);
    expect(entrada.body.data).toMatchObject({
      idVariante,
      fisica: 10,
      reservada: 0,
      disponible: 10,
    });
  });

  it('un ajuste exige motivo y no puede dejar la existencia en negativo', async () => {
    const sinMotivo = await api()
      .post('/api/v1/inventory/ajustes')
      .set(bearer(operador))
      .send({ idVariante, cantidad: -1, motivo: '' });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.error.code).toBe('VALIDACION');

    const negativo = await api()
      .post('/api/v1/inventory/ajustes')
      .set(bearer(operador))
      .send({ idVariante, cantidad: -11, motivo: 'Conteo físico' });
    expect(negativo.status).toBe(400);
    expect(negativo.body.error.code).toBe('AJUSTE_INVALIDO');

    const cero = await api()
      .post('/api/v1/inventory/ajustes')
      .set(bearer(operador))
      .send({ idVariante, cantidad: 0, motivo: 'Conteo físico' });
    expect(cero.status).toBe(400);

    const ok = await api()
      .post('/api/v1/inventory/ajustes')
      .set(bearer(operador))
      .send({ idVariante, cantidad: -3, motivo: 'Merma por daño' });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ fisica: 7, disponible: 7 });
  });

  it('el kardex lista los movimientos con usuario, motivo y resultante', async () => {
    const res = await api()
      .get(`/api/v1/inventory/variantes/${idVariante}/kardex`)
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.variante).toMatchObject({ idVariante, fisica: 7 });
    const [reciente, antiguo] = res.body.data.movimientos;
    expect(reciente).toMatchObject({
      tipo: 'Ajuste',
      cantidad: -3,
      resultante: 7,
      motivo: 'Merma por daño',
      usuario: 'Omar Operador',
    });
    expect(antiguo).toMatchObject({ tipo: 'Entrada', cantidad: 10, resultante: 10 });

    const filtrado = await api()
      .get(`/api/v1/inventory/variantes/${idVariante}/kardex`)
      .query({ tipo: 'Entrada' })
      .set(bearer(admin));
    expect(filtrado.body.data.movimientos).toHaveLength(1);
    expect(
      (await api().get('/api/v1/inventory/variantes/999999/kardex').set(bearer(admin))).status,
    ).toBe(404);
  });

  it('INVARIANTE: la existencia física de toda variante es la suma de su kardex', async () => {
    const descuadres = await saQuery(
      `SELECT e.IDVariante, e.CantidadFisica, ISNULL(SUM(k.Cantidad), 0) AS SumaKardex
         FROM dbo.InventarioExistencias e
         LEFT JOIN dbo.InventarioKardex k ON k.IDVariante = e.IDVariante
        GROUP BY e.IDVariante, e.CantidadFisica
       HAVING e.CantidadFisica <> ISNULL(SUM(k.Cantidad), 0)`,
    );
    expect(descuadres).toEqual([]);
  });

  it('lista existencias con filtros y paginación en servidor', async () => {
    const res = await api()
      .get('/api/v1/inventory/existencias')
      .query({ q: 'INV-', sort: 'fisica:desc', pageSize: 5 })
      .set(bearer(operador));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
    expect(res.body.data[0]).toHaveProperty('disponible');
    expect(
      (
        await api()
          .get('/api/v1/inventory/existencias')
          .query({ sort: 'x:asc' })
          .set(bearer(operador))
      ).status,
    ).toBe(400);
  });
});

describe('bitácora inmutable (RF-09)', () => {
  it('los movimientos de inventario quedaron registrados', async () => {
    const filas = await saQuery<{ n: number }>(
      `SELECT COUNT(*) AS n FROM dbo.Bitacora WHERE Modulo = N'Inventario' AND IDEntidad = ${idVariante}`,
    );
    expect(filas[0]!.n).toBe(2);
  });

  it('UPDATE y DELETE sobre la bitácora fallan incluso como sa (triggers)', async () => {
    await expect(saQuery(`UPDATE dbo.Bitacora SET Modulo = N'x'`)).rejects.toThrow(/inmutable/);
    await expect(saQuery(`DELETE FROM dbo.Bitacora`)).rejects.toThrow(/inmutable/);
    const filas = await saQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Bitacora`);
    expect(filas[0]!.n).toBeGreaterThan(0);
  });
});
