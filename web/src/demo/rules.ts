import type {
  Carrito,
  CarritoLinea,
  Cupon,
  Direccion,
  EstadoPedido,
  ExistenciaListado,
  PedidoDetalle,
  ProductoDetalle,
  ProductoResumen,
  Rol,
} from '@shopcart/contracts';
import { TRANSICIONES } from '@shopcart/contracts';
import {
  DemoError,
  db,
  gtDate,
  next,
  nowIso,
  round2,
  type DCarrito,
  type DCupon,
  type DDireccion,
  type DPedido,
  type DPedidoLinea,
  type DProducto,
  type DReserva,
  type DUsuario,
  type DVariante,
} from './db';
import { emitirReportes } from './bus';

// ── Utilidades ────────────────────────────────────────────────────────────────

export const norm = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const RESERVA_MS = 15 * 60_000;

export function paginar<T>(items: T[], q: { page: number; pageSize: number }) {
  const start = (q.page - 1) * q.pageSize;
  return {
    data: items.slice(start, start + q.pageSize),
    meta: { page: q.page, pageSize: q.pageSize, total: items.length },
  };
}

export const ivaDe = (total: number): number => round2(total - round2(total / 1.12));

export const ESTADO_NOMBRE: Record<EstadoPedido, string> = {
  Pagado: 'Pagado',
  Preparando: 'En preparación',
  Despachado: 'Despachado',
  Entregado: 'Entregado',
  Cancelado: 'Cancelado',
  DevueltoParcial: 'Devuelto parcial',
  DevueltoTotal: 'Devuelto total',
};
export const ESTADO_ORDEN: EstadoPedido[] = [
  'Pagado',
  'Preparando',
  'Despachado',
  'Entregado',
  'Cancelado',
  'DevueltoParcial',
  'DevueltoTotal',
];

export interface Actor {
  id: number | null;
  nombre: string;
}
export const actorDe = (u: DUsuario): Actor => ({ id: u.id, nombre: u.nombre });
export const SISTEMA: Actor = { id: null, nombre: 'Sistema' };

// ── Búsquedas ─────────────────────────────────────────────────────────────────

export const usuarioPorId = (id: number): DUsuario | undefined =>
  db().usuarios.find((u) => u.id === id);
export const variantePorId = (id: number): DVariante | undefined =>
  db().variantes.find((v) => v.id === id);
export const productoPorId = (id: number): DProducto | undefined =>
  db().productos.find((p) => p.id === id);
export const categoriaPorId = (id: number) => db().categorias.find((c) => c.id === id);

export const noEncontrado = (que: string): DemoError =>
  new DemoError('NO_ENCONTRADO', 404, `${que} no encontrado.`);

/** Variante, producto y categoría activos: se puede comprar. */
export function vendible(v: DVariante): boolean {
  const p = productoPorId(v.idProducto);
  const c = p && categoriaPorId(p.idCategoria);
  return !!(v.activo && p?.activo && c?.activo);
}

// ── Bitácora e inventario ─────────────────────────────────────────────────────

export function auditar(
  actor: Actor,
  modulo: string,
  entidad: string,
  idEntidad: number,
  accion: 'Alta' | 'Cambio' | 'Baja' | 'Movimiento' | 'Transicion',
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
  fecha = nowIso(),
): void {
  db().bitacora.push({
    id: next('bitacora'),
    fecha,
    usuario: actor.nombre,
    idUsuario: actor.id,
    modulo,
    entidad,
    idEntidad,
    accion,
    antes,
    despues,
  });
}

export function mover(
  v: DVariante,
  tipo: 'Entrada' | 'Venta' | 'Ajuste' | 'Devolucion' | 'Cancelacion',
  delta: number,
  motivo: string,
  usuario: string,
  numeroPedido: string | null = null,
  fecha = nowIso(),
): void {
  v.fisica += delta;
  db().kardex.push({
    id: next('kardex'),
    idVariante: v.id,
    fecha,
    tipo,
    cantidad: delta,
    resultante: v.fisica,
    motivo,
    usuario,
    numeroPedido,
  });
}

export const disponible = (v: DVariante): number => v.fisica - v.reservada;

// ── Reservas (equivalente al job de liberación de 60 s) ───────────────────────

