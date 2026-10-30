import { Router } from 'express';
import {
  BuscarProductosQuerySchema,
  CategoriaInputSchema,
  CategoriaUpdateInputSchema,
  IdParamSchema,
  ImagenInputSchema,
  ListarCategoriasQuerySchema,
  ProductoDetalleQuerySchema,
  ProductoInputSchema,
  ProductoUpdateInputSchema,
  VarianteInputSchema,
  VarianteUpdateInputSchema,
  type BuscarProductosQuery,
  type CategoriaInput,
  type CategoriaUpdateInput,
  type ImagenInput,
  type ProductoInput,
  type ProductoUpdateInput,
  type VarianteInput,
  type VarianteUpdateInput,
} from '@shopcart/contracts';
import {
  optionalAuth,
  requireAuth,
  requireRole,
  ROLES_ADMIN,
  sessionUser,
} from '../../shared/auth';
import { noContent, ok, paged, valid, validate } from '../../shared/http';
import * as service from './catalog.service';

export const catalogRouter = Router();

type IdParams = { id: number };
const adminOnly = [requireAuth, requireRole(...ROLES_ADMIN)];

// ── Lectura (pública; lo inactivo solo para Administrador) ───────────────────

catalogRouter.get(
  '/catalog/categorias',
  optionalAuth,
  validate({ query: ListarCategoriasQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, { incluirInactivas: boolean }>(res);
    ok(res, await service.listarCategorias(query.incluirInactivas, req.user));
  },
);

catalogRouter.get(
  '/catalog/productos',
  optionalAuth,
  validate({ query: BuscarProductosQuerySchema }),
  async (req, res) => {
    const { query } = valid<unknown, BuscarProductosQuery>(res);
    const { items, total } = await service.buscarProductos(query, req.user);
    paged(res, items, { page: query.page, pageSize: query.pageSize, total });
  },
);

catalogRouter.get(
  '/catalog/productos/:id',
  optionalAuth,
  validate({ params: IdParamSchema, query: ProductoDetalleQuerySchema }),
  async (req, res) => {
    const { params, query } = valid<IdParams, { incluirInactivos: boolean }>(res);
    ok(res, await service.obtenerProducto(params.id, query.incluirInactivos, req.user));
  },
);

// ── Categorías ────────────────────────────────────────────────────────────────

catalogRouter.post(
  '/catalog/categorias',
  ...adminOnly,
  validate({ body: CategoriaInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, CategoriaInput>(res);
    ok(res, await service.crearCategoria(sessionUser(req).idUsuario, body), 201);
  },
);

catalogRouter.put(
  '/catalog/categorias/:id',
  ...adminOnly,
  validate({ params: IdParamSchema, body: CategoriaUpdateInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, CategoriaUpdateInput>(res);
    ok(res, await service.actualizarCategoria(sessionUser(req).idUsuario, params.id, body));
  },
);

catalogRouter.delete(
  '/catalog/categorias/:id',
  ...adminOnly,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    await service.desactivarCategoria(sessionUser(req).idUsuario, valid<IdParams>(res).params.id);
    noContent(res);
  },
);

// ── Productos ─────────────────────────────────────────────────────────────────

catalogRouter.post(
  '/catalog/productos',
  ...adminOnly,
  validate({ body: ProductoInputSchema }),
  async (req, res) => {
    const { body } = valid<unknown, unknown, ProductoInput>(res);
    ok(res, await service.crearProducto(sessionUser(req).idUsuario, body), 201);
  },
);

catalogRouter.put(
  '/catalog/productos/:id',
  ...adminOnly,
  validate({ params: IdParamSchema, body: ProductoUpdateInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, ProductoUpdateInput>(res);
    ok(res, await service.actualizarProducto(sessionUser(req).idUsuario, params.id, body));
  },
);

catalogRouter.delete(
  '/catalog/productos/:id',
  ...adminOnly,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    await service.desactivarProducto(sessionUser(req).idUsuario, valid<IdParams>(res).params.id);
    noContent(res);
  },
);

// ── Variantes ─────────────────────────────────────────────────────────────────

catalogRouter.post(
  '/catalog/productos/:id/variantes',
  ...adminOnly,
  validate({ params: IdParamSchema, body: VarianteInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, VarianteInput>(res);
    ok(res, await service.crearVariante(sessionUser(req).idUsuario, params.id, body), 201);
  },
);

catalogRouter.put(
  '/catalog/variantes/:id',
  ...adminOnly,
  validate({ params: IdParamSchema, body: VarianteUpdateInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, VarianteUpdateInput>(res);
    ok(res, await service.actualizarVariante(sessionUser(req).idUsuario, params.id, body));
  },
);

catalogRouter.delete(
  '/catalog/variantes/:id',
  ...adminOnly,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    await service.desactivarVariante(sessionUser(req).idUsuario, valid<IdParams>(res).params.id);
    noContent(res);
  },
);

// ── Imágenes ──────────────────────────────────────────────────────────────────

catalogRouter.post(
  '/catalog/productos/:id/imagenes',
  ...adminOnly,
  validate({ params: IdParamSchema, body: ImagenInputSchema }),
  async (req, res) => {
    const { params, body } = valid<IdParams, unknown, ImagenInput>(res);
    ok(res, await service.guardarImagen(sessionUser(req).idUsuario, params.id, body), 201);
  },
);

catalogRouter.delete(
  '/catalog/imagenes/:id',
  ...adminOnly,
  validate({ params: IdParamSchema }),
  async (req, res) => {
    await service.eliminarImagen(sessionUser(req).idUsuario, valid<IdParams>(res).params.id);
    noContent(res);
  },
);
