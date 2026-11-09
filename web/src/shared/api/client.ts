import {
  HEADER_CART_TOKEN,
  type AuthResponse,
  type ErrorCode,
  type PaginationMeta,
  type ReporteEvento,
} from '@shopcart/contracts';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode | 'RED',
    message: string,
    public readonly status: number,
    public readonly details: Record<string, unknown>[] = [],
  ) {
    super(message);
  }

  /** Mensajes por campo (`VALIDACION`): { campo: mensaje }. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) {
      const path = String(d.path ?? '');
      if (path && !(path in out)) out[path] = String(d.message ?? '');
    }
    return out;
  }
}

// ── Estado de sesión en memoria (el access token nunca toca el almacenamiento) ─

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (t: string | null): void => {
  accessToken = t;
};
export const setSessionLostHandler = (fn: (() => void) | null): void => {
  onSessionLost = fn;
};

// ── Token del carrito de invitado ─────────────────────────────────────────────

const CART_KEY = 'shopcart.cartToken';
// Marca (no secreta) de que este navegador tuvo sesión: evita pedir un refresh que sabemos que fallará.
const SESSION_KEY = 'shopcart.hadSession';
export const hadSession = (): boolean => localStorage.getItem(SESSION_KEY) === '1';
export const markSession = (on: boolean): void => {
  if (on) localStorage.setItem(SESSION_KEY, '1');
  else localStorage.removeItem(SESSION_KEY);
};

export const getCartToken = (): string | null => localStorage.getItem(CART_KEY);
export const setCartToken = (t: string | null): void => {
  if (t) localStorage.setItem(CART_KEY, t);
  else localStorage.removeItem(CART_KEY);
};

// ── Refresh de un solo vuelo: la rotación invalida el token anterior, así que
// dos refresh simultáneos revocarían la familia entera. ────────────────────────

export type RefreshResult =
  | { estado: 'ok'; auth: AuthResponse }
  /** El servidor dice que no hay sesión válida (cookie ausente, vencida o revocada). */
  | { estado: 'sin-sesion' }
  /** Fallo transitorio (429, 5xx, red): la sesión puede seguir siendo válida; NO se cierra. */
  | { estado: 'error'; mensaje: string };

let refreshing: Promise<RefreshResult> | null = null;

export function refreshSession(): Promise<RefreshResult> {
  if (!hadSession()) return Promise.resolve({ estado: 'sin-sesion' });
  refreshing ??= (async (): Promise<RefreshResult> => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (res.status === 401) {
        markSession(false);
        return { estado: 'sin-sesion' };
      }
      if (!res.ok) {
        const err = await parseError(res);
        return { estado: 'error', mensaje: err.message };
      }
      const body = (await res.json()) as { data: AuthResponse };
      accessToken = body.data.accessToken;
      return { estado: 'ok', auth: body.data };
    } catch {
      return { estado: 'error', mensaje: 'No se pudo conectar con el servidor.' };
    } finally {
      // Se libera en el siguiente tick para que los llamadores concurrentes compartan resultado.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

// ── Petición base ─────────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface Paged<T> {
  items: T[];
  meta: PaginationMeta;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ''}`;
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const cart = getCartToken();
  if (cart && !headers[HEADER_CART_TOKEN]) headers[HEADER_CART_TOKEN] = cart;
  try {
    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'include',
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    if (opts.signal) init.signal = opts.signal;
    return await fetch(buildUrl(path, opts.query), init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('RED', 'No se pudo conectar con el servidor. Revisa tu conexión.', 0);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code: ErrorCode; message: string; details?: Record<string, unknown>[] };
    };
    if (body.error) {
      return new ApiError(body.error.code, body.error.message, res.status, body.error.details);
    }
  } catch {
    /* cuerpo no JSON */
  }
  return new ApiError('INTERNO', 'Ocurrió un error inesperado.', res.status);
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  let res = await rawRequest(path, opts);
  // Token expirado: renovar de forma transparente y reintentar una vez.
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const err = await parseError(res.clone());
    if (err.code === 'TOKEN_EXPIRADO' || err.code === 'NO_AUTENTICADO') {
      const renewed = await refreshSession();
      if (renewed.estado === 'sin-sesion') {
        accessToken = null;
        onSessionLost?.();
        throw err;
      }
      if (renewed.estado === 'error') throw new ApiError('RED', renewed.mensaje, 0);
      res = await rawRequest(path, opts);
    }
  }
  if (!res.ok) throw await parseError(res);
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  return ((await res.json()) as { data: T }).data;
}

export async function apiPaged<T>(path: string, opts: RequestOptions = {}): Promise<Paged<T>> {
  const res = await send(path, opts);
  const body = (await res.json()) as { data: T[]; meta: PaginationMeta };
  return { items: body.data, meta: body.meta };
}

/** Descarga un archivo autenticado (el access token sigue solo en memoria). */
export async function descargar(
  path: string,
  query: Record<string, unknown> | undefined,
  filename: string,
): Promise<void> {
  const res = await send(path, { query });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/** Mantiene abierto el aviso del dashboard. Se detiene al abortar o si la sesión ya no sirve. */
export async function escucharReportes(
  onEvento: (evento: ReporteEvento) => void,
  onConexion: (viva: boolean) => void,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const res = await send('/reports/stream', { signal });
      onConexion(true);
      const reader = res.body?.getReader();
      if (!reader) throw new ApiError('RED', 'El servidor no abrió el flujo.', 0);
      const dec = new TextDecoder();
      let buf = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const bloques = buf.split('\n\n');
        buf = bloques.pop() ?? '';
        for (const bloque of bloques) {
          let nombre = 'message';
          const datos: string[] = [];
          for (const linea of bloque.split('\n')) {
            if (linea.startsWith(':') || linea === '') continue;
            if (linea.startsWith('event:')) nombre = linea.slice(6).trim();
            else if (linea.startsWith('data:')) datos.push(linea.slice(5).trim());
          }
          if (nombre !== 'reportes' || datos.length === 0) continue;
          onEvento(JSON.parse(datos.join('\n')) as ReporteEvento);
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return;
    } finally {
      onConexion(false);
    }
    await esperar(1500, signal);
  }
}

/** Respuesta con `data` de forma libre más `meta` de paginación (p. ej. el kardex). */

export async function apiWithMeta<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: PaginationMeta }> {
  const res = await send(path, opts);
  return (await res.json()) as { data: T; meta: PaginationMeta };
}
