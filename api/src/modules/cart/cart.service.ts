import type {
  ActualizarCantidadInput,
  AgregarLineaInput,
  Carrito,
  UsuarioSesion,
} from '@shopcart/contracts';
import { carritoVacio } from '../../shared/carrito';
import { AppError } from '../../shared/errors';
import * as repo from './cart.repository';

/** Quién es el dueño del carrito: usuario autenticado (Cliente) o invitado por X-Cart-Token. */
export interface Identidad {
  usuario?: Pick<UsuarioSesion, 'idUsuario' | 'rol'> | undefined;
  token?: string | undefined;
}

async function resolver(id: Identidad, crear: boolean): Promise<repo.CarritoRef> {
  if (id.usuario) {
    if (id.usuario.rol !== 'Cliente') {
      throw new AppError('PROHIBIDO', 403, 'Solo los clientes tienen carrito de compras.');
    }
    return repo.resolverPorUsuario(id.usuario.idUsuario, crear);
  }
  return repo.resolverPorToken(id.token, crear);
}

/** El token de invitado viaja en el cuerpo para que el cliente lo guarde la primera vez. */
const conToken = (c: Carrito, ref: repo.CarritoRef): Carrito =>
  ref.token ? { ...c, tokenInvitado: ref.token } : c;

async function existente(id: Identidad): Promise<number> {
  const ref = await resolver(id, false);
  if (ref.idCarrito === null) throw new AppError('NO_ENCONTRADO', 404, 'El carrito no existe.');
  return ref.idCarrito;
}

export async function obtener(id: Identidad): Promise<Carrito> {
  const ref = await resolver(id, false);
  if (ref.idCarrito === null) return carritoVacio();
  return conToken(await repo.obtenerDetalle(ref.idCarrito), ref);
}

export async function agregarLinea(id: Identidad, input: AgregarLineaInput): Promise<Carrito> {
  const ref = await resolver(id, true);
  return conToken(await repo.agregarLinea(ref.idCarrito!, input.idVariante, input.cantidad), ref);
}

export async function actualizarCantidad(
  id: Identidad,
  idLinea: number,
  input: ActualizarCantidadInput,
): Promise<Carrito> {
  return repo.actualizarCantidad(await existente(id), idLinea, input.cantidad);
}

export async function eliminarLinea(id: Identidad, idLinea: number): Promise<Carrito> {
  return repo.eliminarLinea(await existente(id), idLinea);
}

export async function aplicarCupon(id: Identidad, codigo: string): Promise<Carrito> {
  return repo.aplicarCupon(await existente(id), codigo);
}

export async function quitarCupon(id: Identidad): Promise<Carrito> {
  return repo.quitarCupon(await existente(id));
}
