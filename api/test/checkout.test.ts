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

beforeAll(async () => {
  admin = await loginAs(USERS.admin);
  operador = await loginAs(USERS.operador);
});

const existencia = async (idVariante: number) =>
  (
    await saQuery<{ f: number; r: number }>(
      `SELECT CantidadFisica f, CantidadReservada r FROM InventarioExistencias WHERE IDVariante=${idVariante}`,
    )
  )[0]!;

const cuponValido = (codigo: string, extra: Record<string, unknown> = {}) => ({
  codigo,
  tipo: 'Porcentaje',
  valor: 10,
  montoMinimo: 0,
  usosTotalesMax: 100,
  usosPorCliente: 1,
  idCategoria: null,
  vigenteDesde: new Date(Date.now() - 86_400_000).toISOString(),
  vigenteHasta: new Date(Date.now() + 86_400_000).toISOString(),
  ...extra,
});

describe('carrito de invitado y fusión', () => {
  it('el invitado recibe un token, lo reutiliza y al iniciar sesión se fusiona', async () => {
    const v = await nuevaVariante(admin, operador, 25, 50);
    const a = await api()
      .post('/api/v1/cart/items')
      .send({ idVariante: v.idVariante, cantidad: 2 });
    expect(a.status).toBe(201);
    const token = a.body.data.tokenInvitado as string;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);

    const b = await api().get('/api/v1/cart').set('X-Cart-Token', token);
    expect(b.body.data.cantidadItems).toBe(2);

    // Un token inventado no crea un carrito con ese valor.
    const fake = crypto.randomUUID();
    const c = await api()
      .post('/api/v1/cart/items')
      .set('X-Cart-Token', fake)
      .send({ idVariante: v.idVariante, cantidad: 1 });
    expect(c.body.data.tokenInvitado).not.toBe(fake);

    const reg = await api()
      .post('/api/v1/auth/register')
      .set('X-Cart-Token', token)
      .send({
        nombre: 'Fusion Test',
        correo: `f-${uid()}@shopcart.test`,
        contrasena: 'ShopCart2026!',
      });
    expect(reg.status).toBe(201);
    const mine = await api().get('/api/v1/cart').set(bearer(reg.body.data.accessToken));
    expect(mine.body.data.cantidadItems).toBe(2);
    expect(mine.body.data.tokenInvitado).toBeNull();
  });

  it('el invitado no puede iniciar checkout', async () => {
    expect((await api().post('/api/v1/checkout')).status).toBe(401);
  });
});

