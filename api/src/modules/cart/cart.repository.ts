import type { Carrito } from '@shopcart/contracts';
import { executeSp, p, T, type SpResult } from '../../shared/db';
import { toCarrito } from '../../shared/carrito';

export interface CarritoRef {
  idCarrito: number | null;
  token: string | null;
}

export async function resolverPorUsuario(idUsuario: number, crear: boolean): Promise<CarritoRef> {
  const r = await executeSp('SP_Carrito_ObtenerOCrearPorUsuario', {
    IDUsuario: p(T.Int, idUsuario),
    Crear: p(T.Bit, crear),
  });
  return { idCarrito: (r.recordsets[0]?.[0]?.idCarrito as number | null) ?? null, token: null };
}

export async function resolverPorToken(
  token: string | undefined,
  crear: boolean,
): Promise<CarritoRef> {
  const r = await executeSp('SP_Carrito_ObtenerOCrearPorToken', {
    TokenInvitado: p(T.UniqueIdentifier, token ?? null),
    Crear: p(T.Bit, crear),
  });
  const row = r.recordsets[0]?.[0];
  return {
    idCarrito: (row?.idCarrito as number | null) ?? null,
    token: row?.tokenInvitado ? String(row.tokenInvitado).toLowerCase() : null,
  };
}

const detalle = (r: SpResult): Carrito => toCarrito(r.recordsets);

export async function obtenerDetalle(idCarrito: number): Promise<Carrito> {
  return detalle(await executeSp('SP_Carrito_ObtenerDetalle', { IDCarrito: p(T.Int, idCarrito) }));
}

export async function agregarLinea(
  idCarrito: number,
  idVariante: number,
  cantidad: number,
): Promise<Carrito> {
  return detalle(
    await executeSp('SP_Carrito_AgregarLinea', {
      IDCarrito: p(T.Int, idCarrito),
      IDVariante: p(T.Int, idVariante),
      Cantidad: p(T.Int, cantidad),
    }),
  );
}

export async function actualizarCantidad(
  idCarrito: number,
  idLinea: number,
  cantidad: number,
): Promise<Carrito> {
  return detalle(
    await executeSp('SP_Carrito_ActualizarCantidad', {
      IDCarrito: p(T.Int, idCarrito),
      IDCarritoLinea: p(T.Int, idLinea),
      Cantidad: p(T.Int, cantidad),
    }),
  );
}

export async function eliminarLinea(idCarrito: number, idLinea: number): Promise<Carrito> {
  return detalle(
    await executeSp('SP_Carrito_EliminarLinea', {
      IDCarrito: p(T.Int, idCarrito),
      IDCarritoLinea: p(T.Int, idLinea),
    }),
  );
}

export async function aplicarCupon(idCarrito: number, codigo: string): Promise<Carrito> {
  return detalle(
    await executeSp('SP_Carrito_AplicarCupon', {
      IDCarrito: p(T.Int, idCarrito),
      Codigo: p(T.NVarChar(30), codigo),
    }),
  );
}

export async function quitarCupon(idCarrito: number): Promise<Carrito> {
  return detalle(await executeSp('SP_Carrito_QuitarCupon', { IDCarrito: p(T.Int, idCarrito) }));
}
