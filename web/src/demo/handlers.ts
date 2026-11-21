import { z } from 'zod';
import {
  ActualizarCantidadInputSchema,
  ActualizarUsuarioInputSchema,
  AgregarLineaInputSchema,
  AjusteInputSchema,
  AplicarCuponInputSchema,
  BuscarProductosQuerySchema,
  CambiarEstadoInputSchema,
  CancelarPedidoInputSchema,
  CategoriaInputSchema,
  CategoriaUpdateInputSchema,
  CrearDevolucionInputSchema,
  CrearPedidoInputSchema,
  CrearUsuarioInputSchema,
  CuponInputSchema,
  DireccionInputSchema,
  EntradaInputSchema,
  IdParamSchema,
  ImagenInputSchema,
  KardexQuerySchema,
  ListarBitacoraQuerySchema,
  ListarCategoriasQuerySchema,
  ListarCuponesQuerySchema,
  ListarExistenciasQuerySchema,
  ListarPedidosAdminQuerySchema,
  ListarPedidosQuerySchema,
  ListarUsuariosQuerySchema,
  LoginInputSchema,
  PaginationQuerySchema,
  ProductoDetalleQuerySchema,
  ProductoInputSchema,
  ProductoUpdateInputSchema,
  RangoQuerySchema,
  RegisterInputSchema,
  TRANSICIONES,
  TopProductosQuerySchema,
  VarianteInputSchema,
  VarianteUpdateInputSchema,
  VentasQuerySchema,
  type AuthResponse,
  type EstadoPedido,
  type Rol,
} from '@shopcart/contracts';
import type { OperationId } from './generated/operations';
import {
  DAY,
  DemoError,
  db,
  gtDate,
  next,
  nowIso,
  round2,
  type DPedido,
  type DUsuario,
} from './db';
import {
  RESERVA_MS,
  actorDe,
  auditar,
  cambiarEstado,
  carritoDe,
  carritoDto,
  crearCarrito,
  cuponDto,
  detallePedido,
  direccionDto,
  disponible,
  disponiblePara,
  ESTADO_NOMBRE,
  errorCupon,
  evaluarCupon,
  existenciaListado,
  fusionarInvitado,
  itemsDe,
  ivaDe,
  liberarReserva,
  montoDevuelto,
  mover,
  noEncontrado,
  norm,
  paginar,
  productoDetalle,
  productoPorId,
  productoResumen,
  categoriaPorId,
  registrarPedido,
  reservaDe,
  tocarCarrito,
  usuarioPorId,
  variantePorId,
  vendible,
  carritoVacio,
} from './rules';
import { emitirReportes } from './bus';
import type { Hoja } from './xlsx';

// ── Contexto y respuestas ─────────────────────────────────────────────────────

export interface Ctx {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  user: DUsuario | null;
  cartToken: string | null;
  idemKey: string | null;
}

/** Respuesta con metadatos (paginación) o un estado distinto al de la tabla. */
export class Respuesta {
  constructor(
    public readonly data: unknown,
    public readonly extra: { meta?: unknown; status?: number } = {},
  ) {}
}
export class Archivo {
  constructor(public readonly hojas: Hoja[]) {}
}
export class Flujo {}

export type Handler = (c: Ctx) => unknown;

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new DemoError(
      'VALIDACION',
      400,
      'Los datos enviados no son válidos.',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}
const idDe = (c: Ctx): number => parse(IdParamSchema, c.params).id;
const yo = (c: Ctx): DUsuario => c.user!;
const rolDe = (c: Ctx): Rol => c.user?.rol ?? 'Cliente';
const esAdmin = (c: Ctx): boolean => c.user?.rol === 'Administrador';
const pag = <T>(items: T[], q: { page: number; pageSize: number }) => {
  const r = paginar(items, q);
  return new Respuesta(r.data, { meta: r.meta });
};
const dup = (campo: string) =>
  new DemoError('DUPLICADO', 409, 'Ya existe un registro con ese valor.', [{ campo }]);

type Dir = { campo: string; direccion: 'asc' | 'desc' };
function ordenar<T>(items: T[], sort: Dir, claves: Record<string, (x: T) => string | number>): T[] {
  const f = claves[sort.campo];
  if (!f) return items;
  const k = sort.direccion === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    return (
      (typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y, 'es')
        : Number(x) - Number(y)) * k
    );
  });
}

const sesionDe = (u: DUsuario): AuthResponse => {
  const exp = Date.now() + 15 * 60_000;
  return {
    accessToken: `demo.${u.id}.${exp}`,
    expiraEn: new Date(exp).toISOString(),
    usuario: { idUsuario: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol },
  };
};
const usuarioDto = (u: DUsuario) => ({
  idUsuario: u.id,
  nombre: u.nombre,
  correo: u.correo,
  rol: u.rol,
  activo: u.activo,
  fechaCreacion: u.creado,
});

// ── Carrito ───────────────────────────────────────────────────────────────────

function duenoDe(c: Ctx): string | null {
  if (c.user?.rol === 'Cliente') return `u:${c.user.id}`;
  if (c.user) throw new DemoError('PROHIBIDO', 403, 'El personal no tiene carrito.');
  return c.cartToken ? `g:${c.cartToken}` : null;
}
function carritoEscritura(c: Ctx) {
  let dueno = duenoDe(c);
  if (!dueno) dueno = `g:${crypto.randomUUID()}`;
  return carritoDe(dueno) ?? crearCarrito(dueno, c.user?.id ?? null);
}
function verificarCantidad(dueno: string, idVariante: number, cantidad: number): void {
  const v = variantePorId(idVariante);
  if (!v) throw noEncontrado('La variante');
  if (!vendible(v))
    throw new DemoError('VARIANTE_INACTIVA', 409, 'El producto ya no está disponible.');
  const disp = disponiblePara(v, dueno);
  if (disp <= 0) throw new DemoError('STOCK_INSUFICIENTE', 409, 'Este producto está agotado.');
  if (cantidad > disp)
    throw new DemoError(
      'CANTIDAD_EXCEDE_DISPONIBLE',
      409,
      `Solo hay ${disp} unidad${disp === 1 ? '' : 'es'} disponible${disp === 1 ? '' : 's'}.`,
    );
}

// ── Pedidos: acceso ───────────────────────────────────────────────────────────

