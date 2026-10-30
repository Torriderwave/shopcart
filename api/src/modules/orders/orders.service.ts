import {
  TRANSICIONES,
  type CambiarEstadoInput,
  type Checkout,
  type CrearDevolucionInput,
  type CrearPedidoInput,
  type ListarPedidosAdminQuery,
  type ListarPedidosQuery,
  type MetodoEnvio,
  type PedidoDetalle,
  type PedidoResumen,
  type PedidoResumenAdmin,
} from '@shopcart/contracts';
import { config } from '../../shared/config';
import { AppError } from '../../shared/errors';
import * as repo from './orders.repository';

export const listarMetodosEnvio = (): Promise<MetodoEnvio[]> => repo.listarMetodosEnvio();

// ── Checkout (Cliente) ────────────────────────────────────────────────────────

export const iniciarCheckout = (idSesion: number): Promise<Checkout> =>
  repo.iniciarCheckout(idSesion, config.RESERVA_TTL_MIN);

export const obtenerCheckout = (idSesion: number): Promise<Checkout> =>
  repo.obtenerCheckout(idSesion);

export const cancelarCheckout = (idSesion: number): Promise<void> =>
  repo.cancelarCheckout(idSesion);

export const crearPedido = (
  idSesion: number,
  input: CrearPedidoInput,
  llave: string,
): Promise<PedidoDetalle> =>
  repo.crearPedido(idSesion, input.idDireccion, input.idMetodoEnvio, input.totalEsperado, llave);

// ── Pedidos ───────────────────────────────────────────────────────────────────

export const obtenerPorId = (idSesion: number, idPedido: number): Promise<PedidoDetalle> =>
  repo.obtenerPorId(idSesion, idPedido);

export const listarPorUsuario = (
  idSesion: number,
  q: ListarPedidosQuery,
): Promise<{ items: PedidoResumen[]; total: number }> => repo.listarPorUsuario(idSesion, q);

export const listarAdmin = (
  idSesion: number,
  q: ListarPedidosAdminQuery,
): Promise<{ items: PedidoResumenAdmin[]; total: number }> => repo.listarAdmin(idSesion, q);

/**
 * La transición se valida aquí (respuesta rápida sin tocar la BD) y otra vez en el SP,
 * que es la autoridad: llamar al SP directamente tampoco permite saltarse el flujo.
 */
export async function cambiarEstado(
  idSesion: number,
  idPedido: number,
  input: CambiarEstadoInput,
): Promise<PedidoDetalle> {
  const actual = await repo.obtenerPorId(idSesion, idPedido);
  if (!TRANSICIONES[actual.estadoCodigo].includes(input.estado)) {
    throw new AppError(
      'TRANSICION_INVALIDA',
      409,
      `Transición de estado no permitida: ${actual.estadoCodigo} → ${input.estado}.`,
    );
  }
  return repo.cambiarEstado(idSesion, idPedido, input);
}

export const cancelar = (
  idSesion: number,
  idPedido: number,
  motivo: string,
): Promise<PedidoDetalle> => repo.cancelar(idSesion, idPedido, motivo);

export const crearDevolucion = (
  idSesion: number,
  idPedido: number,
  input: CrearDevolucionInput,
): Promise<PedidoDetalle> => repo.crearDevolucion(idSesion, idPedido, input);
