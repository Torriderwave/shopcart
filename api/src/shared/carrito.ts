import type { Atributos, Carrito, CarritoLinea } from '@shopcart/contracts';
import { iso, type Row } from './db';

// Mapeo común del carrito (carrito y checkout devuelven el mismo formato).

function parseAtributos(json: unknown): Atributos {
  try {
    return JSON.parse(String(json)) as Atributos;
  } catch {
    return {};
  }
}

const toLinea = (r: Row): CarritoLinea => ({
  idCarritoLinea: r.idCarritoLinea as number,
  idVariante: r.idVariante as number,
  idProducto: r.idProducto as number,
  sku: r.sku as string,
  nombreProducto: r.nombreProducto as string,
  atributos: parseAtributos(r.atributosJson),
  imagen: (r.imagen as string | null) ?? null,
  precioUnitario: Number(r.precioUnitario),
  cantidad: r.cantidad as number,
  disponible: r.disponible as number,
  totalLinea: Number(r.totalLinea),
  problema: (r.problema as CarritoLinea['problema']) ?? null,
});

/** Convierte los 2 recordsets de SP_Carrito_ObtenerDetalle. Lo reutiliza el checkout (mismo formato). */
export function toCarrito(rs: Row[][], offset = 0): Carrito {
  const h = rs[offset]![0]!;
  return {
    idCarrito: h.idCarrito as number,
    tokenInvitado: h.tokenInvitado ? String(h.tokenInvitado).toLowerCase() : null,
    subtotal: Number(h.subtotal),
    descuento: Number(h.descuento),
    total: Number(h.total),
    iva: Number(h.iva),
    cuponCodigo: (h.cuponCodigo as string | null) ?? null,
    cuponValido:
      h.cuponValido === null || h.cuponValido === undefined ? null : Boolean(h.cuponValido),
    cuponMotivo: (h.cuponMotivo as string | null) ?? null,
    cuponMensaje: (h.cuponMensaje as string | null) ?? null,
    cantidadItems: Number(h.cantidadItems),
    reservaExpiraEn: h.reservaExpiraEn ? iso(h.reservaExpiraEn) : null,
    lineas: (rs[offset + 1] ?? []).map(toLinea),
  };
}

export const carritoVacio = (): Carrito => ({
  idCarrito: null,
  tokenInvitado: null,
  subtotal: 0,
  descuento: 0,
  total: 0,
  iva: 0,
  cuponCodigo: null,
  cuponValido: null,
  cuponMotivo: null,
  cuponMensaje: null,
  cantidadItems: 0,
  reservaExpiraEn: null,
  lineas: [],
});
