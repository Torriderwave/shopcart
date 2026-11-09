import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  app,
  bearer,
  closeAll,
  loginAs,
  nuevaVariante,
  nuevoComprador,
  pagar,
  prepararCheckout,
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

async function comprar(idVariante: number, cantidad: number) {
  const c = await nuevoComprador();
  const { total, envio } = await prepararCheckout(c, [{ idVariante, cantidad }]);
  const res = await pagar(c, envio, total);
  expect(res.status).toBe(201);
}

describe('extras: caché de reportes', () => {
  it('repite la consulta desde caché y la suelta al crear un pedido', async () => {
    const frio = await get('/reports/kpis');
    expect(frio.status).toBe(200);
    const caliente = await get('/reports/kpis');
    expect(caliente.headers['x-cache']).toBe('HIT');
    expect(caliente.body).toEqual(frio.body);

    const v = await nuevaVariante(admin, operador, 100, 5);
    await comprar(v.idVariante, 1);
    const despues = await get('/reports/kpis');
    expect(despues.headers['x-cache']).toBe('MISS');
    expect(despues.body.data.ventasNetas).toBeGreaterThan(caliente.body.data.ventasNetas);
  });
});

describe('extras: exportación a Excel', () => {
  it('devuelve un libro xlsx del rango y rechaza un rango inválido', async () => {
    const res = await api()
      .get('/api/v1/reports/export?desde=2026-01-01&hasta=2026-11-09')
      .set(bearer(admin))
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('shopcart-reportes_');
    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body as ArrayBuffer);
    expect(buf.subarray(0, 2).toString()).toBe('PK');

    expect((await get('/reports/export?desde=2026-02-10&hasta=2026-02-01')).status).toBe(400);
    expect((await get('/reports/export', cliente)).status).toBe(403);
  });
});

describe('extras: dashboard en vivo', () => {
  it('el flujo solo lo abre un administrador', async () => {
    expect((await get('/reports/stream', cliente)).status).toBe(403);
    expect((await get('/reports/stream', operador)).status).toBe(403);
    expect((await api().get('/api/v1/reports/stream')).status).toBe(401);
  });

  it('avisa a los dashboards conectados cuando se crea un pedido', async () => {
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const ac = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/reports/stream`, {
        headers: { Authorization: `Bearer ${admin}` },
        signal: ac.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const esperar = async (pred: (s: string) => boolean) => {
        while (!pred(buf)) {
          const { value, done } = await reader.read();
          if (done) throw new Error(`el flujo se cerró: ${buf}`);
          buf += dec.decode(value);
        }
      };
      await esperar((s) => s.includes('event: listo'));
      const v = await nuevaVariante(admin, operador, 25, 4);
      await comprar(v.idVariante, 1);
      await esperar((s) => s.includes('event: reportes') && s.includes('"alcance":"todo"'));
      const marca = buf.length;
      const linea = await api()
        .post('/api/v1/cart/items')
        .set(bearer(cliente))
        .send({ idVariante: v.idVariante, cantidad: 1 });
      expect(linea.status).toBe(201);
      await esperar(
        (s) =>
          s.slice(marca).includes('event: reportes') &&
          s.slice(marca).includes('"alcance":"carritos"'),
      );
    } finally {
      ac.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
