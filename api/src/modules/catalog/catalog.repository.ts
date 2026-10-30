import type {
  Atributos,
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
import { executeSp, firstRow, p, pageRows, T, type Row, type SpResult } from '../../shared/db';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function parseAtributos(json: unknown): Atributos {
  try {
    return JSON.parse(String(json)) as Atributos;
  } catch {
    return {};
  }
}

const toCategoria = (r: Row): Categoria => ({
  idCategoria: r.idCategoria as number,
  nombre: r.nombre as string,
  descripcion: (r.descripcion as string | null) ?? null,
  activo: r.activo as boolean,
  productosActivos: r.productosActivos as number,
});

const toResumen = (r: Row): ProductoResumen => ({
  idProducto: r.idProducto as number,
  nombre: r.nombre as string,
  categoria: { idCategoria: r.idCategoria as number, nombre: r.categoria as string },
  precioDesde: num(r.precioDesde),
  precioHasta: num(r.precioHasta),
  imagenPrincipal: (r.imagenPrincipal as string | null) ?? null,
  hayStock: Boolean(r.hayStock),
  activo: r.activo as boolean,
});

/** Arma el detalle a partir de los 3 recordsets de SP_Catalogo_ObtenerProductoPorId. */
function toDetalle(result: SpResult): ProductoDetalle {
  const [producto, variantes = [], imagenes = []] = result.recordsets;
  const head = producto![0]!;
  return {
    ...toResumen(head),
    descripcion: head.descripcion as string,
    imagenes: imagenes.map((i) => ({
      idImagen: i.idImagen as number,
      url: i.url as string,
      orden: i.orden as number,
      esPrincipal: i.esPrincipal as boolean,
    })),
    variantes: variantes.map((v) => ({
      idVariante: v.idVariante as number,
      sku: v.sku as string,
      atributos: parseAtributos(v.atributosJson),
      precio: Number(v.precio),
      disponible: v.disponible as number,
      activo: v.activo as boolean,
    })),
  };
}

// ── Categorías ────────────────────────────────────────────────────────────────

export async function listarCategorias(
  incluirInactivas: boolean,
  idSesion: number | null,
): Promise<Categoria[]> {
  const r = await executeSp('SP_Catalogo_ListarCategorias', {
    IncluirInactivas: p(T.Bit, incluirInactivas),
    IDUsuarioSesion: p(T.Int, idSesion),
  });
  return (r.recordsets[0] ?? []).map(toCategoria);
}

export async function crearCategoria(idSesion: number, c: CategoriaInput): Promise<Categoria> {
  const r = await executeSp('SP_Catalogo_CrearCategoria', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Nombre: p(T.NVarChar(100), c.nombre),
    Descripcion: p(T.NVarChar(500), c.descripcion ?? null),
  });
  return toCategoria(firstRow(r)!);
}

export async function actualizarCategoria(
  idSesion: number,
  idCategoria: number,
  c: CategoriaUpdateInput,
): Promise<Categoria> {
  const r = await executeSp('SP_Catalogo_ActualizarCategoria', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDCategoria: p(T.Int, idCategoria),
    Nombre: p(T.NVarChar(100), c.nombre),
    Descripcion: p(T.NVarChar(500), c.descripcion ?? null),
    Activo: p(T.Bit, c.activo),
  });
  return toCategoria(firstRow(r)!);
}

export async function desactivarCategoria(idSesion: number, idCategoria: number): Promise<void> {
  await executeSp('SP_Catalogo_DesactivarCategoria', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDCategoria: p(T.Int, idCategoria),
  });
}

// ── Productos ─────────────────────────────────────────────────────────────────

export async function buscarProductos(
  q: BuscarProductosQuery,
  idSesion: number | null,
): Promise<{ items: ProductoResumen[]; total: number }> {
  const r = await executeSp('SP_Catalogo_BuscarProductos', {
    Q: p(T.NVarChar(100), q.q ?? null),
    IDCategoria: p(T.Int, q.idCategoria ?? null),
    PrecioMin: p(T.Decimal(18, 2), q.precioMin ?? null),
    PrecioMax: p(T.Decimal(18, 2), q.precioMax ?? null),
    SoloDisponibles: p(T.Bit, q.soloDisponibles),
    IncluirInactivos: p(T.Bit, q.incluirInactivos),
    IDUsuarioSesion: p(T.Int, idSesion),
    OrdenarPor: p(T.NVarChar(20), q.sort.campo),
    Direccion: p(T.NVarChar(4), q.sort.direccion),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toResumen), total };
}

