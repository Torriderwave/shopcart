import { Router, type Response } from 'express';
import {
  ListarBitacoraQuerySchema,
  PaginationQuerySchema,
  RangoQuerySchema,
  TopProductosQuerySchema,
  VentasQuerySchema,
  type ListarBitacoraQuery,
  type PaginationQuery,
  type RangoQuery,
  type TopProductosQuery,
  type VentasQuery,
} from '@shopcart/contracts';
import { requireAuth, requireRole, ROLES_ADMIN, sessionUser } from '../../shared/auth';
import { ok, paged, valid, validate } from '../../shared/http';
import * as service from './reports.service';
import type { CacheResult } from './reports.service';

function conCache<T>(res: Response, r: CacheResult<T>): T {
  res.setHeader('X-Cache', r.cache);
  return r.valor;
}

const clientes = new Set<Response>();

function escribir(res: Response, chunk: string): void {
  if (res.writableEnded || res.destroyed) {
    clientes.delete(res);
    return;
  }
  res.write(chunk);
}

service.alCambiarReportes((alcance) => {
  const chunk = `event: reportes\ndata: ${JSON.stringify({ alcance })}\n\n`;
  for (const res of clientes) escribir(res, chunk);
});

function conectarStream(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  clientes.add(res);
  escribir(res, 'event: listo\ndata: {"alcance":"todo"}\n\n');
  const ping = setInterval(() => escribir(res, ': ping\n\n'), 25_000);
  res.on('close', () => {
    clearInterval(ping);
    clientes.delete(res);
  });
}

export const reportsRouter = Router();

const admin = [requireAuth, requireRole(...ROLES_ADMIN)];

reportsRouter.get(
  '/reports/kpis',
  ...admin,
  validate({ query: RangoQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, RangoQuery>(res);
    ok(res, conCache(res, await service.kpis(sessionUser(req).idUsuario, query)));
  },
);

reportsRouter.get(
  '/reports/ventas',
  ...admin,
  validate({ query: VentasQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, VentasQuery>(res);
    ok(res, conCache(res, await service.ventasPorPeriodo(sessionUser(req).idUsuario, query)));
  },
);

reportsRouter.get(
  '/reports/ventas-categoria',
  ...admin,
  validate({ query: RangoQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, RangoQuery>(res);
    ok(res, conCache(res, await service.ventasPorCategoria(sessionUser(req).idUsuario, query)));
  },
);

reportsRouter.get(
  '/reports/top-productos',
  ...admin,
  validate({ query: TopProductosQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, TopProductosQuery>(res);
    ok(res, conCache(res, await service.topProductos(sessionUser(req).idUsuario, query)));
  },
);

reportsRouter.get(
  '/reports/carritos-abandonados',
  ...admin,
  validate({ query: PaginationQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, PaginationQuery>(res);
    const { items, total } = await service.carritosAbandonados(
      sessionUser(req).idUsuario,
      query.page,
      query.pageSize,
    );
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

reportsRouter.get(
  '/reports/export',
  ...admin,
  validate({ query: RangoQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, RangoQuery>(res);
    const { buffer, nombre } = await service.exportarExcel(sessionUser(req).idUsuario, query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  },
);

reportsRouter.get('/reports/stream', ...admin, (_req, res) => {
  conectarStream(res);
});

reportsRouter.get(
  '/audit',
  ...admin,
  validate({ query: ListarBitacoraQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarBitacoraQuery>(res);
    const { items, total } = await service.listarBitacora(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);
