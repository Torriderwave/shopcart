import { Router } from 'express';
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

export const reportsRouter = Router();

const admin = [requireAuth, requireRole(...ROLES_ADMIN)];

reportsRouter.get(
  '/reports/kpis',
  ...admin,
  validate({ query: RangoQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, RangoQuery>(res);
    ok(res, await service.kpis(sessionUser(req).idUsuario, query));
  },
);

reportsRouter.get(
  '/reports/ventas',
  ...admin,
  validate({ query: VentasQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, VentasQuery>(res);
    ok(res, await service.ventasPorPeriodo(sessionUser(req).idUsuario, query));
  },
);

reportsRouter.get(
  '/reports/ventas-categoria',
  ...admin,
  validate({ query: RangoQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, RangoQuery>(res);
    ok(res, await service.ventasPorCategoria(sessionUser(req).idUsuario, query));
  },
);

reportsRouter.get(
  '/reports/top-productos',
  ...admin,
  validate({ query: TopProductosQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, TopProductosQuery>(res);
    ok(res, await service.topProductos(sessionUser(req).idUsuario, query));
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
  '/audit',
  ...admin,
  validate({ query: ListarBitacoraQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarBitacoraQuery>(res);
    const { items, total } = await service.listarBitacora(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);