describe('carrito y compra completa (RF-04, RF-06)', () => {
  it('reserva, paga, descuenta stock y deja el pedido en Pagado con totales al centavo', async () => {
    const v = await nuevaVariante(admin, operador, 33.33, 10);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 3 }]);
    expect(await existencia(v.idVariante)).toEqual({ f: 10, r: 3 });

    const res = await pagar(c, envio, total);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ estadoCodigo: 'Pagado', subtotal: 99.99, total });
    expect(res.body.data.numeroPedido).toMatch(/^SC-\d{8}-\d{6}$/);
    // IVA 12 % incluido: el desglose informativo cuadra con el total al centavo.
    expect(Math.round(res.body.data.iva * 100)).toBe(
      Math.round(total * 100) - Math.round((total / 1.12) * 100),
    );
    expect(await existencia(v.idVariante)).toEqual({ f: 7, r: 0 });

    // El carrito se cerró: el siguiente GET es uno vacío nuevo.
    const cart = await api().get('/api/v1/cart').set(bearer(c.token));
    expect(cart.body.data.cantidadItems).toBe(0);
  });

  it('rechaza el pago si el total esperado no coincide', async () => {
    const v = await nuevaVariante(admin, operador, 10, 5);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 1 }]);
    const res = await pagar(c, envio, total + 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOTAL_CAMBIO');
    expect((await existencia(v.idVariante)).f).toBe(5);
  });

  it('exige Idempotency-Key y sin checkout activo responde 409', async () => {
    const c = await nuevoComprador();
    const sin = await api()
      .post('/api/v1/orders')
      .set(bearer(c.token))
      .send({ idDireccion: c.idDireccion, idMetodoEnvio: 1, totalEsperado: 1 });
    expect(sin.status).toBe(400);
    expect(sin.body.error.code).toBe('IDEMPOTENCY_KEY_REQUERIDA');
    // Con carrito pero sin haber iniciado el checkout → 409 CHECKOUT_NO_INICIADO.
    const v = await nuevaVariante(admin, operador, 10, 5);
    await api()
      .post('/api/v1/cart/items')
      .set(bearer(c.token))
      .send({ idVariante: v.idVariante, cantidad: 1 });
    const g = await api().get('/api/v1/checkout').set(bearer(c.token));
    expect(g.status).toBe(409);
    expect(g.body.error.code).toBe('CHECKOUT_NO_INICIADO');
    // Sin carrito → 400 CARRITO_VACIO.
    const vacio = await nuevoComprador();
    expect((await api().get('/api/v1/checkout').set(bearer(vacio.token))).body.error.code).toBe(
      'CARRITO_VACIO',
    );
  });

  it('T-02: 5 pagos paralelos con la misma llave crean un único pedido', async () => {
    const v = await nuevaVariante(admin, operador, 20, 10);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 2 }]);
    const llave = crypto.randomUUID();
    const rs = await Promise.all(Array.from({ length: 5 }, () => pagar(c, envio, total, llave)));
    expect(rs.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.data.idPedido)).size).toBe(1);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await existencia(v.idVariante)).toEqual({ f: 8, r: 0 });
  });

  it('T-01: 10 compradores por la última unidad → exactamente 1 pedido, el resto sin stock', async () => {
    const v = await nuevaVariante(admin, operador, 99, 1);
    const compradores = await Promise.all(Array.from({ length: 10 }, () => nuevoComprador()));
    const resultados = await Promise.all(
      compradores.map(async (c) => {
        const a = await api()
          .post('/api/v1/cart/items')
          .set(bearer(c.token))
          .send({ idVariante: v.idVariante, cantidad: 1 });
        if (a.status !== 201) return a;
        const ck = await api().post('/api/v1/checkout').set(bearer(c.token));
        if (ck.status !== 200) return ck;
        const op = ck.body.data.opcionesEnvio.find((o: { aplica: boolean }) => o.aplica);
        return pagar(c, op.idMetodoEnvio, op.total);
      }),
    );
    expect(resultados.filter((r) => r.status === 201)).toHaveLength(1);
    const fallos = resultados.filter((r) => r.status !== 201);
    expect(fallos).toHaveLength(9);
    for (const f of fallos) {
      expect(f.status).toBe(409);
      expect(['STOCK_INSUFICIENTE', 'CANTIDAD_EXCEDE_DISPONIBLE']).toContain(f.body.error.code);
    }
    expect(await existencia(v.idVariante)).toEqual({ f: 0, r: 0 });
  });

  it('reiniciar el checkout no duplica reservas y cancelarlo las libera', async () => {
    const v = await nuevaVariante(admin, operador, 10, 10);
    const c = await nuevoComprador();
    await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 4 }]);
    await api().post('/api/v1/checkout').set(bearer(c.token));
    expect((await existencia(v.idVariante)).r).toBe(4);
    expect((await api().delete('/api/v1/checkout').set(bearer(c.token))).status).toBe(204);
    expect((await existencia(v.idVariante)).r).toBe(0);
  });

  it('T-10: una reserva vencida se detecta al pagar y no vende', async () => {
    const v = await nuevaVariante(admin, operador, 10, 5);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 2 }]);
    await saQuery(
      `UPDATE InventarioReservas SET ExpiraEn = DATEADD(MINUTE,-1,SYSUTCDATETIME()) WHERE IDVariante=${v.idVariante} AND Estado='Activa'`,
    );
    const res = await pagar(c, envio, total);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVA_VENCIDA');
    expect((await existencia(v.idVariante)).f).toBe(5);
    const { liberarReservasVencidas } = await import('../src/jobs/liberarReservas.job');
    expect(await liberarReservasVencidas()).toBeGreaterThanOrEqual(1);
    expect((await existencia(v.idVariante)).r).toBe(0);
  });
});

