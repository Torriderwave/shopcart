import { Router } from 'express';
import {
  AjusteInputSchema,
  EntradaInputSchema,
  IdParamSchema,
  KardexQuerySchema,
  ListarExistenciasQuerySchema,
  type AjusteInput,
  type EntradaInput,
  type KardexQuery,
  type ListarExistenciasQuery,
} from '@shopcart/contracts';
import { requireAuth, requireRole, ROLES_OPERADOR, sessionUser } from '../../shared/auth';
import { ok, paged, valid, validate } from '../../shared/http';
import * as service from './inventory.service';

export const inventoryRouter = Router();

const operadorUp = [requireAuth, requireRole(...ROLES_OPERADOR)];

inventoryRouter.get(
  '/inventory/existencias',
  ...operadorUp,
  validate({ query: ListarExistenciasQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarExistenciasQuery>(res);
    const { items, total } = await service.listarExistencias(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

inventoryRouter.get(
  '/inventory/variantes/:id/kardex',
  ...operadorUp,
  validate({ params: IdParamSchema, query: KardexQuerySchema }),
  async (req, res) => {
    const { params, query } = valid<{ id: number }, KardexQuery>(res);
    const { data, total } = await service.obtenerKardex(
      sessionUser(req).idUsuario,
      params.id,
      query,
    );
    res.json({ success: true, data, meta: { page: query.page, pageSize: query.pageSize, total } });
  },
);

inventoryRouter.post(
  '/inventory/entradas',
  ...operadorUp,
  validate({ body: EntradaInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, EntradaInput>(res);
    ok(res, await service.registrarEntrada(sessionUser(req).idUsuario, body), 201);
  },
);

inventoryRouter.post(
  '/inventory/ajustes',
  ...operadorUp,
  validate({ body: AjusteInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, AjusteInput>(res);
    ok(res, await service.registrarAjuste(sessionUser(req).idUsuario, body), 201);
  },
);
