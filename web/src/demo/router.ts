import type { ErrorCode } from '@shopcart/contracts';
import { OPERATIONS, type Operacion } from './generated/operations';
import { Archivo, Flujo, HANDLERS, Respuesta, type Ctx } from './handlers';
import { DemoError, db, persist } from './db';
import { barrerReservas, usuarioPorId } from './rules';
import { onReportes } from './bus';
import { crearXlsx } from './xlsx';

/* Servidor simulado: toma las operaciones del OpenAPI (ruta, método, acceso, estado, forma de la
   respuesta) y aplica el control de acceso del documento antes de llamar al handler de cada una. */

const PREFIJO = '/api/v1';

interface Ruta {
  op: Operacion;
  re: RegExp;
  nombres: string[];
  comodines: number;
}
const RUTAS: Ruta[] = OPERATIONS.map((op) => {
  const nombres: string[] = [];
  const re = new RegExp(
    `^${PREFIJO}${op.path.replace(/:(\w+)/g, (_m, n: string) => {
      nombres.push(n);
      return '([^/]+)';
    })}/?$`,
  );
  return { op, re, nombres, comodines: nombres.length };
}).sort((a, b) => a.comodines - b.comodines); // /orders/mine antes que /orders/:id

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const errorBody = (code: ErrorCode, message: string, details: Record<string, unknown>[] = []) => ({
  success: false,
  error: { code, message, details },
});

function autenticar(authorization: string | null, acceso: Operacion['access']) {
  const m = /^Bearer (demo\.(\d+)\.(\d+))$/.exec(authorization ?? '');
  if (!m) {
    if (authorization) throw new DemoError('NO_AUTENTICADO', 401, 'La sesión no es válida.');
    if (acceso === 'publico' || acceso === 'opcional') return null;
    throw new DemoError('NO_AUTENTICADO', 401, 'Inicia sesión para continuar.');
  }
  if (Number(m[3]) < Date.now()) throw new DemoError('TOKEN_EXPIRADO', 401, 'La sesión expiró.');
  const u = usuarioPorId(Number(m[2]));
  if (!u?.activo) throw new DemoError('NO_AUTENTICADO', 401, 'La sesión no es válida.');
  return u;
}

const ROLES_DE: Record<Operacion['access'], readonly string[] | null> = {
  publico: null,
  opcional: null,
  autenticado: null,
  cliente: ['Cliente'],
  operador: ['Operador', 'Administrador'],
  admin: ['Administrador'],
};

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function cabecera(
  init: RequestInit | undefined,
  input: RequestInfo | URL,
  nombre: string,
): string | null {
  const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return h.get(nombre);
}

function flujo(signal: AbortSignal | null | undefined): Response {
  const enc = new TextEncoder();
  let baja: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode('event: listo\ndata: {}\n\n'));
      baja = onReportes((alcance) => {
        try {
          controller.enqueue(
            enc.encode(`event: reportes\ndata: ${JSON.stringify({ alcance })}\n\n`),
          );
        } catch {
          baja?.();
        }
      });
      signal?.addEventListener('abort', () => {
        baja?.();
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      });
    },
    cancel() {
      baja?.();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
}

async function atender(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: URL,
): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const ruta = RUTAS.find((r) => r.re.test(url.pathname) && r.op.method === method);
  if (!ruta) {
    const existe = RUTAS.some((r) => r.re.test(url.pathname));
    return json(
      existe ? 405 : 404,
      errorBody('NO_ENCONTRADO', `Ruta no encontrada: ${method} ${url.pathname}`),
    );
  }
  const { op } = ruta;
  try {
    if (barrerReservas()) persist();
    const user = autenticar(cabecera(init, input, 'authorization'), op.access);
    const roles = ROLES_DE[op.access];
    if (roles && user && !roles.includes(user.rol))
      throw new DemoError('PROHIBIDO', 403, 'Tu rol no tiene permiso para esta operación.');
    const m = ruta.re.exec(url.pathname)!;
    const params = Object.fromEntries(
      ruta.nombres.map((n, i) => [n, decodeURIComponent(m[i + 1]!)]),
    );
    let body: unknown;
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        throw new DemoError('VALIDACION', 400, 'El cuerpo de la petición no es JSON válido.');
      }
    }
    if (op.body && body === undefined)
      throw new DemoError('VALIDACION', 400, 'Los datos enviados no son válidos.', [
        { path: '', message: 'Se esperaba un cuerpo JSON' },
      ]);
    const ctx: Ctx = {
      params,
      query: Object.fromEntries(url.searchParams),
      body,
      user,
      cartToken: cabecera(init, input, 'x-cart-token')?.toLowerCase() ?? null,
      idemKey: cabecera(init, input, 'idempotency-key'),
    };
    await pausa(op.kind === 'sse' ? 0 : 50 + Math.random() * 90);
    const out = HANDLERS[op.id as keyof typeof HANDLERS](ctx);
    if (op.method !== 'GET') persist();

    if (out instanceof Flujo) return flujo(init?.signal);
    if (out instanceof Archivo) {
      const bytes = crearXlsx(out.hojas);
      return new Response(new Blob([bytes as BlobPart]), {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }
    if (op.kind === 'none') return new Response(null, { status: 204 });
    const r = out instanceof Respuesta ? out : new Respuesta(out);
    return json(r.extra.status ?? op.status, {
      success: true,
      data: r.data,
      ...(r.extra.meta ? { meta: r.extra.meta } : {}),
    });
  } catch (e) {
    if (e instanceof DemoError) return json(e.status, errorBody(e.code, e.message, e.details));
    console.error('[demo] error interno en', op.id, e);
    return json(500, errorBody('INTERNO', 'Ocurrió un error inesperado.'));
  }
}

/** Intercepta `fetch` hacia /api/v1; el resto pasa intacto. */
export function instalarFetch(): void {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    if (!url.pathname.startsWith(`${PREFIJO}/`) && url.pathname !== PREFIJO)
      return real(input, init);
    return atender(input, init, url);
  };
}

export { db };