describe('cupones (RF-05)', () => {
  it('solo el administrador gestiona cupones', async () => {
    const cl = await nuevoComprador();
    expect((await api().get('/api/v1/coupons').set(bearer(cl.token))).status).toBe(403);
    expect((await api().get('/api/v1/coupons').set(bearer(operador))).status).toBe(403);
    expect((await api().get('/api/v1/coupons').set(bearer(admin))).status).toBe(200);
  });

  it('descuento porcentual aplicado, prorrateado y registrado en CuponUsos', async () => {
    const codigo = `P${uid().toUpperCase()}`;
    expect(
      (await api().post('/api/v1/coupons').set(bearer(admin)).send(cuponValido(codigo))).status,
    ).toBe(201);
    const v = await nuevaVariante(admin, operador, 100, 5);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(
      c,
      [{ idVariante: v.idVariante, cantidad: 2 }],
      codigo,
    );
    const res = await pagar(c, envio, total);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 200, descuento: 20, cuponCodigo: codigo });
    expect(res.body.data.lineas[0].descuentoLinea).toBe(20);
    const usos = await saQuery<{ n: number }>(
      `SELECT COUNT(*) n FROM CuponUsos u JOIN Cupones c ON c.IDCupon=u.IDCupon WHERE c.Codigo='${codigo}'`,
    );
    expect(usos[0]!.n).toBe(1);
  });

  it('límite por cliente: un segundo pedido con el mismo cupón es rechazado', async () => {
    const codigo = `L${uid().toUpperCase()}`;
    await api().post('/api/v1/coupons').set(bearer(admin)).send(cuponValido(codigo));
    const v = await nuevaVariante(admin, operador, 50, 10);
    const c = await nuevoComprador();
    const p1 = await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 1 }], codigo);
    expect((await pagar(c, p1.envio, p1.total)).status).toBe(201);
    await api()
      .post('/api/v1/cart/items')
      .set(bearer(c.token))
      .send({ idVariante: v.idVariante, cantidad: 1 });
    const r = await api().post('/api/v1/cart/coupon').set(bearer(c.token)).send({ codigo });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CUPON_LIMITE_CLIENTE');
  });

  it('T-03: cupón con 3 usos y 10 compradores simultáneos → exactamente 3 lo usan', async () => {
    const codigo = `C${uid().toUpperCase()}`;
    await api()
      .post('/api/v1/coupons')
      .set(bearer(admin))
      .send(cuponValido(codigo, { usosTotalesMax: 3 }));
    const v = await nuevaVariante(admin, operador, 40, 50);
    const compradores = await Promise.all(Array.from({ length: 10 }, () => nuevoComprador()));
    // Todos lo aplican al carrito (aún hay usos disponibles); el límite se hace cumplir al pagar.
    const listos = await Promise.all(
      compradores.map(async (c) => ({
        c,
        ...(await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad: 1 }], codigo)),
      })),
    );
    const rs = await Promise.all(listos.map((l) => pagar(l.c, l.envio, l.total)));
    const ok = rs.filter((r) => r.status === 201);
    expect(ok).toHaveLength(3);
    for (const f of rs.filter((r) => r.status !== 201))
      expect(f.body.error.code).toBe('CUPON_AGOTADO');
    const [row] = await saQuery<{ a: number }>(
      `SELECT UsosTotalesActual a FROM Cupones WHERE Codigo='${codigo}'`,
    );
    expect(row!.a).toBe(3);
  });

  it('valida mínimo, categoría y vigencia', async () => {
    const v = await nuevaVariante(admin, operador, 30, 20);
    const otraCat = await nuevaVariante(admin, operador, 30, 20);
    const c = await nuevoComprador();
    await api()
      .post('/api/v1/cart/items')
      .set(bearer(c.token))
      .send({ idVariante: v.idVariante, cantidad: 1 });

    const min = `M${uid().toUpperCase()}`;
    await api()
      .post('/api/v1/coupons')
      .set(bearer(admin))
      .send(cuponValido(min, { montoMinimo: 500 }));
    expect(
      (await api().post('/api/v1/cart/coupon').set(bearer(c.token)).send({ codigo: min })).body
        .error.code,
    ).toBe('CUPON_MONTO_MINIMO');

    const cat = `K${uid().toUpperCase()}`;
    await api()
      .post('/api/v1/coupons')
      .set(bearer(admin))
      .send(cuponValido(cat, { idCategoria: otraCat.idCategoria }));
    expect(
      (await api().post('/api/v1/cart/coupon').set(bearer(c.token)).send({ codigo: cat })).body
        .error.code,
    ).toBe('CUPON_SIN_PRODUCTOS_ELEGIBLES');

    const vencido = `V${uid().toUpperCase()}`;
    await api()
      .post('/api/v1/coupons')
      .set(bearer(admin))
      .send(
        cuponValido(vencido, {
          vigenteDesde: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          vigenteHasta: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      );
    expect(
      (await api().post('/api/v1/cart/coupon').set(bearer(c.token)).send({ codigo: vencido })).body
        .error.code,
    ).toBe('CUPON_FUERA_VIGENCIA');

    expect(
      (await api().post('/api/v1/cart/coupon').set(bearer(c.token)).send({ codigo: 'NOEXISTE' }))
        .body.error.code,
    ).toBe('CUPON_INVALIDO');
  });

  it('un cupón fijo mayor al subtotal no deja el total negativo', async () => {
    const codigo = `F${uid().toUpperCase()}`;
    await api()
      .post('/api/v1/coupons')
      .set(bearer(admin))
      .send(cuponValido(codigo, { tipo: 'Fijo', valor: 500 }));
    const v = await nuevaVariante(admin, operador, 20, 5);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(
      c,
      [{ idVariante: v.idVariante, cantidad: 1 }],
      codigo,
    );
    const res = await pagar(c, envio, total);
    expect(res.status).toBe(201);
    expect(res.body.data.descuento).toBe(20);
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
  });

  it('T-14: el descuento prorrateado suma exactamente el descuento del pedido', async () => {
    const codigo = `R${uid().toUpperCase()}`;
    await api()
      .post('/api/v1/coupons')
      .set(bearer(admin))
      .send(cuponValido(codigo, { valor: 7 }));
    const a = await nuevaVariante(admin, operador, 33.33, 10);
    const b = await nuevaVariante(admin, operador, 19.99, 10);
    const d = await nuevaVariante(admin, operador, 7.77, 10);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(
      c,
      [
        { idVariante: a.idVariante, cantidad: 3 },
        { idVariante: b.idVariante, cantidad: 2 },
        { idVariante: d.idVariante, cantidad: 1 },
      ],
      codigo,
    );
    const res = await pagar(c, envio, total);
    expect(res.status).toBe(201);
    const suma = (res.body.data.lineas as { descuentoLinea: number }[]).reduce(
      (s, l) => s + Math.round(l.descuentoLinea * 100),
      0,
    );
    expect(suma).toBe(Math.round(res.body.data.descuento * 100));
  });
});

