import { z } from 'zod';
import { BoolQuerySchema, PaginationQuerySchema, SearchQuerySchema, sortQuery } from './common';

export const TIPOS_CUPON = ['Porcentaje', 'Fijo'] as const;

export const CuponSchema = z.object({
  idCupon: z.number().int(),
  codigo: z.string(),
  tipo: z.enum(TIPOS_CUPON),
  valor: z.number(),
  montoMinimo: z.number(),
  usosTotalesMax: z.number().int(),
  usosTotalesActual: z.number().int(),
  usosPorCliente: z.number().int(),
  idCategoria: z.number().int().nullable(),
  categoria: z.string().nullable(),
  vigenteDesde: z.string(),
  vigenteHasta: z.string(),
  activo: z.boolean(),
  vigente: z.boolean(),
});
export type Cupon = z.infer<typeof CuponSchema>;

export const CuponInputSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, 'Código: 3-30 caracteres A-Z, 0-9, guion o guion bajo'),
    tipo: z.enum(TIPOS_CUPON),
    valor: z.number().positive().max(1_000_000),
    montoMinimo: z.number().min(0).max(1_000_000).default(0),
    usosTotalesMax: z.number().int().min(1).max(1_000_000),
    usosPorCliente: z.number().int().min(1).max(1000),
    idCategoria: z.number().int().positive().nullable().default(null),
    vigenteDesde: z.coerce.date(),
    vigenteHasta: z.coerce.date(),
    activo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== 'Porcentaje' || c.valor <= 100, {
    path: ['valor'],
    message: 'El porcentaje no puede superar 100',
  })
  .refine((c) => c.vigenteDesde < c.vigenteHasta, {
    path: ['vigenteHasta'],
    message: 'La vigencia final debe ser posterior a la inicial',
  });
export type CuponInput = z.infer<typeof CuponInputSchema>;

export const CUPONES_SORT = ['codigo', 'valor', 'usos', 'hasta'] as const;
export const ListarCuponesQuerySchema = PaginationQuerySchema.extend({
  q: SearchQuerySchema.optional(),
  activo: BoolQuerySchema.optional(),
  vigente: BoolQuerySchema.optional(),
  sort: sortQuery(CUPONES_SORT, 'codigo'),
});
export type ListarCuponesQuery = z.infer<typeof ListarCuponesQuerySchema>;
