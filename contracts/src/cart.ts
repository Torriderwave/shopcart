import { z } from 'zod';
import { AtributosSchema } from './catalog';

export const PROBLEMAS_LINEA = ['INACTIVA', 'SIN_STOCK', 'EXCEDE_DISPONIBLE'] as const;

export const CarritoLineaSchema = z.object({
  idCarritoLinea: z.number().int(),
  idVariante: z.number().int(),
  idProducto: z.number().int(),
  sku: z.string(),
  nombreProducto: z.string(),
  atributos: AtributosSchema,
  imagen: z.string().nullable(),
  precioUnitario: z.number(),
  cantidad: z.number().int(),
  disponible: z.number().int(),
  totalLinea: z.number(),
  problema: z.enum(PROBLEMAS_LINEA).nullable(),
});
export type CarritoLinea = z.infer<typeof CarritoLineaSchema>;

export const CarritoSchema = z.object({
  idCarrito: z.number().int().nullable(),
  /** Solo en carritos de invitado: el cliente lo guarda y lo envía en `X-Cart-Token`. */
  tokenInvitado: z.string().nullable(),
  subtotal: z.number(),
  descuento: z.number(),
  total: z.number(),
  /** IVA (12 %) ya incluido en `total`; solo informativo. */
  iva: z.number(),
  cuponCodigo: z.string().nullable(),
  cuponValido: z.boolean().nullable(),
  cuponMotivo: z.string().nullable(),
  cuponMensaje: z.string().nullable(),
  cantidadItems: z.number().int(),
  reservaExpiraEn: z.string().nullable(),
  lineas: z.array(CarritoLineaSchema),
});
export type Carrito = z.infer<typeof CarritoSchema>;

export const AgregarLineaInputSchema = z.object({
  idVariante: z.number().int().positive(),
  cantidad: z.number().int().min(1).max(1000),
});
export type AgregarLineaInput = z.infer<typeof AgregarLineaInputSchema>;

export const ActualizarCantidadInputSchema = z.object({
  cantidad: z.number().int().min(1).max(1000),
});
export type ActualizarCantidadInput = z.infer<typeof ActualizarCantidadInputSchema>;

export const AplicarCuponInputSchema = z.object({
  codigo: z.string().trim().min(1).max(30),
});
export type AplicarCuponInput = z.infer<typeof AplicarCuponInputSchema>;
