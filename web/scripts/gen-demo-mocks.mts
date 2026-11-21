/* Genera la capa de mocks de la demo estática a partir del documento OpenAPI de la API.
 *
 *   npm run gen:demo -w web
 *
 * Fuente única: `buildOpenApi()` (api/src/openapi.ts), el mismo documento que sirve /api/docs.
 * Salidas (web/src/demo/generated/):
 *   - operations.ts : tabla tipada de operaciones (id, método, ruta, acceso, estado, forma de la
 *                     respuesta, errores de negocio). El motor de la demo debe implementar un handler por
 *                     cada `OperationId`: si la API gana o pierde un endpoint, la demo deja de compilar.
 *   - openapi.json  : el documento completo; solo lo lee `check-demo-mocks.mts` para validar las
 *                     respuestas del mock contra los esquemas (no entra en el bundle).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../../api/src/openapi';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/demo/generated');
const spec = buildOpenApi() as Json;

const ACCESS: [RegExp, string][] = [
  [/^Público;/, 'opcional'],
  [/^Público\./, 'publico'],
  [/^Requiere sesión/, 'autenticado'],
  [/^Rol: Cliente/, 'cliente'],
  [/^Roles: Operador/, 'operador'],
  [/^Rol: Administrador/, 'admin'],
];

const ops: Json[] = [];
for (const [path, item] of Object.entries<Json>(spec.paths)) {
  for (const [method, op] of Object.entries<Json>(item)) {
    const access = ACCESS.find(([re]) => re.test(op.description))?.[1];
    if (!access) throw new Error(`Acceso no reconocido en ${method} ${path}: ${op.description}`);
    const status = Number(Object.keys(op.responses).find((s) => /^2/.test(s)));
    const ok = op.responses[String(status)];
    const mime = Object.keys(ok.content ?? {})[0];
    let kind: string;
    if (status === 204) kind = 'none';
    else if (mime?.includes('spreadsheetml')) kind = 'xlsx';
    else if (mime === 'text/event-stream') kind = 'sse';
    else kind = ok.content['application/json'].schema.properties.meta ? 'paged' : 'json';
    const errors = ((op.responses['409']?.description as string | undefined) ?? '')
      .replace(/^Regla de negocio: /, '')
      .split(', ')
      .filter(Boolean);
    const params: Json[] = op.parameters ?? [];
    ops.push({
      id: op.operationId,
      method: method.toUpperCase(),
      path: path.replace(/\{(\w+)\}/g, ':$1'),
      tag: op.tags[0],
      summary: op.summary,
      access,
      status,
      kind,
      body: !!op.requestBody,
      idempotency: params.some((p) => p.name === 'Idempotency-Key'),
      cartToken: params.some((p) => p.name === 'X-Cart-Token'),
      errors,
    });
  }
}
ops.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const ts = `/* AUTO-GENERADO por web/scripts/gen-demo-mocks.mts desde el OpenAPI de la API. No editar. */

export type Acceso = 'publico' | 'opcional' | 'autenticado' | 'cliente' | 'operador' | 'admin';
export type Forma = 'json' | 'paged' | 'none' | 'xlsx' | 'sse';

export interface Operacion {
  readonly id: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Ruta Express relativa a /api/v1 (p. ej. /orders/:id). */
  readonly path: string;
  readonly tag: string;
  readonly summary: string;
  readonly access: Acceso;
  readonly status: number;
  readonly kind: Forma;
  readonly body: boolean;
  readonly idempotency: boolean;
  readonly cartToken: boolean;
  /** Códigos de error de negocio documentados (409). */
  readonly errors: readonly string[];
}

export const OPERATIONS = ${JSON.stringify(ops, null, 2)} as const satisfies readonly Operacion[];

export type OperationId = (typeof OPERATIONS)[number]['id'];
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'operations.ts'), ts);
writeFileSync(resolve(OUT, 'openapi.json'), JSON.stringify(spec, null, 2) + '\n');
console.log(`demo: ${ops.length} operaciones generadas desde el OpenAPI → ${OUT}`);
