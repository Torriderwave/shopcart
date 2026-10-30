import { z } from 'zod';
import { BoolQuerySchema, PaginationQuerySchema, SearchQuerySchema, sortQuery } from './common';

// ── Categorías ────────────────────────────────────────────────────────────────

export const CategoriaSchema = z.object({
  idCategoria: z.number().int(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  activo: z.boolean(),
  productosActivos: z.number().int(),
});
export type Categoria = z.infer<typeof CategoriaSchema>;

export const CategoriaInputSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(500).nullish(),
});
export type CategoriaInput = z.infer<typeof CategoriaInputSchema>;

export const CategoriaUpdateInputSchema = CategoriaInputSchema.extend({ activo: z.boolean() });
export type CategoriaUpdateInput = z.infer<typeof CategoriaUpdateInputSchema>;

export const ListarCategoriasQuerySchema = z.object({
  incluirInactivas: BoolQuerySchema.default(false),
});

// ── Variantes ─────────────────────────────────────────────────────────────────

/** Atributos de la variante, p. ej. { Talla: "M", Color: "Rojo" }. */
export const AtributosSchema = z
  .record(z.string().trim().min(1).max(30), z.string().trim().min(1).max(50))
  .refine((a) => Object.keys(a).length <= 10, { message: 'Máximo 10 atributos' });
export type Atributos = z.infer<typeof AtributosSchema>;

const SkuSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    'El SKU solo admite letras, números, punto, guion y guion bajo',
  )
  .transform((v) => v.toUpperCase());

export const PrecioSchema = z.number().min(0).max(9_999_999.99).multipleOf(0.01);

export const VarianteInputSchema = z.object({
  sku: SkuSchema,
  atributos: AtributosSchema.default({}),
  precio: PrecioSchema,
});
export type VarianteInput = z.infer<typeof VarianteInputSchema>;

export const VarianteUpdateInputSchema = VarianteInputSchema.extend({ activo: z.boolean() });
export type VarianteUpdateInput = z.infer<typeof VarianteUpdateInputSchema>;

export const VarianteSchema = z.object({
  idVariante: z.number().int(),
  sku: z.string(),
  atributos: AtributosSchema,
  precio: z.number(),
  disponible: z.number().int(),
  activo: z.boolean(),
});
export type Variante = z.infer<typeof VarianteSchema>;

// ── Imágenes ──────────────────────────────────────────────────────────────────

export const ImagenInputSchema = z.object({
  url: z.string().trim().url().max(500),
  orden: z.number().int().min(0).max(1000).default(0),
  esPrincipal: z.boolean().default(false),
});
export type ImagenInput = z.infer<typeof ImagenInputSchema>;

export const ImagenSchema = z.object({
  idImagen: z.number().int(),
  url: z.string(),
  orden: z.number().int(),
  esPrincipal: z.boolean(),
});
export type Imagen = z.infer<typeof ImagenSchema>;

// ── Productos ─────────────────────────────────────────────────────────────────

export const ProductoInputSchema = z.object({
  idCategoria: z.number().int().positive(),
  nombre: z.string().trim().min(2).max(150),
  descripcion: z.string().trim().max(2000).default(''),
});
export type ProductoInput = z.infer<typeof ProductoInputSchema>;

export const ProductoUpdateInputSchema = ProductoInputSchema.extend({ activo: z.boolean() });
export type ProductoUpdateInput = z.infer<typeof ProductoUpdateInputSchema>;

export const ProductoResumenSchema = z.object({
  idProducto: z.number().int(),
  nombre: z.string(),
  categoria: z.object({ idCategoria: z.number().int(), nombre: z.string() }),
  precioDesde: z.number().nullable(),
  precioHasta: z.number().nullable(),
  imagenPrincipal: z.string().nullable(),
  hayStock: z.boolean(),
  activo: z.boolean(),
});
export type ProductoResumen = z.infer<typeof ProductoResumenSchema>;

export const ProductoDetalleSchema = ProductoResumenSchema.extend({
  descripcion: z.string(),
  imagenes: z.array(ImagenSchema),
  variantes: z.array(VarianteSchema),
});
export type ProductoDetalle = z.infer<typeof ProductoDetalleSchema>;

export const PRODUCTOS_SORT = ['nombre', 'precio', 'recientes'] as const;
export const BuscarProductosQuerySchema = PaginationQuerySchema.extend({
  q: SearchQuerySchema.optional(),
  idCategoria: z.coerce.number().int().positive().optional(),
  precioMin: z.coerce.number().min(0).optional(),
  precioMax: z.coerce.number().min(0).optional(),
  soloDisponibles: BoolQuerySchema.default(false),
  incluirInactivos: BoolQuerySchema.default(false),
  sort: sortQuery(PRODUCTOS_SORT, 'nombre'),
}).refine(
  (v) => v.precioMin === undefined || v.precioMax === undefined || v.precioMin <= v.precioMax,
  {
    message: 'precioMin no puede ser mayor que precioMax',
    path: ['precioMin'],
  },
);
export type BuscarProductosQuery = z.infer<typeof BuscarProductosQuerySchema>;

export const ProductoDetalleQuerySchema = z.object({
  incluirInactivos: BoolQuerySchema.default(false),
});
