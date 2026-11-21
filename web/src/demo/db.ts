import type { Atributos, Departamento, ErrorCode, EstadoPedido, Rol } from '@shopcart/contracts';

/* Estado completo de la demo: JSON puro en localStorage, con la fecha (hora de Guatemala) en la clave,
   así que cada día arranca desde el seed. Nada sale del navegador. */

export interface DUsuario {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  creado: string;
}
export interface DCategoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}
export interface DProducto {
  id: number;
  idCategoria: number;
  nombre: string;
  descripcion: string;
  activo: boolean;
  creado: string;
}
export interface DVariante {
  id: number;
  idProducto: number;
  sku: string;
  atributos: Atributos;
  precio: number;
  activo: boolean;
  fisica: number;
  reservada: number;
}
export interface DImagen {
  id: number;
  idProducto: number;
  url: string;
  orden: number;
  esPrincipal: boolean;
}
export interface DKardex {
  id: number;
  idVariante: number;
  fecha: string;
  tipo: 'Entrada' | 'Venta' | 'Ajuste' | 'Devolucion' | 'Cancelacion';
  cantidad: number;
  resultante: number;
  motivo: string;
  usuario: string;
  numeroPedido: string | null;
}
export interface DCarrito {
  id: number;
  /** `u:<idUsuario>` o `g:<token>`. */
  dueno: string;
  token: string | null;
  idUsuario: number | null;
  lineas: { id: number; idVariante: number; cantidad: number }[];
  idCupon: number | null;
  actualizado: string;
}
export interface DReserva {
  dueno: string;
  expiraEn: string;
  lineas: { idVariante: number; cantidad: number; precio: number }[];
}
export interface DCupon {
  id: number;
  codigo: string;
  tipo: 'Porcentaje' | 'Fijo';
  valor: number;
  montoMinimo: number;
  usosTotalesMax: number;
  usosTotalesActual: number;
  usosPorCliente: number;
  idCategoria: number | null;
  vigenteDesde: string;
  vigenteHasta: string;
  activo: boolean;
}
export interface DDireccion {
  id: number;
  idUsuario: number;
  alias: string;
  destinatario: string;
  linea1: string;
  linea2: string | null;
  ciudad: string;
  departamento: Departamento;
  codigoPostal: string | null;
  telefono: string;
  esPrincipal: boolean;
}
export interface DPedidoLinea {
  id: number;
  idVariante: number;
  idCategoria: number;
  idProducto: number;
  sku: string;
  nombre: string;
  atributos: Atributos;
  cantidad: number;
  cantidadDevuelta: number;
  precioUnitario: number;
  descuentoLinea: number;
  totalLinea: number;
}
export interface DPedido {
  id: number;
  numero: string;
  idUsuario: number;
  fecha: string;
  estado: EstadoPedido;
  direccion: Omit<DDireccion, 'id' | 'idUsuario' | 'alias' | 'esPrincipal'>;
  metodoEnvio: string;
  cuponCodigo: string | null;
  subtotal: number;
  descuento: number;
  costoEnvio: number;
  total: number;
  lineas: DPedidoLinea[];
  historial: {
    de: EstadoPedido | null;
    a: EstadoPedido;
    usuario: string;
    nota: string | null;
    fecha: string;
  }[];
  devoluciones: {
    id: number;
    motivo: string;
    monto: number;
    fecha: string;
    usuario: string;
    lineas: { idPedidoLinea: number; sku: string; cantidad: number; monto: number }[];
  }[];
  llave: string | null;
}
export interface DBitacora {
  id: number;
  fecha: string;
  usuario: string;
  idUsuario: number | null;
  modulo: string;
  entidad: string;
  idEntidad: number;
  accion: 'Alta' | 'Cambio' | 'Baja' | 'Movimiento' | 'Transicion';
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}
export interface DMetodoEnvio {
  id: number;
  nombre: string;
  costo: number;
  montoMinimo: number | null;
  dias: number;
}

export interface State {
  version: 1;
  fechaClave: string;
  seq: Record<string, number>;
  /** Id del usuario con "cookie" de refresh activa. */
  refresh: number | null;
  usuarios: DUsuario[];
  categorias: DCategoria[];
  productos: DProducto[];
  variantes: DVariante[];
  imagenes: DImagen[];
  kardex: DKardex[];
  carritos: DCarrito[];
  reservas: DReserva[];
  cupones: DCupon[];
  cuponUsos: { idCupon: number; idUsuario: number; idPedido: number }[];
  direcciones: DDireccion[];
  metodosEnvio: DMetodoEnvio[];
  pedidos: DPedido[];
  bitacora: DBitacora[];
}

export class DemoError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details: Record<string, unknown>[] = [],
  ) {
    super(message);
  }
}

// ── Tiempo ────────────────────────────────────────────────────────────────────

const fmtGt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' });
/** YYYY-MM-DD en hora de Guatemala. */
export const gtDate = (iso: string | number | Date): string => fmtGt.format(new Date(iso));
export const nowIso = (): string => new Date().toISOString();
export const addMs = (iso: string, ms: number): string =>
  new Date(Date.parse(iso) + ms).toISOString();
export const DAY = 86_400_000;

// ── Persistencia ──────────────────────────────────────────────────────────────

export const KEY_PREFIX = 'shopcart.demo.';
const stateKey = (fecha: string): string => `${KEY_PREFIX}state.${fecha}`;

let state: State | null = null;

export function initState(builder: () => State): void {
  const hoy = gtDate(Date.now());
  // Reinicio diario: los estados de otros días se descartan.
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(`${KEY_PREFIX}state.`) && k !== stateKey(hoy)) localStorage.removeItem(k);
  }
  // Otra pestaña de la demo cambió el estado: se adopta (la última escritura gana).
  window.addEventListener('storage', (e) => {
    if (e.key !== stateKey(hoy) || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue) as State;
    } catch {
      /* ignorar */
    }
  });
  const raw = localStorage.getItem(stateKey(hoy));
  if (raw) {
    try {
      const s = JSON.parse(raw) as State;
      if (s.version === 1) {
        state = s;
        return;
      }
    } catch {
      /* estado corrupto: se regenera */
    }
  }
  state = builder();
  persist();
}

let building: State | null = null;
/** Durante la construcción del seed, `db()` apunta al estado en construcción. */
export const setBuilding = (s: State | null): void => {
  building = s;
};

export const db = (): State => {
  const s = building ?? state;
  if (!s) throw new Error('Demo sin inicializar');
  return s;
};

export function persist(): void {
  if (!state) return;
  try {
    localStorage.setItem(stateKey(state.fechaClave), JSON.stringify(state));
  } catch {
    /* cuota llena: la demo sigue en memoria */
  }
}

/** Vuelve al seed del día (conserva la pestaña; el llamador recarga). */
export function resetDemo(): void {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(KEY_PREFIX) || k.startsWith('shopcart.')) localStorage.removeItem(k);
  }
  sessionStorage.removeItem('shopcart.idempotencyKey');
  state = null;
}

export const next = (name: string): number => {
  const s = db();
  s.seq[name] = (s.seq[name] ?? 0) + 1;
  return s.seq[name]!;
};

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
