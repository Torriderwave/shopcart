import { z } from 'zod';
import {
  FechaLocalSchema,
  PaginationQuerySchema,
  SearchQuerySchema,
  BoolQuerySchema,
  sortQuery,
} from './common';
import { AtributosSchema } from './catalog';

export const TIPOS_MOVIMIENTO = [
  'Entrada',
  'Venta',
  'Ajuste',
  'Devolucion',
  'Cancelacion',
] as const;
export const TipoMovimientoSchema = z.enum(TIPOS_MOVIMIENTO);
export type TipoMovimiento = z.infer<typeof TipoMovimientoSchema>;

export const ExistenciaSchema = z.object({
  idVariante: z.number().int(),
  sku: z.string(),
  producto: z.string(),
  atributos: AtributosSchema,
  fisica: z.number().int(),
  reservada: z.number().int(),
  disponible: z.number().int(),
});
export type Existencia = z.infer<typeof ExistenciaSchema>;

export const ExistenciaListadoSchema = ExistenciaSchema.extend({
  idCategoria: z.number().int(),
  categoria: z.string(),
  varianteActiva: z.boolean(),
});
export type ExistenciaListado = z.infer<typeof ExistenciaListadoSchema>;

export const EXISTENCIAS_SORT = ['sku', 'producto', 'fisica', 'disponible'] as const;
export const ListarExistenciasQuerySchema = PaginationQuerySchema.extend({
  q: SearchQuerySchema.optional(),
  idCategoria: z.coerce.number().int().positive().optional(),
  soloSinStock: BoolQuerySchema.default(false),
  sort: sortQuery(EXISTENCIAS_SORT, 'sku'),
});
export type ListarExistenciasQuery = z.infer<typeof ListarExistenciasQuerySchema>;

const MotivoSchema = z.string().trim().min(3, 'El motivo es obligatorio').max(200);

export const EntradaInputSchema = z.object({
  idVariante: z.number().int().positive(),
  cantidad: z.number().int().min(1).max(1_000_000),
  motivo: MotivoSchema,
});
export type EntradaInput = z.infer<typeof EntradaInputSchema>;

/** `cantidad` es un delta con signo: positivo suma, negativo resta. */
export const AjusteInputSchema = z.object({
  idVariante: z.number().int().positive(),
  cantidad: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0, 'El ajuste no puede ser cero'),
  motivo: MotivoSchema,
});
export type AjusteInput = z.infer<typeof AjusteInputSchema>;

export const KardexQuerySchema = PaginationQuerySchema.extend({
  tipo: TipoMovimientoSchema.optional(),
  desde: FechaLocalSchema.optional(),
  hasta: FechaLocalSchema.optional(),
});
export type KardexQuery = z.infer<typeof KardexQuerySchema>;

export const MovimientoKardexSchema = z.object({
  idKardex: z.number().int(),
  fecha: z.string(),
  tipo: TipoMovimientoSchema,
  cantidad: z.number().int(),
  resultante: z.number().int(),
  motivo: z.string(),
  usuario: z.string(),
  numeroPedido: z.string().nullable(),
});
export type MovimientoKardex = z.infer<typeof MovimientoKardexSchema>;

export const KardexResponseSchema = z.object({
  variante: ExistenciaSchema,
  movimientos: z.array(MovimientoKardexSchema),
});
export type KardexResponse = z.infer<typeof KardexResponseSchema>;
