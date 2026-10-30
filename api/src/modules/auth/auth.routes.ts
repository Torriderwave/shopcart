import { Router, type Response } from 'express';
import {
  ActualizarUsuarioInputSchema,
  CrearUsuarioInputSchema,
  DireccionInputSchema,
  IdParamSchema,
  ListarUsuariosQuerySchema,
  LoginInputSchema,
  RegisterInputSchema,
  type ActualizarUsuarioInput,
  type CrearUsuarioInput,
  type DireccionInput,
  type ListarUsuariosQuery,
  type LoginInput,
  type RegisterInput,
} from '@shopcart/contracts';
import {
  clearRefreshCookie,
  readRefreshCookie,
  requireAuth,
  requireRole,
  ROLES_ADMIN,
  ROLES_CLIENTE,
  sessionUser,
  setRefreshCookie,
} from '../../shared/auth';
import { AppError } from '../../shared/errors';
import { authRateLimit, cartToken, noContent, ok, paged, valid, validate } from '../../shared/http';
import * as service from './auth.service';

export const authRouter = Router();

type IdParams = { id: number };

function sendSession(res: Response, session: service.Session, status = 200): void {
  setRefreshCookie(res, session.refreshToken);
  ok(res, session.auth, status);
}

// ── Sesión ────────────────────────────────────────────────────────────────────

authRouter.post(
  '/auth/register',
  authRateLimit,
  validate({ body: RegisterInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, RegisterInput>(res);
    sendSession(res, await service.register(body, cartToken(req)), 201);
  },
);

authRouter.post(
  '/auth/login',
  authRateLimit,
  validate({ body: LoginInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, LoginInput>(res);
    sendSession(res, await service.login(body, cartToken(req)));
  },
);

authRouter.post('/auth/refresh', authRateLimit, async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) throw new AppError('REFRESH_INVALIDO', 401, 'No hay sesión que renovar.');
  try {
    sendSession(res, await service.refresh(token));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

authRouter.post('/auth/logout', async (req, res) => {
  const token = readRefreshCookie(req);
  if (token) await service.logout(token);
  clearRefreshCookie(res);
  noContent(res);
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  ok(res, await service.me(sessionUser(req).idUsuario));
});

// ── Direcciones del cliente ───────────────────────────────────────────────────

const clienteOnly = [requireAuth, requireRole(...ROLES_CLIENTE)];

authRouter.get('/me/direcciones', ...clienteOnly, async (req, res) => {
  ok(res, await service.listarDirecciones(sessionUser(req).idUsuario));
});

authRouter.post(
  '/me/direcciones',
  ...clienteOnly,
  validate({ body: DireccionInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, DireccionInput>(res);
    ok(res, await service.crearDireccion(sessionUser(req).idUsuario, body), 201);
  },
);

authRouter.put(
  '/me/direcciones/:id',
  ...clienteOnly,
  validate({ params: IdParamSchema, body: DireccionInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, DireccionInput>(res);
    ok(res, await service.actualizarDireccion(sessionUser(req).idUsuario, params.id, body));
  },
);

authRouter.delete(
  '/me/direcciones/:id',
  ...clienteOnly,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    const { params } = valid<IdParams>(res);
    await service.desactivarDireccion(sessionUser(req).idUsuario, params.id);
    noContent(res);
  },
);

// ── Usuarios (Administrador) ──────────────────────────────────────────────────

const adminOnly = [requireAuth, requireRole(...ROLES_ADMIN)];

authRouter.get(
  '/admin/usuarios',
  ...adminOnly,
  validate({ query: ListarUsuariosQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, ListarUsuariosQuery>(res);
    const { items, total } = await service.listarUsuarios(sessionUser(req).idUsuario, query);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

authRouter.post(
  '/admin/usuarios',
  ...adminOnly,
  validate({ body: CrearUsuarioInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, CrearUsuarioInput>(res);
    ok(res, await service.crearUsuario(sessionUser(req).idUsuario, body), 201);
  },
);

authRouter.patch(
  '/admin/usuarios/:id',
  ...adminOnly,
  validate({ params: IdParamSchema, body: ActualizarUsuarioInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, ActualizarUsuarioInput>(res);
    ok(res, await service.actualizarUsuario(sessionUser(req).idUsuario, params.id, body));
  },
);