export function liberarReserva(dueno: string): void {
  const s = db();
  const i = s.reservas.findIndex((r) => r.dueno === dueno);
  if (i < 0) return;
  for (const l of s.reservas[i]!.lineas) {
    const v = variantePorId(l.idVariante);
    if (v) v.reservada = Math.max(0, v.reservada - l.cantidad);
  }
  s.reservas.splice(i, 1);
}

/** Libera las reservas vencidas. Devuelve true si liberó alguna. */
export function barrerReservas(): boolean {
  const ahora = Date.now();
  const vencidas = db().reservas.filter((r) => Date.parse(r.expiraEn) <= ahora);
  for (const r of vencidas) liberarReserva(r.dueno);
  return vencidas.length > 0;
}

export const reservaDe = (dueno: string): DReserva | undefined =>
  db().reservas.find((r) => r.dueno === dueno);

/** Existencia que puede ver este comprador: lo libre más lo que él mismo tiene apartado. */
export function disponiblePara(v: DVariante, dueno: string): number {
  const propia =
    reservaDe(dueno)
      ?.lineas.filter((l) => l.idVariante === v.id)
      .reduce((a, l) => a + l.cantidad, 0) ?? 0;
  return disponible(v) + propia;
}

// ── Cupones ───────────────────────────────────────────────────────────────────

const MENSAJES: Record<string, string> = {
  CUPON_INVALIDO: 'El cupón no existe o no está activo.',
  CUPON_FUERA_VIGENCIA: 'El cupón está vencido o aún no está vigente.',
  CUPON_AGOTADO: 'El cupón ya alcanzó su límite de usos.',
  CUPON_LIMITE_CLIENTE: 'Ya usaste este cupón el máximo de veces permitido.',
  CUPON_MONTO_MINIMO: 'Tu compra no alcanza el monto mínimo del cupón.',
  CUPON_SIN_PRODUCTOS_ELEGIBLES: 'Tu carrito no tiene productos de la categoría del cupón.',
};
const STATUS_CUPON: Record<string, number> = {
  CUPON_INVALIDO: 400,
  CUPON_FUERA_VIGENCIA: 400,
  CUPON_MONTO_MINIMO: 400,
  CUPON_AGOTADO: 409,
  CUPON_LIMITE_CLIENTE: 409,
  CUPON_SIN_PRODUCTOS_ELEGIBLES: 400,
};

export interface EvalCupon {
  valido: boolean;
  motivo: string | null;
  mensaje: string | null;
  descuento: number;
  elegible: number;
}

export function evaluarCupon(
  c: DCupon | undefined,
  lineas: { monto: number; idCategoria: number }[],
  idUsuario: number | null,
): EvalCupon {
  const subtotal = lineas.reduce((a, l) => a + l.monto, 0);
  const elegible = lineas
    .filter((l) => c?.idCategoria == null || l.idCategoria === c.idCategoria)
    .reduce((a, l) => a + l.monto, 0);
  let motivo: string | null = null;
  const ahora = Date.now();
  if (!c || !c.activo) motivo = 'CUPON_INVALIDO';
  else if (ahora < Date.parse(c.vigenteDesde) || ahora > Date.parse(c.vigenteHasta))
    motivo = 'CUPON_FUERA_VIGENCIA';
  else if (c.usosTotalesActual >= c.usosTotalesMax) motivo = 'CUPON_AGOTADO';
  else if (
    idUsuario !== null &&
    db().cuponUsos.filter((u) => u.idCupon === c.id && u.idUsuario === idUsuario).length >=
      c.usosPorCliente
  )
    motivo = 'CUPON_LIMITE_CLIENTE';
  else if (subtotal < c.montoMinimo) motivo = 'CUPON_MONTO_MINIMO';
  else if (elegible <= 0) motivo = 'CUPON_SIN_PRODUCTOS_ELEGIBLES';
  let descuento = 0;
  if (!motivo && c) {
    descuento =
      c.tipo === 'Porcentaje'
        ? round2((elegible * c.valor) / 100)
        : c.valor < elegible
          ? c.valor
          : elegible;
  }
  return {
    valido: !motivo,
    motivo,
    mensaje: motivo ? MENSAJES[motivo]! : null,
    descuento: round2(descuento),
    elegible,
  };
}