function pedidoVisible(c: Ctx, id: number): DPedido {
  const p = db().pedidos.find((x) => x.id === id);
  if (!p) throw noEncontrado('El pedido');
  if (c.user?.rol === 'Cliente' && p.idUsuario !== c.user.id)
    throw new DemoError('PROHIBIDO', 403, 'No tienes permiso sobre este pedido.');
  return p;
}
const enRango = (iso: string, desde?: string, hasta?: string): boolean => {
  const d = gtDate(iso);
  return (!desde || d >= desde) && (!hasta || d <= hasta);
};

function listarPedidos<T>(
  items: DPedido[],
  q: {
    estado?: EstadoPedido | undefined;
    desde?: string | undefined;
    hasta?: string | undefined;
    numero?: string | undefined;
  },
  map: (p: DPedido) => T,
  sort: Dir,
  paginacion: { page: number; pageSize: number },
  extra: Record<string, (p: DPedido) => string | number> = {},
) {
  let r = items.filter(
    (p) =>
      (!q.estado || p.estado === q.estado) &&
      enRango(p.fecha, q.desde, q.hasta) &&
      (!q.numero || norm(p.numero).includes(norm(q.numero))),
  );
  r = ordenar(r, sort, {
    fecha: (p) => Date.parse(p.fecha),
    total: (p) => p.total,
    numero: (p) => p.numero,
    estado: (p) => ESTADO_NOMBRE[p.estado],
    ...extra,
  });
  const out = paginar(r, paginacion);
  return new Respuesta(out.data.map(map), { meta: out.meta });
}
const resumen = (p: DPedido) => ({
  idPedido: p.id,
  numeroPedido: p.numero,
  fechaCreacion: p.fecha,
  estadoCodigo: p.estado,
  estadoNombre: ESTADO_NOMBRE[p.estado],
  total: p.total,
  cantidadItems: itemsDe(p),
});

// ── Reportes ──────────────────────────────────────────────────────────────────

const dia = (d: string): number => Date.parse(`${d}T12:00:00Z`);
const diaStr = (t: number): string => new Date(t).toISOString().slice(0, 10);

function rangoDe(q: { desde?: string | undefined; hasta?: string | undefined }) {
  const hasta = q.hasta ?? gtDate(Date.now());
  const desde = q.desde ?? diaStr(dia(hasta) - 29 * DAY);
  return { desde, hasta };
}
function vendidos(desde: string, hasta: string) {
  return db().pedidos.filter((p) => p.estado !== 'Cancelado' && enRango(p.fecha, desde, hasta));
}
function netoLinea(p: DPedido, idLinea: number, total: number): number {
  const refund = p.devoluciones
    .flatMap((d) => d.lineas)
    .filter((l) => l.idPedidoLinea === idLinea)
    .reduce((a, l) => a + l.monto, 0);
  return round2(total - refund);
}
const netoPedido = (p: DPedido): number =>
  round2(p.lineas.reduce((a, l) => a + netoLinea(p, l.id, l.totalLinea), 0));

function kpis(desde: string, hasta: string) {
  const ps = vendidos(desde, hasta);
  const ventasNetas = round2(ps.reduce((a, p) => a + netoPedido(p), 0));
  return {
    ventasNetas,
    pedidos: ps.length,
    ticketPromedio: ps.length ? round2(ventasNetas / ps.length) : 0,
    unidades: ps.reduce(
      (a, p) => a + p.lineas.reduce((n, l) => n + l.cantidad - l.cantidadDevuelta, 0),
      0,
    ),
    montoDevuelto: round2(ps.reduce((a, p) => a + montoDevuelto(p), 0)),
    desde,
    hasta,
  };
}
function ventasPeriodo(desde: string, hasta: string, agr: 'dia' | 'semana' | 'mes') {
  const inicio = (d: string): string => {
    const t = new Date(dia(d));
    if (agr === 'mes') return `${d.slice(0, 7)}-01`;
    if (agr === 'semana') return diaStr(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY);
    return d;
  };
  const m = new Map<string, { ventasNetas: number; pedidos: number }>();
  for (let t = dia(desde); t <= dia(hasta); t += DAY)
    m.set(inicio(diaStr(t)), { ventasNetas: 0, pedidos: 0 });
  for (const p of vendidos(desde, hasta)) {
    const e = m.get(inicio(gtDate(p.fecha)));
    if (!e) continue;
    e.ventasNetas = round2(e.ventasNetas + netoPedido(p));
    e.pedidos += 1;
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periodo, v]) => ({ periodo, ...v }));
}
function ventasCategoria(desde: string, hasta: string) {
  const m = new Map<number, { ventasNetas: number; unidades: number; pedidos: Set<number> }>();
  for (const p of vendidos(desde, hasta)) {
    for (const l of p.lineas) {
      const e = m.get(l.idCategoria) ?? { ventasNetas: 0, unidades: 0, pedidos: new Set<number>() };
      e.ventasNetas = round2(e.ventasNetas + netoLinea(p, l.id, l.totalLinea));
      e.unidades += l.cantidad - l.cantidadDevuelta;
      e.pedidos.add(p.id);
      m.set(l.idCategoria, e);
    }
  }
  return [...m.entries()]
    .map(([id, e]) => ({
      idCategoria: id,
      categoria: categoriaPorId(id)?.nombre ?? '—',
      ventasNetas: e.ventasNetas,
      unidades: e.unidades,
      pedidos: e.pedidos.size,
    }))
    .sort((a, b) => b.ventasNetas - a.ventasNetas || a.categoria.localeCompare(b.categoria, 'es'));
}
function topProductos(desde: string, hasta: string, limite: number) {
  const m = new Map<number, { producto: string; unidades: number; ventasNetas: number }>();
  for (const p of vendidos(desde, hasta)) {
    for (const l of p.lineas) {
      const e = m.get(l.idProducto) ?? { producto: l.nombre, unidades: 0, ventasNetas: 0 };
      e.unidades += l.cantidad - l.cantidadDevuelta;
      e.ventasNetas = round2(e.ventasNetas + netoLinea(p, l.id, l.totalLinea));
      m.set(l.idProducto, e);
    }
  }
  return [...m.entries()]
    .map(([idProducto, e]) => ({ idProducto, ...e }))
    .sort((a, b) => b.unidades - a.unidades || b.ventasNetas - a.ventasNetas)
    .slice(0, limite);
}
function abandonados() {
  const corte = Date.now() - 3_600_000;
  return db()
    .carritos.filter((c) => c.lineas.length && Date.parse(c.actualizado) < corte)
    .sort((a, b) => Date.parse(b.actualizado) - Date.parse(a.actualizado))
    .map((c) => {
      const u = c.idUsuario ? usuarioPorId(c.idUsuario) : undefined;
      const dto = carritoDto(c);
      return {
        idCarrito: c.id,
        cliente: u?.nombre ?? null,
        correoCliente: u?.correo ?? null,
        items: dto.cantidadItems,
        subtotal: dto.subtotal,
        ultimaActividad: c.actualizado,
      };
    });
}

