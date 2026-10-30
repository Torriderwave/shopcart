import { Router } from 'express';
import {
  CambiarEstadoInputSchema,
  CancelarPedidoInputSchema,
  CrearDevolucionInputSchema,
  CrearPedidoInputSchema,
  IdParamSchema,
  ListarPedidosAdminQuerySchema,
  ListarPedidosQuerySchema,
  type CambiarEstadoInput,
  type CancelarPedidoInput,
  type CrearDevolucionInput,
  type CrearPedidoInput,
  type ListarPedidosAdminQuery,
  type ListarPedidosQuery,
} from '@shopcart/contracts';
import {
  requireAuth,
  requireRole,
  ROLES_CLIENTE,
  ROLES_OPERADOR,
  sessionUser,
} from '../../shared/auth';
import { idempotencyKey, noContent, ok, paged, valid, validate } from '../../shared/http';
import * as service from './orders.service';

export const ordersRouter = Router();

const cliente = [requireAuth, requireRole(...ROLES_CLIENTE)];
const operador = [requireAuth, requireRole(...ROLES_OPERADOR)];

type IdParams = { id: number };

ordersRouter.get('/shipping-methods', async (_req, res) => {
  ok(res, await service.listarMetodosEnvio());
});

// ── Checkout ──────────────────────────────────────────────────────────────────

ordersRouter.post('/checkout', ...cliente, async (req, res) => {
  ok(res, await service.iniciarCheckout(sessionUser(req).idUsuario));
});

ordersRouter.get('/checkout', ...cliente, async (req, res) => {
  ok(res, await service.obtenerCheckout(sessionUser(req).idUsuario));
});

ordersRouter.delete('/checkout', ...cliente, async (req, res) => {
  await service.cancelarCheckout(sessionUser(req).idUsuario);
  noContent(res);
});

ordersRouter.post(
  '/orders',
  ...cliente,
  validate({ body: CrearPedidoInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, CrearPedidoInput>(res);
    const pedido = await service.crearPedido(sessionUser(req).idUsuario, body, idempotencyKey(req));
    // 201 al crear; 200 si es la repetición de una solicitud ya procesada.
    ok(res, pedido, pedido.reutilizado ? 200 : 201);
  },
);

// ── Pedidos del cliente ───────────────────────────────────────────────────────

ordersRouter.get(
  '/orders/mine',
  ...cliente,
  validate({ query: ListarPedidosQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarPedidosQuery>(res);
    const { items, total } = await service.listarPorUsuario(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

// ── Operación (Operador / Administrador) ──────────────────────────────────────

ordersRouter.get(
  '/orders',
  ...operador,
  validate({ query: ListarPedidosAdminQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarPedidosAdminQuery>(res);
    const { items, total } = await service.listarAdmin(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

// Cliente (solo el suyo) u Operador/Administrador: el SP aplica la propiedad.
ordersRouter.get(
  '/orders/:id',
  requireAuth,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    const { params } = valid<IdParams>(res);
    ok(res, await service.obtenerPorId(sessionUser(req).idUsuario, params.id));
  },
);

ordersRouter.patch(
  '/orders/:id/status',
  ...operador,
  validate({ params: IdParamSchema, body: CambiarEstadoInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, CambiarEstadoInput>(res);
    ok(res, await service.cambiarEstado(sessionUser(req).idUsuario, params.id, body));
  },
);

ordersRouter.post(
  '/orders/:id/cancel',
  requireAuth,
  validate({ params: IdParamSchema, body: CancelarPedidoInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, CancelarPedidoInput>(res);
    ok(res, await service.cancelar(sessionUser(req).idUsuario, params.id, body.motivo));
  },
);

ordersRouter.post(
  '/orders/:id/returns',
  ...operador,
  validate({ params: IdParamSchema, body: CrearDevolucionInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, CrearDevolucionInput>(res);
    ok(res, await service.crearDevolucion(sessionUser(req).idUsuario, params.id, body), 201);
  },
);
