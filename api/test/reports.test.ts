import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  closeAll,
  loginAs,
  nuevaVariante,
  nuevoComprador,
  pagar,
  prepararCheckout,
  saQuery,
  uid,
  USERS,
} from './helpers';

afterAll(closeAll);

let admin = '';
let operador = '';
let cliente = '';

beforeAll(async () => {
  admin = await loginAs(USERS.admin);
  operador = await loginAs(USERS.operador);
  cliente = await loginAs(USERS.cliente);
});

const get = (path: string, tk = admin) => api().get(`/api/v1${path}`).set(bearer(tk));

async function hoyLocal(): Promise<string> {
  const [r] = await saQuery<{ d: string }>(
    `SELECT CONVERT(CHAR(10), CAST(DATEADD(HOUR,-6,SYSUTCDATETIME()) AS DATE), 23) d`,
  );
  return r!.d;
}

async function comprar(idVariante: number, cantidad: number) {
  const c = await nuevoComprador();
  const { total, envio } = await prepararCheckout(c, [{ idVariante, cantidad }]);
  const res = await pagar(c, envio, total);
  return res.body.data as { idPedido: number; lineas: { idPedidoLinea: number }[] };
}

const filaCategoria = async (idCategoria: number, q = '') => {
  const r = await get(`/reports/ventas-categoria${q}`);
  return (
    r.body.data as { idCategoria: number; ventasNetas: number; unidades: number; pedidos: number }[]
  ).find((x) => x.idCategoria === idCategoria);
};

describe('permisos', () => {
  it('solo el administrador ve reportes y bitácora', async () => {
    for (const path of [
      '/reports/kpis',
      '/reports/ventas',
      '/reports/ventas-categoria',
      '/reports/top-productos',
      '/reports/carritos-abandonados',
      '/audit',
    ]) {
      expect((await get(path, cliente)).status).toBe(403);
      expect((await get(path, operador)).status).toBe(403);
      expect((await get(path, admin)).status).toBe(200);
      expect((await api().get(`/api/v1${path}`)).status).toBe(401);
    }
  });

  it('valida fechas y rangos', async () => {
    expect((await get('/reports/kpis?desde=2026-13-45x')).status).toBe(400);
    expect((await get('/reports/kpis?desde=2026-02-10&hasta=2026-02-01')).status).toBe(400);
    expect((await get('/reports/ventas?agrupacion=anio')).status).toBe(400);
    expect((await get('/reports/top-productos?limite=0')).status).toBe(400);
  });
});