// ── Catálogo: utilidades de admin ─────────────────────────────────────────────

function varianteDe(id: number) {
  const v = variantePorId(id);
  if (!v) throw noEncontrado('La variante');
  return v;
}
function existencia(v: { id: number }) {
  const e = existenciaListado(varianteDe(v.id));
  return {
    idVariante: e.idVariante,
    sku: e.sku,
    producto: e.producto,
    atributos: e.atributos,
    fisica: e.fisica,
    reservada: e.reservada,
    disponible: e.disponible,
  };
}

// ── Tabla de handlers: uno por operación del OpenAPI ──────────────────────────

export const HANDLERS: Record<OperationId, Handler> = {
  get_health: () => ({ status: 'ok', db: 'up' }),

  // Autenticación
  post_auth_register: (c) => {
    const b = parse(RegisterInputSchema, c.body);
    const s = db();
    if (s.usuarios.some((u) => u.correo.toLowerCase() === b.correo)) throw dup('correo');
    const u: DUsuario = {
      id: next('usuario'),
      nombre: b.nombre,
      correo: b.correo,
      rol: 'Cliente',
      activo: true,
      creado: nowIso(),
    };
    s.usuarios.push(u);
    fusionarInvitado(c.cartToken, u);
    s.refresh = u.id;
    return new Respuesta(sesionDe(u));
  },
  post_auth_login: (c) => {
    const b = parse(LoginInputSchema, c.body);
    const s = db();
    // Demo: las cuentas no tienen contraseña; cualquier valor entra si el correo es de la demo.
    const u = s.usuarios.find((x) => x.correo.toLowerCase() === b.correo && x.activo);
    if (!u) throw new DemoError('CREDENCIALES_INVALIDAS', 401, 'Correo o contraseña incorrectos.');
    fusionarInvitado(c.cartToken, u);
    s.refresh = u.id;
    return sesionDe(u);
  },
  post_auth_refresh: () => {
    const s = db();
    const u = s.refresh ? usuarioPorId(s.refresh) : undefined;
    if (!u?.activo) throw new DemoError('REFRESH_INVALIDO', 401, 'La sesión ya no es válida.');
    return sesionDe(u);
  },
  post_auth_logout: () => {
    db().refresh = null;
    return undefined;
  },
  get_auth_me: (c) => sesionDe(yo(c)).usuario,

  // Direcciones
  get_me_direcciones: (c) =>
    db()
      .direcciones.filter((d) => d.idUsuario === yo(c).id)
      .sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.id - b.id)
      .map(direccionDto),
  post_me_direcciones: (c) => {
    const b = parse(DireccionInputSchema, c.body);
    const s = db();
    const propias = s.direcciones.filter((d) => d.idUsuario === yo(c).id);
    const principal = b.esPrincipal || propias.length === 0;
    if (principal) for (const d of propias) d.esPrincipal = false;
    const d = {
      id: next('direccion'),
      idUsuario: yo(c).id,
      ...b,
      linea2: b.linea2 ?? null,
      codigoPostal: b.codigoPostal ?? null,
      esPrincipal: principal,
    };
    s.direcciones.push(d);
    return direccionDto(d);
  },
  put_me_direcciones_id: (c) => {
    const id = idDe(c);
    const b = parse(DireccionInputSchema, c.body);
    const s = db();
    const d = s.direcciones.find((x) => x.id === id && x.idUsuario === yo(c).id);
    if (!d) throw noEncontrado('La dirección');
    if (b.esPrincipal)
      for (const o of s.direcciones.filter((x) => x.idUsuario === d.idUsuario))
        o.esPrincipal = false;
    Object.assign(d, b, { linea2: b.linea2 ?? null, codigoPostal: b.codigoPostal ?? null });
    return direccionDto(d);
  },
  delete_me_direcciones_id: (c) => {
    const id = idDe(c);
    const s = db();
    const i = s.direcciones.findIndex((x) => x.id === id && x.idUsuario === yo(c).id);
    if (i < 0) throw noEncontrado('La dirección');
    const [d] = s.direcciones.splice(i, 1);
    const resto = s.direcciones.filter((x) => x.idUsuario === d!.idUsuario);
    if (d!.esPrincipal && resto[0]) resto[0].esPrincipal = true;
    return undefined;
  },

  // Usuarios (admin)
  get_admin_usuarios: (c) => {
    const q = parse(ListarUsuariosQuerySchema, c.query);
    let r = db().usuarios.filter(
      (u) =>
        (!q.rol || u.rol === q.rol) &&
        (q.activo === undefined || u.activo === q.activo) &&
        (!q.q || norm(`${u.nombre} ${u.correo}`).includes(norm(q.q))),
    );
    r = ordenar(r, q.sort, {
      nombre: (u) => u.nombre,
      correo: (u) => u.correo,
      rol: (u) => u.rol,
      fecha: (u) => Date.parse(u.creado),
    });
    return pag(r.map(usuarioDto), q);
  },
  post_admin_usuarios: (c) => {
    const b = parse(CrearUsuarioInputSchema, c.body);
    const s = db();
    if (s.usuarios.some((u) => u.correo.toLowerCase() === b.correo)) throw dup('correo');
    const u: DUsuario = {
      id: next('usuario'),
      nombre: b.nombre,
      correo: b.correo,
      rol: b.rol,
      activo: true,
      creado: nowIso(),
    };
    s.usuarios.push(u);
    auditar(actorDe(yo(c)), 'Seguridad', 'Usuario', u.id, 'Alta', null, {
      correo: u.correo,
      rol: u.rol,
    });
    return usuarioDto(u);
  },
  patch_admin_usuarios_id: (c) => {
    const id = idDe(c);
    const b = parse(ActualizarUsuarioInputSchema, c.body);
    const u = usuarioPorId(id);
    if (!u) throw noEncontrado('El usuario');
    const antes = { nombre: u.nombre, rol: u.rol, activo: u.activo };
    Object.assign(u, b);
    if (!u.activo && db().refresh === u.id) db().refresh = null;
    auditar(actorDe(yo(c)), 'Seguridad', 'Usuario', u.id, 'Cambio', antes, {
      nombre: u.nombre,
      rol: u.rol,
      activo: u.activo,
    });
    return usuarioDto(u);
  },

  // Catálogo (lectura)
  get_catalog_categorias: (c) => {
    const q = parse(ListarCategoriasQuerySchema, c.query);
    const todas = q.incluirInactivas && esAdmin(c);
    return db()
      .categorias.filter((x) => todas || x.activo)
      .map((x) => ({
        idCategoria: x.id,
        nombre: x.nombre,
        descripcion: x.descripcion,
        activo: x.activo,
        productosActivos: db().productos.filter((p) => p.idCategoria === x.id && p.activo).length,
      }));
  },
  get_catalog_productos: (c) => {
    const q = parse(BuscarProductosQuerySchema, c.query);
    const admin = esAdmin(c) && q.incluirInactivos;
    const r = db().productos.filter((p) => {
      if (!admin && (!p.activo || !categoriaPorId(p.idCategoria)?.activo)) return false;
      if (q.idCategoria && p.idCategoria !== q.idCategoria) return false;
      if (q.q && !norm(`${p.nombre} ${p.descripcion}`).includes(norm(q.q))) return false;
      return true;
    });
    let items = r.map((p) => ({ p, d: productoResumen(p, admin) }));
    items = items.filter(({ d }) => {
      if (q.soloDisponibles && !d.hayStock) return false;
      if (q.precioMin !== undefined && (d.precioHasta ?? -1) < q.precioMin) return false;
      if (q.precioMax !== undefined && (d.precioDesde ?? Infinity) > q.precioMax) return false;
      return true;
    });
    const orden = ordenar(items, q.sort, {
      nombre: (x) => x.p.nombre,
      precio: (x) => x.d.precioDesde ?? 0,
      recientes: (x) => x.p.id,
    });
    return pag(
      orden.map((x) => x.d),
      q,
    );
  },
  get_catalog_productos_id: (c) => {
    const id = idDe(c);
    const q = parse(ProductoDetalleQuerySchema, c.query);
    const p = productoPorId(id);
    const admin = esAdmin(c) && q.incluirInactivos;
    if (!p || (!admin && (!p.activo || !categoriaPorId(p.idCategoria)?.activo)))
      throw noEncontrado('El producto');
    return productoDetalle(p, admin);
  },

  // Catálogo (admin)
  post_catalog_categorias: (c) => {
    const b = parse(CategoriaInputSchema, c.body);
    const s = db();
    if (s.categorias.some((x) => norm(x.nombre) === norm(b.nombre))) throw dup('nombre');
    const x = {
      id: next('categoria'),
      nombre: b.nombre,
      descripcion: b.descripcion ?? null,
      activo: true,
    };
    s.categorias.push(x);
    auditar(actorDe(yo(c)), 'Catálogo', 'Categoría', x.id, 'Alta', null, { nombre: x.nombre });
    return {
      idCategoria: x.id,
      nombre: x.nombre,
      descripcion: x.descripcion,
      activo: true,
      productosActivos: 0,
    };
  },
  put_catalog_categorias_id: (c) => {
    const id = idDe(c);
    const b = parse(CategoriaUpdateInputSchema, c.body);
    const s = db();
    const x = categoriaPorId(id);
    if (!x) throw noEncontrado('La categoría');
    if (s.categorias.some((o) => o.id !== id && norm(o.nombre) === norm(b.nombre)))
      throw dup('nombre');
    const antes = { nombre: x.nombre, activo: x.activo };
    Object.assign(x, { nombre: b.nombre, descripcion: b.descripcion ?? null, activo: b.activo });
    auditar(actorDe(yo(c)), 'Catálogo', 'Categoría', x.id, 'Cambio', antes, {
      nombre: x.nombre,
      activo: x.activo,
    });
    return {
      idCategoria: x.id,
      nombre: x.nombre,
      descripcion: x.descripcion,
      activo: x.activo,
      productosActivos: s.productos.filter((p) => p.idCategoria === x.id && p.activo).length,
    };
  },
  delete_catalog_categorias_id: (c) => {
    const id = idDe(c);
    const x = categoriaPorId(id);
    if (!x) throw noEncontrado('La categoría');
    if (db().productos.some((p) => p.idCategoria === id && p.activo))
      throw new DemoError('EN_USO', 409, 'La categoría tiene productos activos.');
    x.activo = false;
    auditar(
      actorDe(yo(c)),
      'Catálogo',
      'Categoría',
      x.id,
      'Baja',
      { activo: true },
      { activo: false },
    );
    return undefined;
  },
  post_catalog_productos: (c) => {
    const b = parse(ProductoInputSchema, c.body);
    if (!categoriaPorId(b.idCategoria))
      throw new DemoError('REFERENCIA_INVALIDA', 400, 'La categoría no existe.');
    const p = {
      id: next('producto'),
      idCategoria: b.idCategoria,
      nombre: b.nombre,
      descripcion: b.descripcion,
      activo: true,
      creado: nowIso(),
    };
    db().productos.push(p);
    auditar(actorDe(yo(c)), 'Catálogo', 'Producto', p.id, 'Alta', null, { nombre: p.nombre });
    return productoDetalle(p, true);
  },
  put_catalog_productos_id: (c) => {
    const id = idDe(c);
    const b = parse(ProductoUpdateInputSchema, c.body);
    const p = productoPorId(id);
    if (!p) throw noEncontrado('El producto');
    if (!categoriaPorId(b.idCategoria))
      throw new DemoError('REFERENCIA_INVALIDA', 400, 'La categoría no existe.');
    const antes = { nombre: p.nombre, activo: p.activo, idCategoria: p.idCategoria };
    Object.assign(p, b);
    auditar(actorDe(yo(c)), 'Catálogo', 'Producto', p.id, 'Cambio', antes, {
      nombre: p.nombre,
      activo: p.activo,
      idCategoria: p.idCategoria,
    });
    return productoDetalle(p, true);
  },
  delete_catalog_productos_id: (c) => {
    const p = productoPorId(idDe(c));
    if (!p) throw noEncontrado('El producto');
    p.activo = false;
    auditar(
      actorDe(yo(c)),
      'Catálogo',
      'Producto',
      p.id,
      'Baja',
      { activo: true },
      { activo: false },
    );
    return undefined;
  },
  post_catalog_productos_id_variantes: (c) => {
    const id = idDe(c);
    const b = parse(VarianteInputSchema, c.body);
    if (!productoPorId(id)) throw noEncontrado('El producto');
    if (db().variantes.some((v) => v.sku === b.sku)) throw dup('sku');
    const v = {
      id: next('variante'),
      idProducto: id,
      sku: b.sku,
      atributos: b.atributos,
      precio: b.precio,
      activo: true,
      fisica: 0,
      reservada: 0,
    };
    db().variantes.push(v);
    auditar(actorDe(yo(c)), 'Catálogo', 'Variante', v.id, 'Alta', null, {
      sku: v.sku,
      precio: v.precio,
    });
    return productoDetalle(productoPorId(id)!, true);
  },
  put_catalog_variantes_id: (c) => {
    const v = varianteDe(idDe(c));
    const b = parse(VarianteUpdateInputSchema, c.body);
    if (db().variantes.some((o) => o.id !== v.id && o.sku === b.sku)) throw dup('sku');
    const antes = { sku: v.sku, precio: v.precio, activo: v.activo };
    Object.assign(v, b);
    auditar(actorDe(yo(c)), 'Catálogo', 'Variante', v.id, 'Cambio', antes, {
      sku: v.sku,
      precio: v.precio,
      activo: v.activo,
    });
    return productoDetalle(productoPorId(v.idProducto)!, true);
  },
  delete_catalog_variantes_id: (c) => {
    const v = varianteDe(idDe(c));
    v.activo = false;
    auditar(
      actorDe(yo(c)),
      'Catálogo',
      'Variante',
      v.id,
      'Baja',
      { activo: true },
      { activo: false },
    );
    return undefined;
  },
  post_catalog_productos_id_imagenes: (c) => {
    const id = idDe(c);
    const b = parse(ImagenInputSchema, c.body);
    if (!productoPorId(id)) throw noEncontrado('El producto');
    const s = db();
    if (b.esPrincipal)
      for (const i of s.imagenes.filter((x) => x.idProducto === id)) i.esPrincipal = false;
    s.imagenes.push({
      id: next('imagen'),
      idProducto: id,
      url: b.url,
      orden: b.orden,
      esPrincipal: b.esPrincipal,
    });
    return productoDetalle(productoPorId(id)!, true);
  },
  delete_catalog_imagenes_id: (c) => {
    const id = idDe(c);
    const s = db();
    const i = s.imagenes.findIndex((x) => x.id === id);
    if (i < 0) throw noEncontrado('La imagen');
    s.imagenes.splice(i, 1);
    return undefined;
  },

  // Inventario
  get_inventory_existencias: (c) => {
    const q = parse(ListarExistenciasQuerySchema, c.query);
    let r = db()
      .variantes.map(existenciaListado)
      .filter(
        (e) =>
          (!q.idCategoria || e.idCategoria === q.idCategoria) &&
          (!q.soloSinStock || e.disponible <= 0) &&
          (!q.q || norm(`${e.sku} ${e.producto}`).includes(norm(q.q))),
      );
    r = ordenar(r, q.sort, {
      sku: (e) => e.sku,
      producto: (e) => e.producto,
      fisica: (e) => e.fisica,
      disponible: (e) => e.disponible,
    });
    return pag(r, q);
  },
  get_inventory_variantes_id_kardex: (c) => {
    const v = varianteDe(idDe(c));
    const q = parse(KardexQuerySchema, c.query);
    const mov = db()
      .kardex.filter(
        (k) =>
          k.idVariante === v.id &&
          (!q.tipo || k.tipo === q.tipo) &&
          enRango(k.fecha, q.desde, q.hasta),
      )
      .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || b.id - a.id);
    const p = paginar(mov, q);
    return new Respuesta(
      {
        variante: existencia(v),
        movimientos: p.data.map((k) => ({
          idKardex: k.id,
          fecha: k.fecha,
          tipo: k.tipo,
          cantidad: k.cantidad,
          resultante: k.resultante,
          motivo: k.motivo,
          usuario: k.usuario,
          numeroPedido: k.numeroPedido,
        })),
      },
      { meta: p.meta },
    );
  },
  post_inventory_entradas: (c) => {
    const b = parse(EntradaInputSchema, c.body);
    const v = varianteDe(b.idVariante);
    mover(v, 'Entrada', b.cantidad, b.motivo, yo(c).nombre);
    auditar(actorDe(yo(c)), 'Inventario', 'Variante', v.id, 'Movimiento', null, {
      tipo: 'Entrada',
      cantidad: b.cantidad,
    });
    return existencia(v);
  },
  post_inventory_ajustes: (c) => {
    const b = parse(AjusteInputSchema, c.body);
    const v = varianteDe(b.idVariante);
    if (v.fisica + b.cantidad < v.reservada)
      throw new DemoError(
        'AJUSTE_INVALIDO',
        400,
        'El ajuste dejaría la existencia por debajo de lo reservado.',
      );
    mover(v, 'Ajuste', b.cantidad, b.motivo, yo(c).nombre);
    auditar(actorDe(yo(c)), 'Inventario', 'Variante', v.id, 'Movimiento', null, {
      tipo: 'Ajuste',
      cantidad: b.cantidad,
    });
    return existencia(v);
  },

  // Carrito
  get_cart: (c) => {
    const dueno = duenoDe(c);
    return carritoDto(dueno ? carritoDe(dueno) : undefined);
  },
  post_cart_items: (c) => {
    const b = parse(AgregarLineaInputSchema, c.body);
    const cart = carritoEscritura(c);
    const l = cart.lineas.find((x) => x.idVariante === b.idVariante);
    verificarCantidad(cart.dueno, b.idVariante, (l?.cantidad ?? 0) + b.cantidad);
    if (l) l.cantidad += b.cantidad;
    else
      cart.lineas.push({
        id: next('carritoLinea'),
        idVariante: b.idVariante,
        cantidad: b.cantidad,
      });
    tocarCarrito(cart);
    return new Respuesta(carritoDto(cart), { status: 201 });
  },
  patch_cart_items_id: (c) => {
    const id = idDe(c);
    const b = parse(ActualizarCantidadInputSchema, c.body);
    const dueno = duenoDe(c);
    const cart = dueno ? carritoDe(dueno) : undefined;
    const l = cart?.lineas.find((x) => x.id === id);
    if (!cart || !l) throw noEncontrado('La línea');
    verificarCantidad(cart.dueno, l.idVariante, b.cantidad);
    l.cantidad = b.cantidad;
    tocarCarrito(cart);
    return carritoDto(cart);
  },
  delete_cart_items_id: (c) => {
    const id = idDe(c);
    const dueno = duenoDe(c);
    const cart = dueno ? carritoDe(dueno) : undefined;
    if (!cart || !cart.lineas.some((x) => x.id === id)) throw noEncontrado('La línea');
    cart.lineas = cart.lineas.filter((x) => x.id !== id);
    tocarCarrito(cart);
    return carritoDto(cart);
  },
  post_cart_coupon: (c) => {
    const b = parse(AplicarCuponInputSchema, c.body);
    const cart = carritoEscritura(c);
    const cupon = db().cupones.find((x) => x.codigo.toLowerCase() === b.codigo.toLowerCase());
    if (!cupon)
      throw errorCupon({
        valido: false,
        motivo: 'CUPON_INVALIDO',
        mensaje: 'El cupón no existe o no está activo.',
        descuento: 0,
        elegible: 0,
      });
    const dto = carritoDto({ ...cart, idCupon: cupon.id });
    if (dto.cuponValido === false)
      throw errorCupon({
        valido: false,
        motivo: dto.cuponMotivo,
        mensaje: dto.cuponMensaje,
        descuento: 0,
        elegible: 0,
      });
    cart.idCupon = cupon.id;
    tocarCarrito(cart);
    return carritoDto(cart);
  },
  delete_cart_coupon: (c) => {
    const dueno = duenoDe(c);
    const cart = dueno ? carritoDe(dueno) : undefined;
    if (!cart) return carritoVacio();
    cart.idCupon = null;
    tocarCarrito(cart);
    return carritoDto(cart);
  },

  // Checkout y pedidos
  'get_shipping-methods': () =>
    db().metodosEnvio.map((m) => ({
      idMetodoEnvio: m.id,
      nombre: m.nombre,
      costo: m.costo,
      montoMinimo: m.montoMinimo,
      diasEstimados: m.dias,
    })),
  post_checkout: (c) => {
    const cart = carritoDe(`u:${yo(c).id}`);
    if (!cart?.lineas.length) throw new DemoError('CARRITO_VACIO', 400, 'Tu carrito está vacío.');
    // Reiniciar es idempotente: primero se suelta la reserva anterior.
    const previa = reservaDe(cart.dueno);
    const propias = new Map<number, number>();
    for (const l of previa?.lineas ?? []) propias.set(l.idVariante, l.cantidad);
    for (const l of cart.lineas) {
      const v = variantePorId(l.idVariante)!;
      if (!vendible(v))
        throw new DemoError(
          'VARIANTE_INACTIVA',
          409,
          'Un producto del carrito ya no está disponible.',
        );
      if (l.cantidad > disponible(v) + (propias.get(v.id) ?? 0))
        throw new DemoError(
          'STOCK_INSUFICIENTE',
          409,
          `No hay existencias suficientes de ${v.sku}.`,
        );
    }
    liberarReserva(cart.dueno);
    const lineas = cart.lineas.map((l) => {
      const v = variantePorId(l.idVariante)!;
      v.reservada += l.cantidad;
      return { idVariante: v.id, cantidad: l.cantidad, precio: v.precio };
    });
    db().reservas.push({
      dueno: cart.dueno,
      expiraEn: new Date(Date.now() + RESERVA_MS).toISOString(),
      lineas,
    });
    emitirReportes('carritos');
    return checkoutDto(cart.dueno);
  },
  get_checkout: (c) => {
    const dueno = `u:${yo(c).id}`;
    const cart = carritoDe(dueno);
    if (!cart?.lineas.length) throw new DemoError('CARRITO_VACIO', 400, 'Tu carrito está vacío.');
    if (!reservaDe(dueno))
      throw new DemoError('CHECKOUT_NO_INICIADO', 409, 'Aún no has iniciado el pago.');
    return checkoutDto(dueno);
  },
  delete_checkout: (c) => {
    liberarReserva(`u:${yo(c).id}`);
    return undefined;
  },
  post_orders: (c) => {
    const b = parse(CrearPedidoInputSchema, c.body);
    if (!c.idemKey)
      throw new DemoError('IDEMPOTENCY_KEY_REQUERIDA', 400, 'Falta la cabecera Idempotency-Key.');
    const u = yo(c);
    const s = db();
    const repetido = s.pedidos.find((p) => p.llave === c.idemKey && p.idUsuario === u.id);
    if (repetido) return new Respuesta(detallePedido(repetido, 'Cliente', true), { status: 200 });
    const dueno = `u:${u.id}`;
    const cart = carritoDe(dueno);
    const reserva = reservaDe(dueno);
    if (!cart || !reserva)
      throw new DemoError('CHECKOUT_NO_INICIADO', 409, 'Aún no has iniciado el pago.');
    if (Date.parse(reserva.expiraEn) <= Date.now()) {
      liberarReserva(dueno);
      throw new DemoError('RESERVA_VENCIDA', 409, 'Tu reserva venció. Reinicia el checkout.');
    }
    const dir = s.direcciones.find((d) => d.id === b.idDireccion && d.idUsuario === u.id);
    if (!dir) throw new DemoError('DIRECCION_INVALIDA', 400, 'La dirección no es válida.');
    const dto = checkoutDto(dueno);
    const op = dto.opcionesEnvio.find((o) => o.idMetodoEnvio === b.idMetodoEnvio);
    if (!op || !op.aplica)
      throw new DemoError(
        'METODO_ENVIO_NO_APLICA',
        400,
        'El método de envío no aplica a este pedido.',
      );
    const cupon = cart.idCupon ? (s.cupones.find((x) => x.id === cart.idCupon) ?? null) : null;
    if (cupon && dto.carrito.cuponValido === false)
      throw errorCupon({
        valido: false,
        motivo: dto.carrito.cuponMotivo,
        mensaje: dto.carrito.cuponMensaje,
        descuento: 0,
        elegible: 0,
      });
    if (Math.abs(op.total - b.totalEsperado) > 0.001)
      throw new DemoError('TOTAL_CAMBIO', 409, 'El total cambió. Revisa tu pedido antes de pagar.');
    const metodo = s.metodosEnvio.find((m) => m.id === op.idMetodoEnvio)!;
    const pedido = registrarPedido({
      usuario: u,
      direccion: dir,
      metodoEnvio: { nombre: metodo.nombre, costo: metodo.costo },
      cupon,
      lineas: reserva.lineas,
      fecha: nowIso(),
      llave: c.idemKey,
      liberaReserva: true,
    });
    s.reservas.splice(s.reservas.indexOf(reserva), 1);
    s.carritos.splice(s.carritos.indexOf(cart), 1);
    emitirReportes('todo');
    return new Respuesta(detallePedido(pedido, 'Cliente'), { status: 201 });
  },
  get_orders_mine: (c) => {
    const q = parse(ListarPedidosQuerySchema, c.query);
    return listarPedidos(
      db().pedidos.filter((p) => p.idUsuario === yo(c).id),
      q,
      resumen,
      q.sort,
      q,
    );
  },
  get_orders: (c) => {
    const q = parse(ListarPedidosAdminQuerySchema, c.query);
    const base = db().pedidos.filter(
      (p) =>
        !q.cliente ||
        norm(`${usuarioPorId(p.idUsuario)?.nombre} ${usuarioPorId(p.idUsuario)?.correo}`).includes(
          norm(q.cliente),
        ),
    );
    return listarPedidos(
      base,
      q,
      (p) => {
        const u = usuarioPorId(p.idUsuario);
        return {
          ...resumen(p),
          idUsuario: p.idUsuario,
          clienteNombre: u?.nombre ?? '',
          clienteCorreo: u?.correo ?? '',
        };
      },
      q.sort,
      q,
      { cliente: (p) => usuarioPorId(p.idUsuario)?.nombre ?? '' },
    );
  },
  get_orders_id: (c) => detallePedido(pedidoVisible(c, idDe(c)), rolDe(c)),
  patch_orders_id_status: (c) => {
    const p = pedidoVisible(c, idDe(c));
    const b = parse(CambiarEstadoInputSchema, c.body);
    if (!(TRANSICIONES[p.estado] as readonly EstadoPedido[]).includes(b.estado))
      throw new DemoError(
        'TRANSICION_INVALIDA',
        409,
        `No se puede pasar de ${ESTADO_NOMBRE[p.estado]} a ${ESTADO_NOMBRE[b.estado]}.`,
      );
    cambiarEstado(p, b.estado, actorDe(yo(c)), b.nota ?? null);
    return detallePedido(p, rolDe(c));
  },
  post_orders_id_cancel: (c) => {
    const p = pedidoVisible(c, idDe(c));
    const b = parse(CancelarPedidoInputSchema, c.body);
    if (p.estado !== 'Pagado' && p.estado !== 'Preparando')
      throw new DemoError('PEDIDO_NO_CANCELABLE', 409, 'Este pedido ya no se puede cancelar.');
    for (const l of p.lineas)
      mover(
        variantePorId(l.idVariante)!,
        'Cancelacion',
        l.cantidad,
        `Cancelación ${p.numero}`,
        yo(c).nombre,
        p.numero,
      );
    cambiarEstado(p, 'Cancelado', actorDe(yo(c)), b.motivo);
    return detallePedido(p, rolDe(c));
  },
  post_orders_id_returns: (c) => {
    const p = pedidoVisible(c, idDe(c));
    const b = parse(CrearDevolucionInputSchema, c.body);
    if (p.estado !== 'Entregado' && p.estado !== 'DevueltoParcial')
      throw new DemoError('DEVOLUCION_NO_PERMITIDA', 409, 'Solo se devuelven pedidos entregados.');
    const lineas = b.lineas.map((x) => {
      const l = p.lineas.find((y) => y.id === x.idPedidoLinea);
      if (!l) throw new DemoError('REFERENCIA_INVALIDA', 400, 'La línea no pertenece al pedido.');
      if (x.cantidad > l.cantidad - l.cantidadDevuelta)
        throw new DemoError(
          'DEVOLUCION_EXCEDE_VENDIDO',
          400,
          `No puedes devolver más de lo vendido (${l.sku}).`,
        );
      return { l, cantidad: x.cantidad };
    });
    const fecha = nowIso();
    const det = lineas.map(({ l, cantidad }) => {
      const previo = p.devoluciones
        .flatMap((d) => d.lineas)
        .filter((y) => y.idPedidoLinea === l.id)
        .reduce((a, y) => a + y.monto, 0);
      const completa = l.cantidadDevuelta + cantidad === l.cantidad;
      const monto = completa
        ? round2(l.totalLinea - previo)
        : round2((l.totalLinea * cantidad) / l.cantidad);
      l.cantidadDevuelta += cantidad;
      mover(
        variantePorId(l.idVariante)!,
        'Devolucion',
        cantidad,
        `Devolución ${p.numero}`,
        yo(c).nombre,
        p.numero,
        fecha,
      );
      return { idPedidoLinea: l.id, sku: l.sku, cantidad, monto };
    });
    p.devoluciones.push({
      id: next('devolucion'),
      motivo: b.motivo,
      monto: round2(det.reduce((a, x) => a + x.monto, 0)),
      fecha,
      usuario: yo(c).nombre,
      lineas: det,
    });
    cambiarEstado(
      p,
      p.lineas.every((l) => l.cantidadDevuelta === l.cantidad)
        ? 'DevueltoTotal'
        : 'DevueltoParcial',
      actorDe(yo(c)),
      b.motivo,
    );
    return new Respuesta(detallePedido(p, rolDe(c)), { status: 201 });
  },

  // Cupones
  get_coupons: (c) => {
    const q = parse(ListarCuponesQuerySchema, c.query);
    let r = db().cupones.filter(
      (x) =>
        (q.activo === undefined || x.activo === q.activo) &&
        (q.vigente === undefined || cuponDto(x).vigente === q.vigente) &&
        (!q.q || norm(x.codigo).includes(norm(q.q))),
    );
    r = ordenar(r, q.sort, {
      codigo: (x) => x.codigo,
      valor: (x) => x.valor,
      usos: (x) => x.usosTotalesActual,
      hasta: (x) => Date.parse(x.vigenteHasta),
    });
    return pag(r.map(cuponDto), q);
  },
  post_coupons: (c) => {
    const b = parse(CuponInputSchema, c.body);
    const s = db();
    if (s.cupones.some((x) => x.codigo === b.codigo)) throw dup('codigo');
    const x = {
      id: next('cupon'),
      ...b,
      vigenteDesde: b.vigenteDesde.toISOString(),
      vigenteHasta: b.vigenteHasta.toISOString(),
      usosTotalesActual: 0,
    };
    s.cupones.push(x);
    auditar(actorDe(yo(c)), 'Cupones', 'Cupón', x.id, 'Alta', null, { codigo: x.codigo });
    return cuponDto(x);
  },
  put_coupons_id: (c) => {
    const id = idDe(c);
    const b = parse(CuponInputSchema, c.body);
    const s = db();
    const x = s.cupones.find((y) => y.id === id);
    if (!x) throw noEncontrado('El cupón');
    if (s.cupones.some((y) => y.id !== id && y.codigo === b.codigo)) throw dup('codigo');
    const antes = { codigo: x.codigo, valor: x.valor, activo: x.activo };
    Object.assign(x, b, {
      vigenteDesde: b.vigenteDesde.toISOString(),
      vigenteHasta: b.vigenteHasta.toISOString(),
    });
    auditar(actorDe(yo(c)), 'Cupones', 'Cupón', x.id, 'Cambio', antes, {
      codigo: x.codigo,
      valor: x.valor,
      activo: x.activo,
    });
    return cuponDto(x);
  },
  delete_coupons_id: (c) => {
    const x = db().cupones.find((y) => y.id === idDe(c));
    if (!x) throw noEncontrado('El cupón');
    x.activo = false;
    auditar(actorDe(yo(c)), 'Cupones', 'Cupón', x.id, 'Baja', { activo: true }, { activo: false });
    return undefined;
  },

  // Reportes y bitácora
  get_reports_kpis: (c) => {
    const { desde, hasta } = rangoDe(parse(RangoQuerySchema, c.query));
    return kpis(desde, hasta);
  },
  get_reports_ventas: (c) => {
    const q = parse(VentasQuerySchema, c.query);
    const { desde, hasta } = rangoDe(q);
    return ventasPeriodo(desde, hasta, q.agrupacion);
  },
  'get_reports_ventas-categoria': (c) => {
    const { desde, hasta } = rangoDe(parse(RangoQuerySchema, c.query));
    return ventasCategoria(desde, hasta);
  },
  'get_reports_top-productos': (c) => {
    const q = parse(TopProductosQuerySchema, c.query);
    const { desde, hasta } = rangoDe(q);
    return topProductos(desde, hasta, q.limite);
  },
  'get_reports_carritos-abandonados': (c) =>
    pag(abandonados(), parse(PaginationQuerySchema, c.query)),
  get_reports_export: (c) => {
    const { desde, hasta } = rangoDe(parse(RangoQuerySchema, c.query));
    const k = kpis(desde, hasta);
    return new Archivo([
      {
        nombre: 'KPIs',
        filas: [
          ['Indicador', 'Valor'],
          ['Desde', desde],
          ['Hasta', hasta],
          ['Ventas netas (GTQ)', k.ventasNetas],
          ['Pedidos', k.pedidos],
          ['Ticket promedio (GTQ)', k.ticketPromedio],
          ['Unidades', k.unidades],
          ['Monto devuelto (GTQ)', k.montoDevuelto],
        ],
      },
      {
        nombre: 'Ventas por día',
        filas: [
          ['Período', 'Ventas netas', 'Pedidos'],
          ...ventasPeriodo(desde, hasta, 'dia').map((v) => [v.periodo, v.ventasNetas, v.pedidos]),
        ],
      },
      {
        nombre: 'Por categoría',
        filas: [
          ['Categoría', 'Ventas netas', 'Unidades', 'Pedidos'],
          ...ventasCategoria(desde, hasta).map((v) => [
            v.categoria,
            v.ventasNetas,
            v.unidades,
            v.pedidos,
          ]),
        ],
      },
      {
        nombre: 'Top productos',
        filas: [
          ['Producto', 'Unidades', 'Ventas netas'],
          ...topProductos(desde, hasta, 50).map((v) => [v.producto, v.unidades, v.ventasNetas]),
        ],
      },
      {
        nombre: 'Carritos abandonados',
        filas: [
          ['Cliente', 'Ítems', 'Subtotal', 'Última actividad'],
          ...abandonados().map((v) => [
            v.cliente ?? 'Invitado',
            v.items,
            v.subtotal,
            v.ultimaActividad,
          ]),
        ],
      },
    ]);
  },
  get_reports_stream: () => new Flujo(),
  get_audit: (c) => {
    const q = parse(ListarBitacoraQuerySchema, c.query);
    const r = db()
      .bitacora.filter(
        (b) =>
          (!q.modulo || b.modulo === q.modulo) &&
          (!q.entidad || b.entidad === q.entidad) &&
          (!q.idUsuario || b.idUsuario === q.idUsuario) &&
          (!q.accion || b.accion === q.accion) &&
          enRango(b.fecha, q.desde, q.hasta),
      )
      .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || b.id - a.id)
      .map((b) => ({
        idBitacora: b.id,
        fecha: b.fecha,
        usuario: b.usuario,
        idUsuario: b.idUsuario,
        modulo: b.modulo,
        entidad: b.entidad,
        idEntidad: b.idEntidad,
        accion: b.accion,
        valorAnterior: b.antes,
        valorNuevo: b.despues,
      }));
    return pag(r, q);
  },
};

function checkoutDto(dueno: string) {
  const carrito = carritoDto(carritoDe(dueno));
  return {
    carrito,
    opcionesEnvio: db().metodosEnvio.map((m) => {
      const total = round2(carrito.total + m.costo);
      return {
        idMetodoEnvio: m.id,
        nombre: m.nombre,
        diasEstimados: m.dias,
        costo: m.costo,
        aplica: m.montoMinimo === null || carrito.total >= m.montoMinimo,
        total,
        iva: ivaDe(total),
      };
    }),
  };
}

export { evaluarCupon };
