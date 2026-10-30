import { z } from 'zod';
import {
  EstadoPedidoSchema,
  FechaLocalSchema,
  PaginationQuerySchema,
  SearchQuerySchema,
  sortQuery,
  type EstadoPedido,
} from './common';
import { AtributosSchema } from './catalog';
import { CarritoSchema } from './cart';

/** Aristas manuales del flujo (Operador/Administrador). Espejo de PedidoTransiciones (mecanismo Manual). */
export const TRANSICIONES: Readonly<Record<EstadoPedido, readonly EstadoPedido[]>> = {
  Pagado: ['Preparando'],
  Preparando: ['Despachado'],
  Despachado: ['Entregado'],
  Entregado: [],
  Cancelado: [],
  DevueltoParcial: [],
  DevueltoTotal: [],
};

export const MetodoEnvioOpcionSchema = z.object({
  idMetodoEnvio: z.number().int(),
  nombre: z.string(),
  diasEstimados: z.number().int(),
  costo: z.number(),
  aplica: z.boolean(),
  total: z.number(),
  iva: z.number(),
});
export type MetodoEnvioOpcion = z.infer<typeof MetodoEnvioOpcionSchema>;

export const MetodoEnvioSchema = z.object({
  idMetodoEnvio: z.number().int(),
  nombre: z.string(),
  costo: z.number(),
  montoMinimo: z.number().nullable(),
  diasEstimados: z.number().int(),
});
export type MetodoEnvio = z.infer<typeof MetodoEnvioSchema>;

export const CheckoutSchema = z.object({
  carrito: CarritoSchema,
  opcionesEnvio: z.array(MetodoEnvioOpcionSchema),
});
export type Checkout = z.infer<typeof CheckoutSchema>;

export const CrearPedidoInputSchema = z.object({
  idDireccion: z.number().int().positive(),
  idMetodoEnvio: z.number().int().positive(),
  totalEsperado: z.number().min(0),
});
export type CrearPedidoInput = z.infer<typeof CrearPedidoInputSchema>;

export const PedidoResumenSchema = z.object({
  idPedido: z.number().int(),
  numeroPedido: z.string(),
  fechaCreacion: z.string(),
  estadoCodigo: EstadoPedidoSchema,
  estadoNombre: z.string(),
  total: z.number(),
  cantidadItems: z.number().int(),
});
export type PedidoResumen = z.infer<typeof PedidoResumenSchema>;

export const PedidoResumenAdminSchema = PedidoResumenSchema.extend({
  idUsuario: z.number().int(),
  clienteNombre: z.string(),
  clienteCorreo: z.string(),
});
export type PedidoResumenAdmin = z.infer<typeof PedidoResumenAdminSchema>;

export const PedidoLineaSchema = z.object({
  idPedidoLinea: z.number().int(),
  sku: z.string(),
  nombreProducto: z.string(),
  atributos: AtributosSchema,
  cantidad: z.number().int(),
  cantidadDevuelta: z.number().int(),
  precioUnitario: z.number(),
  descuentoLinea: z.number(),
  totalLinea: z.number(),
});
export type PedidoLinea = z.infer<typeof PedidoLineaSchema>;

export const PedidoHistorialSchema = z.object({
  estadoAnteriorCodigo: z.string().nullable(),
  estadoAnteriorNombre: z.string().nullable(),
  estadoNuevoCodigo: z.string(),
  estadoNuevoNombre: z.string(),
  usuario: z.string(),
  nota: z.string().nullable(),
  fecha: z.string(),
});
export type PedidoHistorial = z.infer<typeof PedidoHistorialSchema>;

export const DevolucionSchema = z.object({
  idDevolucion: z.number().int(),
  motivo: z.string(),
  montoTotal: z.number(),
  fecha: z.string(),
  usuario: z.string(),
  lineas: z.array(
    z.object({
      idPedidoLinea: z.number().int(),
      sku: z.string(),
      cantidad: z.number().int(),
      montoReembolso: z.number(),
    }),
  ),
});
export type Devolucion = z.infer<typeof DevolucionSchema>;

