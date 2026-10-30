import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { COOKIE_REFRESH, RolSchema, type Rol } from '@shopcart/contracts';
import { config } from './config';
import { AppError } from './errors';

export interface SessionUser {
  idUsuario: number;
  rol: Rol;
  nombre: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

// ── Contraseñas (argon2id) ────────────────────────────────────────────────────

export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id });

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
};

// ── Access token (JWT HS256, 15 min) ──────────────────────────────────────────

const AccessPayloadSchema = z.object({
  sub: z.string(),
  rol: RolSchema,
  nombre: z.string(),
});

export function signAccessToken(user: SessionUser): { token: string; expiraEn: string } {
  const ttlSeconds = config.JWT_ACCESS_TTL_MIN * 60;
  const token = jwt.sign({ rol: user.rol, nombre: user.nombre }, config.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.idUsuario),
    expiresIn: ttlSeconds,
  });
  return { token, expiraEn: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
}

export function verifyAccessToken(token: string): SessionUser {
  try {
    const payload = AccessPayloadSchema.parse(
      jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }),
    );
    return { idUsuario: Number(payload.sub), rol: payload.rol, nombre: payload.nombre };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRADO', 401, 'La sesión expiró.');
    }
    throw new AppError('NO_AUTENTICADO', 401, 'Token inválido.');
  }
}

// ── Refresh token (opaco, cookie httpOnly; en BD solo el hash) ────────────────

export const newRefreshToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.NODE_ENV === 'production',
  path: '/api/v1/auth',
});

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(COOKIE_REFRESH, token, {
    ...refreshCookieOptions(),
    maxAge: config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(COOKIE_REFRESH, refreshCookieOptions());
};

export const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[COOKIE_REFRESH];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

// ── Middlewares ───────────────────────────────────────────────────────────────

function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** 401 si no hay token válido. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw new AppError('NO_AUTENTICADO', 401, 'Se requiere iniciar sesión.');
  req.user = verifyAccessToken(token);
  next();
};

/** Identifica al usuario si hay token (carrito de invitado); un token inválido sigue siendo 401. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (token) req.user = verifyAccessToken(token);
  next();
};

/** 403 si el rol no está entre los permitidos. Úsalo después de `requireAuth`. */
export const requireRole =
  (...roles: Rol[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw new AppError('NO_AUTENTICADO', 401, 'Se requiere iniciar sesión.');
    if (!roles.includes(req.user.rol)) {
      throw new AppError('PROHIBIDO', 403, 'No tienes permiso para esta acción.');
    }
    next();
  };

/** Atajos de los roles del contrato (§9): O = Operador o Administrador, A = Administrador. */
export const ROLES_OPERADOR: Rol[] = ['Operador', 'Administrador'];
export const ROLES_ADMIN: Rol[] = ['Administrador'];
export const ROLES_CLIENTE: Rol[] = ['Cliente'];

/** Usuario de sesión garantizado (tras `requireAuth`). */
export function sessionUser(req: Request): SessionUser {
  if (!req.user) throw new AppError('NO_AUTENTICADO', 401, 'Se requiere iniciar sesión.');
  return req.user;
}
