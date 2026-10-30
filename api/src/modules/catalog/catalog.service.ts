import type {
  BuscarProductosQuery,
  Categoria,
  CategoriaInput,
  CategoriaUpdateInput,
  ImagenInput,
  ProductoDetalle,
  ProductoInput,
  ProductoResumen,
  ProductoUpdateInput,
  VarianteInput,
  VarianteUpdateInput,
} from '@shopcart/contracts';
import type { SessionUser } from '../../shared/auth';
import { AppError } from '../../shared/errors';
import * as repo from './catalog.repository';

/**
 * Ver lo inactivo es solo del Administrador. Sin sesión es 401; con sesión de otro rol el propio
 * SP responde 403 (la regla vive también en la base de datos).
 */
function sessionIdForInactive(wantsInactive: boolean, user?: SessionUser): number | null {
  if (!wantsInactive) return user?.idUsuario ?? null;
  if (!user) throw new AppError('NO_AUTENTICADO', 401, 'Se requiere iniciar sesión.');
  return user.idUsuario;
}

// ── Lectura (pública) ─────────────────────────────────────────────────────────

export const listarCategorias = (
  incluirInactivas: boolean,
  user?: SessionUser,
): Promise<Categoria[]> =>
  repo.listarCategorias(incluirInactivas, sessionIdForInactive(incluirInactivas, user));

export const buscarProductos = (
  q: BuscarProductosQuery,
  user?: SessionUser,
): Promise<{ items: ProductoResumen[]; total: number }> =>
  repo.buscarProductos(q, sessionIdForInactive(q.incluirInactivos, user));

export const obtenerProducto = (
  id: number,
  incluirInactivos: boolean,
  user?: SessionUser,
): Promise<ProductoDetalle> =>
  repo.obtenerProducto(id, incluirInactivos, sessionIdForInactive(incluirInactivos, user));

// ── Escritura (Administrador; el SP vuelve a verificar el rol) ───────────────

export const crearCategoria = (admin: number, c: CategoriaInput) => repo.crearCategoria(admin, c);
export const actualizarCategoria = (admin: number, id: number, c: CategoriaUpdateInput) =>
  repo.actualizarCategoria(admin, id, c);
export const desactivarCategoria = (admin: number, id: number) =>
  repo.desactivarCategoria(admin, id);

export const crearProducto = (admin: number, d: ProductoInput) => repo.crearProducto(admin, d);
export const actualizarProducto = (admin: number, id: number, d: ProductoUpdateInput) =>
  repo.actualizarProducto(admin, id, d);
export const desactivarProducto = (admin: number, id: number) => repo.desactivarProducto(admin, id);

export const crearVariante = (admin: number, idProducto: number, v: VarianteInput) =>
  repo.crearVariante(admin, idProducto, v);
export const actualizarVariante = (admin: number, id: number, v: VarianteUpdateInput) =>
  repo.actualizarVariante(admin, id, v);
export const desactivarVariante = (admin: number, id: number) => repo.desactivarVariante(admin, id);

export const guardarImagen = (admin: number, idProducto: number, i: ImagenInput) =>
  repo.guardarImagen(admin, idProducto, i);
export const eliminarImagen = (admin: number, id: number) => repo.eliminarImagen(admin, id);