describe('T-11: reportes cuentan solo ventas efectivas menos devoluciones', () => {
  it('suma pedidos pagados, ignora cancelados y resta devoluciones', async () => {
    const v = await nuevaVariante(admin, operador, 100, 20);
    const p1 = await comprar(v.idVariante, 3);
    expect(await filaCategoria(v.idCategoria)).toMatchObject({
      ventasNetas: 300,
      unidades: 3,
      pedidos: 1,
    });

    // Un segundo pedido cancelado no suma.
    const p2 = await comprar(v.idVariante, 5);
    expect((await filaCategoria(v.idCategoria))?.ventasNetas).toBe(800);
    const cancel = await api()
      .post(`/api/v1/orders/${p2.idPedido}/cancel`)
      .set(bearer(operador))
      .send({ motivo: 'Prueba' });
    expect(cancel.status).toBe(200);
    expect(await filaCategoria(v.idCategoria)).toMatchObject({
      ventasNetas: 300,
      unidades: 3,
      pedidos: 1,
    });

    // Devolución parcial de 1 unidad resta 100.
    for (const e of ['Preparando', 'Despachado', 'Entregado']) {
      await api()
        .patch(`/api/v1/orders/${p1.idPedido}/status`)
        .set(bearer(operador))
        .send({ estado: e });
    }
    const antes = (await get('/reports/kpis')).body.data.montoDevuelto as number;
    await api()
      .post(`/api/v1/orders/${p1.idPedido}/returns`)
      .set(bearer(operador))
      .send({
        motivo: 'Defecto',
        lineas: [{ idPedidoLinea: p1.lineas[0]!.idPedidoLinea, cantidad: 1 }],
      });
    expect(await filaCategoria(v.idCategoria)).toMatchObject({
      ventasNetas: 200,
      unidades: 2,
      pedidos: 1,
    });
    const despues = (await get('/reports/kpis')).body.data.montoDevuelto as number;
    expect(Math.round((despues - antes) * 100)).toBe(10000);

    // Devolver el resto: el pedido deja de contar como pedido (0 unidades netas).
    await api()
      .post(`/api/v1/orders/${p1.idPedido}/returns`)
      .set(bearer(operador))
      .send({
        motivo: 'Resto',
        lineas: [{ idPedidoLinea: p1.lineas[0]!.idPedidoLinea, cantidad: 2 }],
      });
    expect(await filaCategoria(v.idCategoria)).toBeUndefined();
  });

  it('una venta a las 23:00 de Guatemala cae en su día local, no en el día UTC', async () => {
    const v = await nuevaVariante(admin, operador, 70, 5);
    const p = await comprar(v.idVariante, 1);
    const hoy = await hoyLocal();
    // 23:00 local del día anterior = 05:00 UTC de hoy (la fecha UTC diría "hoy").
    await saQuery(
      `UPDATE Pedidos SET FechaCreacion = DATEADD(HOUR, 5, CAST(CAST('${hoy}' AS DATE) AS DATETIME2(3))) WHERE IDPedido=${p.idPedido}`,
    );
    const ayer = (
      await saQuery<{ d: string }>(`SELECT CONVERT(CHAR(10), DATEADD(DAY,-1,'${hoy}'),23) d`)
    )[0]!.d;

    expect(await filaCategoria(v.idCategoria, `?desde=${ayer}&hasta=${ayer}`)).toMatchObject({
      ventasNetas: 70,
    });
    expect(await filaCategoria(v.idCategoria, `?desde=${hoy}&hasta=${hoy}`)).toBeUndefined();

    const serie = await get(`/reports/ventas?desde=${ayer}&hasta=${hoy}&agrupacion=dia`);
    const dias = serie.body.data as { periodo: string; ventasNetas: number }[];
    expect(dias.map((d) => d.periodo)).toEqual([ayer, hoy]);
    expect(dias[0]!.ventasNetas).toBeGreaterThanOrEqual(70);
  });

  it('la serie incluye períodos sin ventas en 0 y agrupa por semana ISO (lunes) y mes', async () => {
    const dias = (await get('/reports/ventas?desde=2020-01-01&hasta=2020-01-10&agrupacion=dia'))
      .body.data;
    expect(dias).toHaveLength(10);
    expect(
      dias.every(
        (d: { ventasNetas: number; pedidos: number }) => d.ventasNetas === 0 && d.pedidos === 0,
      ),
    ).toBe(true);
    const semanas = (
      await get('/reports/ventas?desde=2020-01-01&hasta=2020-01-20&agrupacion=semana')
    ).body.data;
    expect(semanas.map((s: { periodo: string }) => s.periodo)).toEqual([
      '2019-12-30',
      '2020-01-06',
      '2020-01-13',
      '2020-01-20',
    ]);
    const meses = (await get('/reports/ventas?desde=2020-01-15&hasta=2020-03-02&agrupacion=mes'))
      .body.data;
    expect(meses.map((s: { periodo: string }) => s.periodo)).toEqual([
      '2020-01-01',
      '2020-02-01',
      '2020-03-01',
    ]);
  });

  it('top productos ordena por unidades y respeta el límite', async () => {
    const a = await nuevaVariante(admin, operador, 10, 50);
    const b = await nuevaVariante(admin, operador, 10, 50);
    await comprar(a.idVariante, 7);
    await comprar(b.idVariante, 9);
    const top = (await get('/reports/top-productos?limite=2')).body.data as { unidades: number }[];
    expect(top).toHaveLength(2);
    expect(top[0]!.unidades).toBeGreaterThanOrEqual(top[1]!.unidades);
    expect(top[0]!.unidades).toBeGreaterThanOrEqual(9);
  });
});