export async function obtenerProducto(
  idProducto: number,
  incluirInactivos: boolean,
  idSesion: number | null,
): Promise<ProductoDetalle> {
  return toDetalle(
    await executeSp('SP_Catalogo_ObtenerProductoPorId', {
      IDProducto: p(T.Int, idProducto),
      IncluirInactivos: p(T.Bit, incluirInactivos),
      IDUsuarioSesion: p(T.Int, idSesion),
    }),
  );
}

export async function crearProducto(idSesion: number, d: ProductoInput): Promise<ProductoDetalle> {
  return toDetalle(
    await executeSp('SP_Catalogo_CrearProducto', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDCategoria: p(T.Int, d.idCategoria),
      Nombre: p(T.NVarChar(150), d.nombre),
      Descripcion: p(T.NVarChar(2000), d.descripcion),
    }),
  );
}

export async function actualizarProducto(
  idSesion: number,
  idProducto: number,
  d: ProductoUpdateInput,
): Promise<ProductoDetalle> {
  return toDetalle(
    await executeSp('SP_Catalogo_ActualizarProducto', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDProducto: p(T.Int, idProducto),
      IDCategoria: p(T.Int, d.idCategoria),
      Nombre: p(T.NVarChar(150), d.nombre),
      Descripcion: p(T.NVarChar(2000), d.descripcion),
      Activo: p(T.Bit, d.activo),
    }),
  );
}

export async function desactivarProducto(idSesion: number, idProducto: number): Promise<void> {
  await executeSp('SP_Catalogo_DesactivarProducto', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDProducto: p(T.Int, idProducto),
  });
}

// ── Variantes ─────────────────────────────────────────────────────────────────

export async function crearVariante(
  idSesion: number,
  idProducto: number,
  v: VarianteInput,
): Promise<ProductoDetalle> {
  return toDetalle(
    await executeSp('SP_Catalogo_CrearVariante', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDProducto: p(T.Int, idProducto),
      SKU: p(T.NVarChar(50), v.sku),
      AtributosJson: p(T.NVarChar(1000), JSON.stringify(v.atributos)),
      Precio: p(T.Decimal(18, 2), v.precio),
    }),
  );
}

export async function actualizarVariante(
  idSesion: number,
  idVariante: number,
  v: VarianteUpdateInput,
): Promise<ProductoDetalle> {
  return toDetalle(
    await executeSp('SP_Catalogo_ActualizarVariante', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDVariante: p(T.Int, idVariante),
      SKU: p(T.NVarChar(50), v.sku),
      AtributosJson: p(T.NVarChar(1000), JSON.stringify(v.atributos)),
      Precio: p(T.Decimal(18, 2), v.precio),
      Activo: p(T.Bit, v.activo),
    }),
  );
}

export async function desactivarVariante(idSesion: number, idVariante: number): Promise<void> {
  await executeSp('SP_Catalogo_DesactivarVariante', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDVariante: p(T.Int, idVariante),
  });
}

// ── Imágenes ──────────────────────────────────────────────────────────────────

export async function guardarImagen(
  idSesion: number,
  idProducto: number,
  i: ImagenInput,
): Promise<ProductoDetalle> {
  return toDetalle(
    await executeSp('SP_Catalogo_GuardarImagen', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDProducto: p(T.Int, idProducto),
      Url: p(T.NVarChar(500), i.url),
      Orden: p(T.Int, i.orden),
      EsPrincipal: p(T.Bit, i.esPrincipal),
    }),
  );
}

export async function eliminarImagen(idSesion: number, idImagen: number): Promise<void> {
  await executeSp('SP_Catalogo_EliminarImagen', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDImagen: p(T.Int, idImagen),
  });
}