export const PedidoDetalleSchema = z.object({
  idPedido: z.number().int(),
  numeroPedido: z.string(),
  fechaCreacion: z.string(),
  estadoCodigo: EstadoPedidoSchema,
  estadoNombre: z.string(),
  cliente: z.object({ idUsuario: z.number().int(), nombre: z.string(), correo: z.string() }),
  direccion: z.object({
    destinatario: z.string(),
    linea1: z.string(),
    linea2: z.string().nullable(),
    ciudad: z.string(),
    departamento: z.string(),
    codigoPostal: z.string().nullable(),
    telefono: z.string(),
  }),
  metodoEnvio: z.string(),
  cuponCodigo: z.string().nullable(),
  subtotal: z.number(),
  descuento: z.number(),
  costoEnvio: z.number(),
  total: z.number(),
  /** IVA (12 %) ya incluido en `total`; solo informativo. */
  iva: z.number(),
  montoDevuelto: z.number(),
  cantidadItems: z.number().int(),
  /** true si la respuesta es de una repetición con la misma Idempotency-Key. */
  reutilizado: z.boolean(),
  lineas: z.array(PedidoLineaSchema),
  historial: z.array(PedidoHistorialSchema),
  devoluciones: z.array(DevolucionSchema),
  acciones: z.object({
    puedeCancelar: z.boolean(),
    puedeDevolver: z.boolean(),
    transiciones: z.array(EstadoPedidoSchema),
  }),
});
export type PedidoDetalle = z.infer<typeof PedidoDetalleSchema>;

export const PEDIDOS_SORT = ['fecha', 'total', 'numero', 'estado'] as const;
export const PEDIDOS_ADMIN_SORT = [...PEDIDOS_SORT, 'cliente'] as const;

const RangoFechasRefine = (q: { desde?: string | undefined; hasta?: string | undefined }) =>
  !q.desde || !q.hasta || q.desde <= q.hasta;
const RangoMsg = { path: ['hasta'], message: '"hasta" no puede ser anterior a "desde"' };

export const ListarPedidosQuerySchema = PaginationQuerySchema.extend({
  estado: EstadoPedidoSchema.optional(),
  desde: FechaLocalSchema.optional(),
  hasta: FechaLocalSchema.optional(),
  numero: SearchQuerySchema.optional(),
  sort: sortQuery(PEDIDOS_SORT, 'fecha'),
}).refine(RangoFechasRefine, RangoMsg);
export type ListarPedidosQuery = z.infer<typeof ListarPedidosQuerySchema>;

export const ListarPedidosAdminQuerySchema = PaginationQuerySchema.extend({
  estado: EstadoPedidoSchema.optional(),
  desde: FechaLocalSchema.optional(),
  hasta: FechaLocalSchema.optional(),
  numero: SearchQuerySchema.optional(),
  cliente: SearchQuerySchema.optional(),
  sort: sortQuery(PEDIDOS_ADMIN_SORT, 'fecha'),
}).refine(RangoFechasRefine, RangoMsg);
export type ListarPedidosAdminQuery = z.infer<typeof ListarPedidosAdminQuerySchema>;

export const CambiarEstadoInputSchema = z.object({
  estado: EstadoPedidoSchema,
  nota: z.string().trim().max(500).optional(),
});
export type CambiarEstadoInput = z.infer<typeof CambiarEstadoInputSchema>;

export const CancelarPedidoInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo es obligatorio').max(500),
});
export type CancelarPedidoInput = z.infer<typeof CancelarPedidoInputSchema>;

export const CrearDevolucionInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo es obligatorio').max(500),
  lineas: z
    .array(
      z.object({
        idPedidoLinea: z.number().int().positive(),
        cantidad: z.number().int().min(1).max(100_000),
      }),
    )
    .min(1),
});
export type CrearDevolucionInput = z.infer<typeof CrearDevolucionInputSchema>;