describe('ciclo de vida del pedido (RF-07)', () => {
  const comprar = async (cantidad: number, precio = 40, stock = 20) => {
    const v = await nuevaVariante(admin, operador, precio, stock);
    const c = await nuevoComprador();
    const { total, envio } = await prepararCheckout(c, [{ idVariante: v.idVariante, cantidad }]);
    const res = await pagar(c, envio, total);
    return { v, c, pedido: res.body.data as { idPedido: number; total: number } };
  };
  const estado = (id: number, to: string, tk = operador) =>
    api().patch(`/api/v1/orders/${id}/status`).set(bearer(tk)).send({ estado: to });

  it('T-06: solo avanza Pagado→Preparando→Despachado→Entregado; saltos y retrocesos dan 409', async () => {
    const { pedido, c } = await comprar(1);
    expect((await estado(pedido.idPedido, 'Entregado')).status).toBe(409);
    expect((await estado(pedido.idPedido, 'Preparando', c.token)).status).toBe(403);
    expect((await estado(pedido.idPedido, 'Preparando')).status).toBe(200);
    expect((await estado(pedido.idPedido, 'Pagado')).body.error.code).toBe('TRANSICION_INVALIDA');
    expect((await estado(pedido.idPedido, 'Despachado')).status).toBe(200);
    expect((await estado(pedido.idPedido, 'Entregado')).status).toBe(200);
    const det = await api().get(`/api/v1/orders/${pedido.idPedido}`).set(bearer(operador));
    expect(
      det.body.data.historial.map((h: { estadoNuevoCodigo: string }) => h.estadoNuevoCodigo),
    ).toEqual(['Pagado', 'Preparando', 'Despachado', 'Entregado']);
  });

  it('T-06b: la BD también rechaza la transición (SP directo con el login de la app)', async () => {
    const { executeSp, p, T } = await import('../src/shared/db');
    const { pedido } = await comprar(1);
    const [op] = await saQuery<{ id: number }>(
      `SELECT IDUsuario id FROM Usuarios WHERE Correo='${USERS.operador}'`,
    );
    await expect(
      executeSp('SP_Pedidos_CambiarEstado', {
        IDUsuarioSesion: p(T.Int, op!.id),
        IDPedido: p(T.Int, pedido.idPedido),
        Estado: p(T.NVarChar(20), 'Entregado'),
      }),
    ).rejects.toMatchObject({ code: 'TRANSICION_INVALIDA' });
  });

  it('el cliente cancela su pedido Pagado: stock reintegrado y no se cancela dos veces', async () => {
    const { v, c, pedido } = await comprar(3);
    expect((await existencia(v.idVariante)).f).toBe(17);
    const ok = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/cancel`)
      .set(bearer(c.token))
      .send({ motivo: 'Me arrepentí' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.estadoCodigo).toBe('Cancelado');
    expect((await existencia(v.idVariante)).f).toBe(20);
    const otra = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/cancel`)
      .set(bearer(c.token))
      .send({ motivo: 'Otra vez' });
    expect(otra.status).toBe(409);
    expect(otra.body.error.code).toBe('PEDIDO_NO_CANCELABLE');
  });

  it('un cliente no cancela ni ve pedidos ajenos; tras Despachado no se cancela', async () => {
    const { pedido, c } = await comprar(1);
    const otro = await nuevoComprador();
    expect(
      (await api().get(`/api/v1/orders/${pedido.idPedido}`).set(bearer(otro.token))).status,
    ).toBe(403);
    expect(
      (
        await api()
          .post(`/api/v1/orders/${pedido.idPedido}/cancel`)
          .set(bearer(otro.token))
          .send({ motivo: 'x y z' })
      ).status,
    ).toBe(403);
    await estado(pedido.idPedido, 'Preparando');
    await estado(pedido.idPedido, 'Despachado');
    const r = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/cancel`)
      .set(bearer(c.token))
      .send({ motivo: 'Tarde' });
    expect(r.body.error.code).toBe('PEDIDO_NO_CANCELABLE');
  });

  it('devoluciones: parcial, luego completa; no se excede lo vendido; reembolso exacto', async () => {
    const { v, pedido } = await comprar(3, 33.33);
    const noEntregado = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/returns`)
      .set(bearer(operador))
      .send({ motivo: 'Defecto', lineas: [{ idPedidoLinea: 1, cantidad: 1 }] });
    expect(noEntregado.body.error.code).toBe('DEVOLUCION_NO_PERMITIDA');

    for (const e of ['Preparando', 'Despachado', 'Entregado']) await estado(pedido.idPedido, e);
    const det = await api().get(`/api/v1/orders/${pedido.idPedido}`).set(bearer(operador));
    const linea = det.body.data.lineas[0] as { idPedidoLinea: number; totalLinea: number };

    const r1 = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/returns`)
      .set(bearer(operador))
      .send({ motivo: 'Defecto', lineas: [{ idPedidoLinea: linea.idPedidoLinea, cantidad: 1 }] });
    expect(r1.status).toBe(201);
    expect(r1.body.data.estadoCodigo).toBe('DevueltoParcial');
    expect((await existencia(v.idVariante)).f).toBe(18);

    const exceso = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/returns`)
      .set(bearer(operador))
      .send({ motivo: 'Defecto', lineas: [{ idPedidoLinea: linea.idPedidoLinea, cantidad: 3 }] });
    expect(exceso.body.error.code).toBe('DEVOLUCION_EXCEDE_VENDIDO');

    const r2 = await api()
      .post(`/api/v1/orders/${pedido.idPedido}/returns`)
      .set(bearer(operador))
      .send({ motivo: 'Resto', lineas: [{ idPedidoLinea: linea.idPedidoLinea, cantidad: 2 }] });
    expect(r2.body.data.estadoCodigo).toBe('DevueltoTotal');
    const reembolsos = (r2.body.data.devoluciones as { montoTotal: number }[]).reduce(
      (s, d) => s + Math.round(d.montoTotal * 100),
      0,
    );
    expect(reembolsos).toBe(Math.round(linea.totalLinea * 100));
    expect((await existencia(v.idVariante)).f).toBe(20);
  });

  it('el kardex cuadra con la existencia física tras todas las operaciones', async () => {
    const malos = await saQuery<{ IDVariante: number }>(
      `SELECT e.IDVariante FROM InventarioExistencias e
         OUTER APPLY (SELECT ISNULL(SUM(Cantidad),0) s FROM InventarioKardex k WHERE k.IDVariante=e.IDVariante) k
        WHERE e.CantidadFisica <> k.s`,
    );
    expect(malos).toEqual([]);
  });
});