export const errorCupon = (e: EvalCupon): DemoError =>
  new DemoError(
    e.motivo as 'CUPON_INVALIDO',
    STATUS_CUPON[e.motivo ?? 'CUPON_INVALIDO'] ?? 400,
    e.mensaje ?? '',
  );

export const cuponVigente = (c: DCupon): boolean => {
  const t = Date.now();
  return (
    c.activo &&
    t >= Date.parse(c.vigenteDesde) &&
    t <= Date.parse(c.vigenteHasta) &&
    c.usosTotalesActual < c.usosTotalesMax
  );
};

export function cuponDto(c: DCupon): Cupon {
  return {
    idCupon: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    valor: c.valor,
    montoMinimo: c.montoMinimo,
    usosTotalesMax: c.usosTotalesMax,
    usosTotalesActual: c.usosTotalesActual,
    usosPorCliente: c.usosPorCliente,
    idCategoria: c.idCategoria,
    categoria: c.idCategoria ? (categoriaPorId(c.idCategoria)?.nombre ?? null) : null,
    vigenteDesde: c.vigenteDesde,
    vigenteHasta: c.vigenteHasta,
    activo: c.activo,
    vigente: cuponVigente(c),
  };
}

// ── Carritos ──────────────────────────────────────────────────────────────────

export const imagenPrincipal = (idProducto: number): string | null => {
  const imgs = db()
    .imagenes.filter((i) => i.idProducto === idProducto)
    .sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.orden - b.orden);
  return imgs[0]?.url ?? null;
};

export function precioVigente(v: DVariante, dueno: string): number {
  return reservaDe(dueno)?.lineas.find((l) => l.idVariante === v.id)?.precio ?? v.precio;
}

interface LineaCalc {
  linea: CarritoLinea;
  idCategoria: number;
}

function lineasDe(c: DCarrito): LineaCalc[] {
  const out: LineaCalc[] = [];
  for (const l of c.lineas) {
    const v = variantePorId(l.idVariante);
    const p = v && productoPorId(v.idProducto);
    if (!v || !p) continue;
    const disp = disponiblePara(v, c.dueno);
    const precio = precioVigente(v, c.dueno);
    out.push({
      idCategoria: p.idCategoria,
      linea: {
        idCarritoLinea: l.id,
        idVariante: v.id,
        idProducto: p.id,
        sku: v.sku,
        nombreProducto: p.nombre,
        atributos: v.atributos,
        imagen: imagenPrincipal(p.id),
        precioUnitario: precio,
        cantidad: l.cantidad,
        disponible: Math.max(0, disp),
        totalLinea: round2(precio * l.cantidad),
        problema: !vendible(v)
          ? 'INACTIVA'
          : disp <= 0
            ? 'SIN_STOCK'
            : l.cantidad > disp
              ? 'EXCEDE_DISPONIBLE'
              : null,
      },
    });
  }
  return out;
}

export const carritoVacio = (): Carrito => ({
  idCarrito: null,
  tokenInvitado: null,
  subtotal: 0,
  descuento: 0,
  total: 0,
  iva: 0,
  cuponCodigo: null,
  cuponValido: null,
  cuponMotivo: null,
  cuponMensaje: null,
  cantidadItems: 0,
  reservaExpiraEn: null,
  lineas: [],
});

export function carritoDto(c: DCarrito | undefined): Carrito {
  if (!c) return carritoVacio();
  const calc = lineasDe(c);
  const subtotal = round2(calc.reduce((a, l) => a + l.linea.totalLinea, 0));
  const cupon = c.idCupon ? db().cupones.find((x) => x.id === c.idCupon) : undefined;
  const ev = c.idCupon
    ? evaluarCupon(
        cupon,
        calc.map((l) => ({ monto: l.linea.totalLinea, idCategoria: l.idCategoria })),
        c.idUsuario,
      )
    : null;
  const descuento = ev?.valido ? ev.descuento : 0;
  const total = round2(subtotal - descuento);
  return {
    idCarrito: c.id,
    tokenInvitado: c.token,
    subtotal,
    descuento,
    total,
    iva: ivaDe(total),
    cuponCodigo: cupon?.codigo ?? null,
    cuponValido: ev ? ev.valido : null,
    cuponMotivo: ev ? ev.motivo : null,
    cuponMensaje: ev ? ev.mensaje : null,
    cantidadItems: calc.reduce((a, l) => a + l.linea.cantidad, 0),
    reservaExpiraEn: reservaDe(c.dueno)?.expiraEn ?? null,
    lineas: calc.map((l) => l.linea),
  };
}

