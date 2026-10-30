import type {
  CarritoAbandonado,
  EntradaBitacora,
  Kpis,
  ListarBitacoraQuery,
  RangoQuery,
  TopProducto,
  TopProductosQuery,
  VentaCategoria,
  VentaPeriodo,
  VentasQuery,
} from '@shopcart/contracts';
import { config } from '../../shared/config';
import * as repo from './reports.repository';

// Solo Administrador (ruta + SP). Las reglas de cálculo viven en la BD.

export const kpis = (idSesion: number, q: RangoQuery): Promise<Kpis> => repo.kpis(idSesion, q);

export const ventasPorPeriodo = (idSesion: number, q: VentasQuery): Promise<VentaPeriodo[]> =>
  repo.ventasPorPeriodo(idSesion, q);

export const ventasPorCategoria = (idSesion: number, q: RangoQuery): Promise<VentaCategoria[]> =>
  repo.ventasPorCategoria(idSesion, q);

export const topProductos = (idSesion: number, q: TopProductosQuery): Promise<TopProducto[]> =>
  repo.topProductos(idSesion, q);

export const carritosAbandonados = (
  idSesion: number,
  page: number,
  pageSize: number,
): Promise<{ items: CarritoAbandonado[]; total: number }> =>
  repo.carritosAbandonados(idSesion, config.CARRITO_ABANDONADO_MIN, page, pageSize);

export const listarBitacora = (
  idSesion: number,
  q: ListarBitacoraQuery,
): Promise<{ items: EntradaBitacora[]; total: number }> => repo.listarBitacora(idSesion, q);
