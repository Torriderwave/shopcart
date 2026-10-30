import type { Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ZodType } from 'zod';
import {
  HEADER_CART_TOKEN,
  HEADER_IDEMPOTENCY_KEY,
  UuidSchema,
  type PaginationMeta,
  type SuccessBody,
} from '@shopcart/contracts';
import { config } from './config';
import { AppError } from './errors';

// ── Respuestas ────────────────────────────────────────────────────────────────

export function ok<T>(res: Response, data: T, status = 200): void {
  const body: SuccessBody<T> = { success: true, data };
  res.status(status).json(body);
}

export function paged<T>(res: Response, data: T[], meta: PaginationMeta): void {
  const body: SuccessBody<T[]> = { success: true, data, meta };
  res.status(200).json(body);
}

export const noContent = (res: Response): void => {
  res.status(204).end();
};

// ── Validación con los esquemas de `contracts` ────────────────────────────────

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

/**
 * Valida y deja el resultado parseado en `res.locals.valid` (Express 5: `req.query` es de solo
 * lectura). Los errores zod los convierte `errorHandler` en `VALIDACION` 400.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    res.locals.valid = {
      params: schemas.params?.parse(req.params),
      query: schemas.query?.parse(req.query),
      body: schemas.body?.parse(req.body),
    };
    next();
  };

export interface Valid<P = unknown, Q = unknown, B = unknown> {
  params: P;
  query: Q;
  body: B;
}

export const valid = <P = unknown, Q = unknown, B = unknown>(res: Response): Valid<P, Q, B> =>
  res.locals.valid as Valid<P, Q, B>;

// ── Cabeceras del contrato ────────────────────────────────────────────────────

/** `X-Cart-Token` del carrito de invitado (UUID); undefined si no viene. */
export function cartToken(req: Request): string | undefined {
  const raw = req.header(HEADER_CART_TOKEN);
  if (!raw) return undefined;
  const parsed = UuidSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('VALIDACION', 400, 'X-Cart-Token debe ser un UUID.');
  return parsed.data;
}

/** `Idempotency-Key` obligatorio (UUID) para pagar. */
export function idempotencyKey(req: Request): string {
  const raw = req.header(HEADER_IDEMPOTENCY_KEY);
  if (!raw)
    throw new AppError('IDEMPOTENCY_KEY_REQUERIDA', 400, 'Falta la cabecera Idempotency-Key.');
  const parsed = UuidSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('VALIDACION', 400, 'Idempotency-Key debe ser un UUID.');
  return parsed.data;
}

// ── Rate limiting (extra del enunciado: endpoints de autenticación) ───────────

export const authRateLimit: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_AUTH_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  handler: (_req, _res, next) =>
    next(new AppError('DEMASIADAS_SOLICITUDES', 429, 'Demasiados intentos. Espera un minuto.')),
});