describe('carritos abandonados', () => {
  it('lista carritos con líneas y sin actividad reciente, incluso de invitados', async () => {
    const v = await nuevaVariante(admin, operador, 15, 5);
    const g = await api()
      .post('/api/v1/cart/items')
      .send({ idVariante: v.idVariante, cantidad: 2 });
    const token = g.body.data.tokenInvitado as string;
    const reciente = await get('/reports/carritos-abandonados?pageSize=100');
    expect(
      reciente.body.data.some((c: { idCarrito: number }) => c.idCarrito === g.body.data.idCarrito),
    ).toBe(false);

    await saQuery(
      `UPDATE Carritos SET FechaActualizacion = DATEADD(HOUR,-3,SYSUTCDATETIME()) WHERE TokenInvitado='${token}'`,
    );
    const r = await get('/reports/carritos-abandonados?pageSize=100');
    const fila = r.body.data.find(
      (c: { idCarrito: number }) => c.idCarrito === g.body.data.idCarrito,
    );
    expect(fila).toMatchObject({ cliente: null, items: 2, subtotal: 30 });
  });
});

describe('bitácora (RF-09)', () => {
  it('registra altas/cambios/bajas con valor anterior y nuevo y se puede filtrar', async () => {
    const codigo = `B${uid().toUpperCase()}`;
    const body = {
      codigo,
      tipo: 'Fijo',
      valor: 5,
      montoMinimo: 0,
      usosTotalesMax: 10,
      usosPorCliente: 1,
      idCategoria: null,
      vigenteDesde: new Date(Date.now() - 86_400_000).toISOString(),
      vigenteHasta: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const c = await api().post('/api/v1/coupons').set(bearer(admin)).send(body);
    const id = c.body.data.idCupon as number;
    await api()
      .put(`/api/v1/coupons/${id}`)
      .set(bearer(admin))
      .send({ ...body, valor: 8 });
    await api().delete(`/api/v1/coupons/${id}`).set(bearer(admin));

    const r = await get(`/audit?modulo=Cupones&entidad=Cupon&pageSize=100`);
    const mias = (
      r.body.data as {
        idEntidad: number;
        accion: string;
        valorAnterior: Record<string, unknown> | null;
        valorNuevo: Record<string, unknown> | null;
        usuario: string;
      }[]
    ).filter((e) => e.idEntidad === id);
    expect(mias.map((e) => e.accion).sort()).toEqual(['Alta', 'Baja', 'Cambio']);
    const cambio = mias.find((e) => e.accion === 'Cambio')!;
    expect(cambio.valorAnterior).toMatchObject({ valor: 5 });
    expect(cambio.valorNuevo).toMatchObject({ valor: 8 });
    expect(mias[0]!.usuario).toBeTruthy();

    const soloBajas = await get(`/audit?accion=Baja&modulo=Cupones&pageSize=100`);
    expect(soloBajas.body.data.every((e: { accion: string }) => e.accion === 'Baja')).toBe(true);
  });

  it('UPDATE y DELETE sobre la bitácora fallan incluso como sa (T-12)', async () => {
    await expect(
      saQuery(
        `UPDATE Bitacora SET Modulo='x' WHERE IDBitacora=(SELECT MIN(IDBitacora) FROM Bitacora)`,
      ),
    ).rejects.toThrow();
    await expect(
      saQuery(`DELETE FROM Bitacora WHERE IDBitacora=(SELECT MIN(IDBitacora) FROM Bitacora)`),
    ).rejects.toThrow();
  });
});
