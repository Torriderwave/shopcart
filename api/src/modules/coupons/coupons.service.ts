import type { Cupon, CuponInput, ListarCuponesQuery } from '@shopcart/contracts';
import * as repo from './coupons.repository';

// Solo Administrador (rol exigido en ruta y vuelto a exigir en cada SP).

export const listar = (
  idSesion: number,
  q: ListarCuponesQuery,
): Promise<{ items: Cupon[]; total: number }> => repo.listar(idSesion, q);

export const crear = (idSesion: number, c: CuponInput): Promise<Cupon> => repo.crear(idSesion, c);

export const actualizar = (idSesion: number, id: number, c: CuponInput): Promise<Cupon> =>
  repo.actualizar(idSesion, id, c);

export const desactivar = (idSesion: number, id: number): Promise<void> =>
  repo.desactivar(idSesion, id);
