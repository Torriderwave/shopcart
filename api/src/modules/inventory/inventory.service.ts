import type {
  AjusteInput,
  EntradaInput,
  Existencia,
  ExistenciaListado,
  KardexQuery,
  KardexResponse,
  ListarExistenciasQuery,
} from '@shopcart/contracts';
import * as repo from './inventory.repository';

// Operador y Administrador; los SPs vuelven a exigir el rol en la base de datos.

export const listarExistencias = (
  idSesion: number,
  q: ListarExistenciasQuery,
): Promise<{ items: ExistenciaListado[]; total: number }> => repo.listarExistencias(idSesion, q);

export const obtenerKardex = (
  idSesion: number,
  idVariante: number,
  q: KardexQuery,
): Promise<{ data: KardexResponse; total: number }> => repo.obtenerKardex(idSesion, idVariante, q);

export const registrarEntrada = (idSesion: number, e: EntradaInput): Promise<Existencia> =>
  repo.registrarEntrada(idSesion, e);

export const registrarAjuste = (idSesion: number, a: AjusteInput): Promise<Existencia> =>
  repo.registrarAjuste(idSesion, a);
