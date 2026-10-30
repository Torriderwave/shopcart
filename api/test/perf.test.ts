import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, closeAll, loginAs, saQuery, USERS } from './helpers';

afterAll(closeAll);

let admin = '';
let cliente = '';

beforeAll(async () => {
  admin = await loginAs(USERS.admin);
  cliente = await loginAs(USERS.cliente);
});

// RNF del enunciado: listados y reportes responden en menos de 1 s con los datos semilla.
const LIMITE_MS = 1000;

const ENDPOINTS_ADMIN = [
  '/catalog/productos?pageSize=20',
  '/catalog/productos?q=camisa&sort=precio:desc',
  '/orders?pageSize=20',
  '/orders?estado=Entregado&desde=2026-06-01&hasta=2026-09-30&sort=total:desc',
  '/orders?cliente=lopez',
  '/inventory/existencias?pageSize=50',
  '/inventory/existencias?soloSinStock=true',
  '/audit?pageSize=50',
  '/audit?modulo=Pedidos&accion=Transicion',
  '/reports/kpis',
  '/reports/kpis?desde=2026-05-01&hasta=2026-10-31',
  '/reports/ventas?agrupacion=dia',
  '/reports/ventas?desde=2026-05-01&hasta=2026-10-31&agrupacion=semana',
  '/reports/ventas?desde=2026-05-01&hasta=2026-10-31&agrupacion=mes',
  '/reports/ventas-categoria?desde=2026-05-01&hasta=2026-10-31',
  '/reports/top-productos?desde=2026-05-01&hasta=2026-10-31',
  '/reports/carritos-abandonados',
];

describe('T-13: rendimiento con el seed completo', () => {
  it('el seed tiene el volumen esperado', async () => {
    const [r] = await saQuery<{ pedidos: number; variantes: number; clientes: number }>(
      `SELECT (SELECT COUNT(*) FROM Pedidos) pedidos, (SELECT COUNT(*) FROM ProductoVariantes) variantes,
              (SELECT COUNT(*) FROM Usuarios WHERE Rol='Cliente') clientes`,
    );
    expect(r!.pedidos).toBeGreaterThanOrEqual(400);
    expect(r!.variantes).toBeGreaterThanOrEqual(100);
    expect(r!.clientes).toBeGreaterThanOrEqual(30);
  });

  it.each(ENDPOINTS_ADMIN)('GET %s < 1 s', async (path) => {
    await api().get(`/api/v1${path}`).set(bearer(admin)); // calienta plan/pool
    const t0 = performance.now();
    const res = await api().get(`/api/v1${path}`).set(bearer(admin));
    const ms = performance.now() - t0;
    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(LIMITE_MS);
  });

  it('GET /orders/mine (cliente) < 1 s', async () => {
    await api().get('/api/v1/orders/mine').set(bearer(cliente));
    const t0 = performance.now();
    const res = await api().get('/api/v1/orders/mine?pageSize=50').set(bearer(cliente));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(LIMITE_MS);
  });
});
