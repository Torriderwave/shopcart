import { Router } from 'express';
import {
  CuponInputSchema,
  IdParamSchema,
  ListarCuponesQuerySchema,
  type CuponInput,
  type ListarCuponesQuery,
} from '@shopcart/contracts';
import { requireAuth, requireRole, ROLES_ADMIN, sessionUser } from '../../shared/auth';
import { noContent, ok, paged, valid, validate } from '../../shared/http';
import * as service from './coupons.service';

export const couponsRouter = Router();

const admin = [requireAuth, requireRole(...ROLES_ADMIN)];

couponsRouter.get(
  '/coupons',
  ...admin,
  validate({ query: ListarCuponesQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarCuponesQuery>(res);
    const { items, total } = await service.listar(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

couponsRouter.post('/coupons', ...admin, validate({ body: CuponInputSchema }), async (req, res) => {
  const { body } = valid<unknown, unknown, CuponInput>(res);
  ok(res, await service.crear(sessionUser(req).idUsuario, body), 201);
});

couponsRouter.put(
  '/coupons/:id',
  ...admin,
  validate({ params: IdParamSchema, body: CuponInputSchema }),
  async (req, res) => {
    const { params, body } = valid<{ id: number }, unknown, CuponInput>(res);
    ok(res, await service.actualizar(sessionUser(req).idUsuario, params.id, body));
  },
);

couponsRouter.delete(
  '/coupons/:id',
  ...admin,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    const { params } = valid<{ id: number }>(res);
    await service.desactivar(sessionUser(req).idUsuario, params.id);
    noContent(res);
  },
);
