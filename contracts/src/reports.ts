import { z } from 'zod';
import { FechaLocalSchema, PaginationQuerySchema } from './common';

/** Rango en fecha local de Guatemala; sin valores = últimos 30 días hasta hoy. */
export const RangoQuerySchema = z
  .object({ desde: FechaLocalSchema.optional(), hasta: FechaLocalSchema.optional() })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
    path: ['hasta'],
    message: '"hasta" no puede ser anterior a "desde"',
  });
export type RangoQuery = z.infer<typeof RangoQuerySchema>;

export const KpisSchema = z.object({
  ventasNetas: z.number(),
  pedidos: z.number().int(),
  ticketPromedio: z.number(),
  unidades: z.number().int(),
  montoDevuelto: z.number(),
  desde: z.string(),
  hasta: z.string(),
});
export type Kpis = z.infer<typeof KpisSchema>;

export const AGRUPACIONES = ['dia', 'semana', 'mes'] as const;
export const VentasQuerySchema = z
  .object({
    desde: FechaLocalSchema.optional(),
    hasta: FechaLocalSchema.optional(),
    agrupacion: z.enum(AGRUPACIONES).default('dia'),
  })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
    path: ['hasta'],
    message: '"hasta" no puede ser anterior a "desde"',
  });
export type VentasQuery = z.infer<typeof VentasQuerySchema>;

export const VentaPeriodoSchema = z.object({
  /** Inicio del período (YYYY-MM-DD): el día, el lunes de la semana ISO o el día 1 del mes. */
  periodo: z.string(),
  ventasNetas: z.number(),
  pedidos: z.number().int(),
});
export type VentaPeriodo = z.infer<typeof VentaPeriodoSchema>;

export const VentaCategoriaSchema = z.object({
  idCategoria: z.number().int(),
  categoria: z.string(),
  ventasNetas: z.number(),
  unidades: z.number().int(),
  pedidos: z.number().int(),
});
export type VentaCategoria = z.infer<typeof VentaCategoriaSchema>;

export const TopProductosQuerySchema = z
  .object({
    desde: FechaLocalSchema.optional(),
    hasta: FechaLocalSchema.optional(),
    limite: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
    path: ['hasta'],
    message: '"hasta" no puede ser anterior a "desde"',
  });
export type TopProductosQuery = z.infer<typeof TopProductosQuerySchema>;

export const TopProductoSchema = z.object({
  idProducto: z.number().int(),
  producto: z.string(),
  unidades: z.number().int(),
  ventasNetas: z.number(),
});
export type TopProducto = z.infer<typeof TopProductoSchema>;

export const CarritoAbandonadoSchema = z.object({
  idCarrito: z.number().int(),
  cliente: z.string().nullable(),
  correoCliente: z.string().nullable(),
  items: z.number().int(),
  subtotal: z.number(),
  ultimaActividad: z.string(),
});
export type CarritoAbandonado = z.infer<typeof CarritoAbandonadoSchema>;

export const ACCIONES_BITACORA = ['Alta', 'Cambio', 'Baja', 'Movimiento', 'Transicion'] as const;
export const ListarBitacoraQuerySchema = PaginationQuerySchema.extend({
  modulo: z.string().trim().max(30).optional(),
  entidad: z.string().trim().max(50).optional(),
  idUsuario: z.coerce.number().int().positive().optional(),
  accion: z.enum(ACCIONES_BITACORA).optional(),
  desde: FechaLocalSchema.optional(),
  hasta: FechaLocalSchema.optional(),
}).refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
  path: ['hasta'],
  message: '"hasta" no puede ser anterior a "desde"',
});
export type ListarBitacoraQuery = z.infer<typeof ListarBitacoraQuerySchema>;

export const EntradaBitacoraSchema = z.object({
  idBitacora: z.number().int(),
  fecha: z.string(),
  usuario: z.string(),
  idUsuario: z.number().int().nullable(),
  modulo: z.string(),
  entidad: z.string(),
  idEntidad: z.number().int(),
  accion: z.enum(ACCIONES_BITACORA),
  valorAnterior: z.record(z.string(), z.unknown()).nullable(),
  valorNuevo: z.record(z.string(), z.unknown()).nullable(),
});
export type EntradaBitacora = z.infer<typeof EntradaBitacoraSchema>;