export const carritoDe = (dueno: string): DCarrito | undefined =>
  db().carritos.find((c) => c.dueno === dueno);

export function crearCarrito(dueno: string, idUsuario: number | null): DCarrito {
  const c: DCarrito = {
    id: next('carrito'),
    dueno,
    token: idUsuario === null ? dueno.slice(2) : null,
    idUsuario,
    lineas: [],
    idCupon: null,
    actualizado: nowIso(),
  };
  db().carritos.push(c);
  return c;
}

export function tocarCarrito(c: DCarrito): void {
  c.actualizado = nowIso();
  // Cambiar el carrito invalida el checkout en curso.
  liberarReserva(c.dueno);
  emitirReportes('carritos');
}

/** Fusiona el carrito de invitado en el del usuario al iniciar sesión. */
export function fusionarInvitado(token: string | null, u: DUsuario): void {
  if (!token || u.rol !== 'Cliente') return;
  const s = db();
  const g = carritoDe(`g:${token}`);
  if (!g) return;
  const destino = carritoDe(`u:${u.id}`) ?? crearCarrito(`u:${u.id}`, u.id);
  for (const l of g.lineas) {
    const v = variantePorId(l.idVariante);
    if (!v || !vendible(v)) continue;
    const existente = destino.lineas.find((x) => x.idVariante === l.idVariante);
    const tope = Math.max(0, disponible(v));
    if (existente) existente.cantidad = Math.min(tope, existente.cantidad + l.cantidad);
    else if (tope > 0)
      destino.lineas.push({
        id: next('carritoLinea'),
        idVariante: l.idVariante,
        cantidad: Math.min(tope, l.cantidad),
      });
  }
  destino.idCupon ??= g.idCupon;
  destino.actualizado = nowIso();
  s.carritos.splice(s.carritos.indexOf(g), 1);
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

export function productoResumen(p: DProducto, admin: boolean): ProductoResumen {
  const vars = db().variantes.filter((v) => v.idProducto === p.id && (admin || v.activo));
  const act = vars.filter((v) => v.activo);
  const precios = act.map((v) => v.precio);
  const cat = categoriaPorId(p.idCategoria)!;
  return {
    idProducto: p.id,
    nombre: p.nombre,
    categoria: { idCategoria: cat.id, nombre: cat.nombre },
    precioDesde: precios.length ? Math.min(...precios) : null,
    precioHasta: precios.length ? Math.max(...precios) : null,
    imagenPrincipal: imagenPrincipal(p.id),
    hayStock: act.some((v) => disponible(v) > 0),
    activo: p.activo,
  };
}

export function productoDetalle(p: DProducto, admin: boolean): ProductoDetalle {
  const vars = db().variantes.filter((v) => v.idProducto === p.id && (admin || v.activo));
  return {
    ...productoResumen(p, admin),
    descripcion: p.descripcion,
    imagenes: db()
      .imagenes.filter((i) => i.idProducto === p.id)
      .sort((a, b) => a.orden - b.orden || a.id - b.id)
      .map((i) => ({
        idImagen: i.id,
        url: i.url,
        orden: i.orden,
        esPrincipal: i.esPrincipal,
      })),
    variantes: vars.map((v) => ({
      idVariante: v.id,
      sku: v.sku,
      atributos: v.atributos,
      precio: v.precio,
      disponible: Math.max(0, disponible(v)),
      activo: v.activo,
    })),
  };
}

export function existenciaListado(v: DVariante): ExistenciaListado {
  const p = productoPorId(v.idProducto)!;
  const c = categoriaPorId(p.idCategoria)!;
  return {
    idVariante: v.id,
    sku: v.sku,
    producto: p.nombre,
    atributos: v.atributos,
    fisica: v.fisica,
    reservada: v.reservada,
    disponible: disponible(v),
    idCategoria: c.id,
    categoria: c.nombre,
    varianteActiva: v.activo,
  };
}

export const direccionDto = (d: DDireccion): Direccion => ({
  idDireccion: d.id,
  alias: d.alias,
  destinatario: d.destinatario,
  linea1: d.linea1,
  linea2: d.linea2,
  ciudad: d.ciudad,
  departamento: d.departamento,
  codigoPostal: d.codigoPostal,
  telefono: d.telefono,
  esPrincipal: d.esPrincipal,
});

// ── Pedidos ───────────────────────────────────────────────────────────────────

export interface NuevoPedido {
  usuario: DUsuario;
  direccion: DDireccion;
  metodoEnvio: { nombre: string; costo: number };
  cupon: DCupon | null;
  lineas: { idVariante: number; cantidad: number; precio: number }[];
  fecha: string;
  llave: string | null;
  /** Cuánto de la existencia estaba apartado por la reserva (se libera al vender). */
  liberaReserva: boolean;
}

/** Equivalente a SP_Pedidos_Crear: precios, descuento por línea, existencias, kardex y cupón. */
export function registrarPedido(n: NuevoPedido): DPedido {
  const s = db();
  const id = next('pedido');
  const dia = gtDate(n.fecha).replaceAll('-', '');
  const numero = `SC-${dia}-${String(id).padStart(6, '0')}`;
  const base = n.lineas.map((l) => {
    const v = variantePorId(l.idVariante)!;
    const p = productoPorId(v.idProducto)!;
    return { l, v, p, monto: round2(l.precio * l.cantidad) };
  });
  const subtotal = round2(base.reduce((a, b) => a + b.monto, 0));
  const ev = n.cupon
    ? evaluarCupon(
        n.cupon,
        base.map((b) => ({ monto: b.monto, idCategoria: b.p.idCategoria })),
        n.usuario.id,
      )
    : null;
  const descuento = ev?.valido ? ev.descuento : 0;
  const elegibles = base.filter(
    (b) => n.cupon?.idCategoria == null || b.p.idCategoria === n.cupon.idCategoria,
  );
  const descLinea = new Map<number, number>();
  for (const b of elegibles) {
    descLinea.set(b.v.id, ev?.elegible ? round2((descuento * b.monto) / ev.elegible) : 0);
  }
  if (elegibles.length) {
    const residuo = round2(descuento - [...descLinea.values()].reduce((a, d) => a + d, 0));
    const ultima = elegibles[elegibles.length - 1]!.v.id;
    descLinea.set(ultima, round2((descLinea.get(ultima) ?? 0) + residuo));
  }
  const lineas: DPedidoLinea[] = base.map((b) => {
    const d = descLinea.get(b.v.id) ?? 0;
    return {
      id: next('pedidoLinea'),
      idVariante: b.v.id,
      idCategoria: b.p.idCategoria,
      idProducto: b.p.id,
      sku: b.v.sku,
      nombre: b.p.nombre,
      atributos: b.v.atributos,
      cantidad: b.l.cantidad,
      cantidadDevuelta: 0,
      precioUnitario: b.l.precio,
      descuentoLinea: d,
      totalLinea: round2(b.monto - d),
    };
  });
  const d = n.direccion;
  const pedido: DPedido = {
    id,
    numero,
    idUsuario: n.usuario.id,
    fecha: n.fecha,
    estado: 'Pagado',
    direccion: {
      destinatario: d.destinatario,
      linea1: d.linea1,
      linea2: d.linea2,
      ciudad: d.ciudad,
      departamento: d.departamento,
      codigoPostal: d.codigoPostal,
      telefono: d.telefono,
    },
    metodoEnvio: n.metodoEnvio.nombre,
    cuponCodigo: n.cupon && ev?.valido ? n.cupon.codigo : null,
    subtotal,
    descuento,
    costoEnvio: n.metodoEnvio.costo,
    total: round2(subtotal - descuento + n.metodoEnvio.costo),
    lineas,
    historial: [{ de: null, a: 'Pagado', usuario: n.usuario.nombre, nota: null, fecha: n.fecha }],
    devoluciones: [],
    llave: n.llave,
  };
  s.pedidos.push(pedido);
  for (const b of base) {
    if (n.liberaReserva) b.v.reservada = Math.max(0, b.v.reservada - b.l.cantidad);
    mover(b.v, 'Venta', -b.l.cantidad, `Venta ${numero}`, n.usuario.nombre, numero, n.fecha);
  }
  if (n.cupon && ev?.valido) {
    n.cupon.usosTotalesActual += 1;
    s.cuponUsos.push({ idCupon: n.cupon.id, idUsuario: n.usuario.id, idPedido: id });
  }
  auditar(
    actorDe(n.usuario),
    'Pedidos',
    'Pedido',
    id,
    'Alta',
    null,
    { numero, total: pedido.total },
    n.fecha,
  );
  return pedido;
}

export const montoDevuelto = (p: DPedido): number =>
  round2(p.devoluciones.reduce((a, d) => a + d.monto, 0));
export const itemsDe = (p: DPedido): number => p.lineas.reduce((a, l) => a + l.cantidad, 0);

export function detallePedido(p: DPedido, ver: Rol, reutilizado = false): PedidoDetalle {
  const u = usuarioPorId(p.idUsuario);
  const staff = ver !== 'Cliente';
  return {
    idPedido: p.id,
    numeroPedido: p.numero,
    fechaCreacion: p.fecha,
    estadoCodigo: p.estado,
    estadoNombre: ESTADO_NOMBRE[p.estado],
    cliente: { idUsuario: p.idUsuario, nombre: u?.nombre ?? 'Cliente', correo: u?.correo ?? '' },
    direccion: p.direccion,
    metodoEnvio: p.metodoEnvio,
    cuponCodigo: p.cuponCodigo,
    subtotal: p.subtotal,
    descuento: p.descuento,
    costoEnvio: p.costoEnvio,
    total: p.total,
    iva: ivaDe(p.total),
    montoDevuelto: montoDevuelto(p),
    cantidadItems: itemsDe(p),
    reutilizado,
    lineas: p.lineas.map((l) => ({
      idPedidoLinea: l.id,
      sku: l.sku,
      nombreProducto: l.nombre,
      atributos: l.atributos,
      cantidad: l.cantidad,
      cantidadDevuelta: l.cantidadDevuelta,
      precioUnitario: l.precioUnitario,
      descuentoLinea: l.descuentoLinea,
      totalLinea: l.totalLinea,
    })),
    historial: p.historial.map((h) => ({
      estadoAnteriorCodigo: h.de,
      estadoAnteriorNombre: h.de ? ESTADO_NOMBRE[h.de] : null,
      estadoNuevoCodigo: h.a,
      estadoNuevoNombre: ESTADO_NOMBRE[h.a],
      usuario: h.usuario,
      nota: h.nota,
      fecha: h.fecha,
    })),
    devoluciones: p.devoluciones.map((d) => ({
      idDevolucion: d.id,
      motivo: d.motivo,
      montoTotal: d.monto,
      fecha: d.fecha,
      usuario: d.usuario,
      lineas: d.lineas.map((l) => ({
        idPedidoLinea: l.idPedidoLinea,
        sku: l.sku,
        cantidad: l.cantidad,
        montoReembolso: l.monto,
      })),
    })),
    acciones: {
      puedeCancelar: p.estado === 'Pagado' || p.estado === 'Preparando',
      puedeDevolver: staff && (p.estado === 'Entregado' || p.estado === 'DevueltoParcial'),
      transiciones: staff ? [...TRANSICIONES[p.estado]] : [],
    },
  };
}

/** Cambia el estado y deja rastro en el historial y en la bitácora. */
export function cambiarEstado(
  p: DPedido,
  a: EstadoPedido,
  actor: Actor,
  nota: string | null,
  accion: 'Transicion' = 'Transicion',
): void {
  const de = p.estado;
  const fecha = nowIso();
  p.estado = a;
  p.historial.push({ de, a, usuario: actor.nombre, nota, fecha });
  auditar(actor, 'Pedidos', 'Pedido', p.id, accion, { estado: de }, { estado: a }, fecha);
  emitirReportes('ventas');
}
