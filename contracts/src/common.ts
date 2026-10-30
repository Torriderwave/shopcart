import { z } from 'zod';

// ── Roles y estados ───────────────────────────────────────────────────────────

export const ROLES = ['Cliente', 'Operador', 'Administrador'] as const;
export const RolSchema = z.enum(ROLES);
export type Rol = z.infer<typeof RolSchema>;

export const ESTADOS_PEDIDO = [
  'Pagado',
  'Preparando',
  'Despachado',
  'Entregado',
  'Cancelado',
  'DevueltoParcial',
  'DevueltoTotal',
] as const;
export const EstadoPedidoSchema = z.enum(ESTADOS_PEDIDO);
export type EstadoPedido = z.infer<typeof EstadoPedidoSchema>;

export const DEPARTAMENTOS = [
  'Alta Verapaz',
  'Baja Verapaz',
  'Chimaltenango',
  'Chiquimula',
  'El Progreso',
  'Escuintla',
  'Guatemala',
  'Huehuetenango',
  'Izabal',
  'Jalapa',
  'Jutiapa',
  'Petén',
  'Quetzaltenango',
  'Quiché',
  'Retalhuleu',
  'Sacatepéquez',
  'San Marcos',
  'Santa Rosa',
  'Sololá',
  'Suchitepéquez',
  'Totonicapán',
  'Zacapa',
] as const;
export const DepartamentoSchema = z.enum(DEPARTAMENTOS);
export type Departamento = z.infer<typeof DepartamentoSchema>;

// ── Códigos de error (ver ARQUITECTURA §5.9) ──────────────────────────────────

export const ERROR_CODES = [
  'VALIDACION',
  'NO_AUTENTICADO',
  'TOKEN_EXPIRADO',
  'REFRESH_INVALIDO',
  'CREDENCIALES_INVALIDAS',
  'PROHIBIDO',
  'IDEMPOTENCY_KEY_REQUERIDA',
  'DEMASIADAS_SOLICITUDES',
  'STOCK_INSUFICIENTE',
  'RESERVA_VENCIDA',
  'VARIANTE_INACTIVA',
  'CARRITO_VACIO',
  'CHECKOUT_NO_INICIADO',
  'CANTIDAD_EXCEDE_DISPONIBLE',
  'TOTAL_CAMBIO',
  'CUPON_INVALIDO',
  'CUPON_FUERA_VIGENCIA',
  'CUPON_MONTO_MINIMO',
  'CUPON_AGOTADO',
  'CUPON_LIMITE_CLIENTE',
  'CUPON_SIN_PRODUCTOS_ELEGIBLES',
  'TRANSICION_INVALIDA',
  'PEDIDO_NO_CANCELABLE',
  'DEVOLUCION_EXCEDE_VENDIDO',
  'DEVOLUCION_NO_PERMITIDA',
  'METODO_ENVIO_NO_APLICA',
  'DIRECCION_INVALIDA',
  'NO_ENCONTRADO',
  'EN_USO',
  'AJUSTE_INVALIDO',
  'DUPLICADO',
  'REFERENCIA_INVALIDA',
  'CONCURRENCIA',
  'INTERNO',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// ── Envelope de respuesta (ARQUITECTURA §5.2) ─────────────────────────────────

export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const ErrorDetailSchema = z.record(z.string(), z.unknown());

export const ErrorBodySchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(ErrorDetailSchema),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export type ApiResponse<T> = SuccessBody<T> | ErrorBody;

// ── Paginación y orden ────────────────────────────────────────────────────────

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** `sort=campo:asc|desc` validado contra una lista blanca propia de cada endpoint. */
export function sortQuery<const F extends readonly [string, ...string[]]>(
  allowed: F,
  fallback: F[number],
) {
  return z
    .string()
    .regex(/^[A-Za-z]+:(asc|desc)$/)
    .refine((v) => (allowed as readonly string[]).includes(v.split(':')[0] ?? ''), {
      message: `Campo de orden no permitido. Permitidos: ${allowed.join(', ')}`,
    })
    .default(`${fallback}:asc`)
    .transform((v) => {
      const [campo = fallback, direccion = 'asc'] = v.split(':');
      return { campo: campo as F[number], direccion: direccion as 'asc' | 'desc' };
    });
}

// ── Fechas y valores comunes ──────────────────────────────────────────────────

/** Filtros de rango: `YYYY-MM-DD` en hora de Guatemala, ambos extremos inclusivos. */
export const FechaLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');

export const UuidSchema = z.string().uuid();

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Booleano en query string: `true`/`false` (z.coerce.boolean() trataría "false" como true). */
export const BoolQuerySchema = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Texto de búsqueda libre: recortado, máx. 100 caracteres. */
export const SearchQuerySchema = z.string().trim().max(100);

// ── Sistema ───────────────────────────────────────────────────────────────────

export const HealthSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('up'),
});
export type Health = z.infer<typeof HealthSchema>;

// ── Cabeceras del contrato ────────────────────────────────────────────────────

export const HEADER_CART_TOKEN = 'x-cart-token';
export const HEADER_IDEMPOTENCY_KEY = 'idempotency-key';
export const COOKIE_REFRESH = 'sc_refresh';
