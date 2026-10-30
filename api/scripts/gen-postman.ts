/* Genera docs/postman/*.json desde el mismo documento OpenAPI que sirve la API (no se desfasa).
   Uso: npm run docs:postman */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/openapi';

interface Param {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string };
}
interface Op {
  tags: string[];
  summary: string;
  description: string;
  parameters?: Param[];
  requestBody?: unknown;
  security?: unknown[];
}
type Spec = { paths: Record<string, Record<string, Op>> };

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/postman');

const BODIES: Record<string, unknown> = {
  'POST /auth/register': {
    nombre: 'Cliente Demo',
    correo: 'demo@correo.test',
    contrasena: 'ShopCart2026!',
  },
  'POST /me/direcciones': {
    alias: 'Casa',
    destinatario: 'Carla Cliente',
    linea1: '5a avenida 10-20 zona 10',
    ciudad: 'Guatemala',
    departamento: 'Guatemala',
    telefono: '55551234',
    esPrincipal: true,
  },
  'PUT /me/direcciones/:id': {
    alias: 'Casa',
    destinatario: 'Carla Cliente',
    linea1: '6a avenida 11-21 zona 10',
    ciudad: 'Guatemala',
    departamento: 'Guatemala',
    telefono: '55551234',
    esPrincipal: true,
  },
  'POST /admin/usuarios': {
    nombre: 'Nuevo Operador',
    correo: 'nuevo.operador@shopcart.test',
    contrasena: 'ShopCart2026!',
    rol: 'Operador',
  },
  'PATCH /admin/usuarios/:id': { nombre: 'Nombre actualizado' },
  'POST /catalog/categorias': { nombre: 'Nueva categoría', descripcion: 'Descripción' },
  'PUT /catalog/categorias/:id': {
    nombre: 'Categoría editada',
    descripcion: 'Descripción',
    activo: true,
  },
  'POST /catalog/productos': {
    idCategoria: 1,
    nombre: 'Producto nuevo',
    descripcion: 'Descripción del producto',
  },
  'PUT /catalog/productos/:id': {
    idCategoria: 1,
    nombre: 'Producto editado',
    descripcion: 'Descripción',
    activo: true,
  },
  'POST /catalog/productos/:id/variantes': {
    sku: 'NUEVO-001',
    atributos: { Talla: 'M', Color: 'Negro' },
    precio: 99.9,
  },
  'PUT /catalog/variantes/:id': {
    sku: 'NUEVO-001',
    atributos: { Talla: 'M', Color: 'Negro' },
    precio: 109.9,
    activo: true,
  },
  'POST /catalog/productos/:id/imagenes': {
    url: 'https://picsum.photos/seed/demo/600/600',
    orden: 0,
    esPrincipal: true,
  },
  'POST /inventory/entradas': { idVariante: 1, cantidad: 25, motivo: 'Compra a proveedor' },
  'POST /inventory/ajustes': { idVariante: 1, cantidad: -2, motivo: 'Merma por daño' },
  'POST /cart/items': { idVariante: 1, cantidad: 2 },
  'PATCH /cart/items/:id': { cantidad: 3 },
  'POST /cart/coupon': { codigo: 'BIENVENIDA10' },
  'POST /orders': {
    idDireccion: '{{idDireccion}}',
    idMetodoEnvio: 2,
    totalEsperado: '{{totalEsperado}}',
  },
  'PATCH /orders/:id/status': { estado: 'Preparando', nota: 'En bodega' },
  'POST /orders/:id/cancel': { motivo: 'Me arrepentí de la compra' },
  'POST /orders/:id/returns': {
    motivo: 'Producto defectuoso',
    lineas: [{ idPedidoLinea: 1, cantidad: 1 }],
  },
  'POST /coupons': {
    codigo: 'PROMO20',
    tipo: 'Porcentaje',
    valor: 20,
    montoMinimo: 0,
    usosTotalesMax: 100,
    usosPorCliente: 1,
    idCategoria: null,
    vigenteDesde: '2026-10-01T00:00:00Z',
    vigenteHasta: '2026-12-31T23:59:59Z',
    activo: true,
  },
  'PUT /coupons/:id': {
    codigo: 'PROMO20',
    tipo: 'Porcentaje',
    valor: 25,
    montoMinimo: 0,
    usosTotalesMax: 100,
    usosPorCliente: 1,
    idCategoria: null,
    vigenteDesde: '2026-10-01T00:00:00Z',
    vigenteHasta: '2026-12-31T23:59:59Z',
    activo: true,
  },
};

const QUERY_DEFAULTS: Record<string, string> = { page: '1', pageSize: '20' };

const exec = (lines: string[]) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});
const BASE_TESTS = [
  "pm.test('Respuesta con envelope', function () {",
  '  if (pm.response.code === 204) return;',
  '  const j = pm.response.json();',
  "  pm.expect(j).to.have.property('success');",
  "  if (j.success) pm.expect(j).to.have.property('data'); else pm.expect(j.error).to.have.property('code');",
  '});',
];
const SAVE_TOKEN = [
  'const j = pm.response.json();',
  "if (j.success) pm.collectionVariables.set('accessToken', j.data.accessToken);",
];
const SAVE_CART = [
  'const c = pm.response.json();',
  "if (c.success && c.data.tokenInvitado) pm.collectionVariables.set('cartToken', c.data.tokenInvitado);",
];
const SAVE_CHECKOUT = [
  'const k = pm.response.json();',
  'if (k.success) {',
  '  const o = k.data.opcionesEnvio.find(function (x) { return x.aplica; });',
  "  if (o) { pm.collectionVariables.set('idMetodoEnvio', o.idMetodoEnvio); pm.collectionVariables.set('totalEsperado', o.total); }",
  '}',
];

function request(method: string, path: string, op: Op, bodyOverride?: unknown, nameSuffix = '') {
  const key = `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`;
  const isPublic = !op.security;
  const parameters = op.parameters ?? [];
  const pathVars = parameters
    .filter((p) => p.in === 'path')
    .map((p) => ({ key: p.name, value: '1' }));
  const query = parameters
    .filter((p) => p.in === 'query')
    .map((p) => ({
      key: p.name,
      value: QUERY_DEFAULTS[p.name] ?? '',
      disabled: !p.required && !(p.name in QUERY_DEFAULTS),
    }));
  const headers = parameters
    .filter((p) => p.in === 'header')
    .map((p) => ({
      key: p.name,
      value: p.name === 'X-Cart-Token' ? '{{cartToken}}' : '{{$guid}}',
      disabled: p.name === 'X-Cart-Token',
    }));
  const body = bodyOverride ?? BODIES[key];
  if (body) headers.push({ key: 'Content-Type', value: 'application/json', disabled: false });

  const events = [exec(BASE_TESTS)];
  if (key === 'POST /auth/login' || key === 'POST /auth/register') events.push(exec(SAVE_TOKEN));
  if (key === 'POST /cart/items' || key === 'GET /cart') events.push(exec(SAVE_CART));
  if (key === 'POST /checkout' || key === 'GET /checkout') events.push(exec(SAVE_CHECKOUT));

  return {
    name: `${op.summary.split(' (')[0]}${nameSuffix}`,
    event: events,
    request: {
      method: method.toUpperCase(),
      description: `${op.description}\n\n${op.summary}`,
      header: headers,
      ...(isPublic ? { auth: { type: 'noauth' } } : {}),
      url: {
        raw: `{{baseUrl}}/api/v1${path.replace(/\{(\w+)\}/g, ':$1')}`,
        host: ['{{baseUrl}}'],
        path: [
          'api',
          'v1',
          ...path
            .replace(/\{(\w+)\}/g, ':$1')
            .split('/')
            .filter(Boolean),
        ],
        ...(query.length ? { query } : {}),
        ...(pathVars.length ? { variable: pathVars } : {}),
      },
      ...(body
        ? {
            body: {
              mode: 'raw',
              raw: JSON.stringify(body, null, 2),
              options: { raw: { language: 'json' } },
            },
          }
        : {}),
    },
  };
}

const spec = buildOpenApi() as unknown as Spec;
const folders = new Map<string, unknown[]>();

for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const tag = op.tags[0] ?? 'Otros';
    const list = folders.get(tag) ?? [];
    if (method === 'post' && path === '/auth/login') {
      for (const [who, correo] of [
        ['Cliente', 'cliente@shopcart.test'],
        ['Operador', 'operador@shopcart.test'],
        ['Administrador', 'admin@shopcart.test'],
      ] as const) {
        list.push(request(method, path, op, { correo, contrasena: 'ShopCart2026!' }, ` · ${who}`));
      }
    } else {
      list.push(request(method, path, op));
    }
    folders.set(tag, list);
  }
}

const collection = {
  info: {
    name: 'ShopCart API',
    description:
      'Generada desde /api/openapi.json (npm run docs:postman). Flujo sugerido: Autenticación → Login · Cliente; ' +
      'Carrito → Agregar producto; Checkout → Iniciar checkout; Pedidos → Pagar. ' +
      'Los scripts guardan accessToken, cartToken y el total esperado en variables de la colección.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'accessToken', value: '' },
    { key: 'cartToken', value: '' },
    { key: 'idDireccion', value: '1' },
    { key: 'idMetodoEnvio', value: '2' },
    { key: 'totalEsperado', value: '0' },
  ],
  item: [...folders.entries()].map(([name, item]) => ({ name, item })),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(
  resolve(OUT, 'ShopCart.postman_collection.json'),
  JSON.stringify(collection, null, 2) + '\n',
);
writeFileSync(
  resolve(OUT, 'ShopCart.postman_environment.json'),
  JSON.stringify(
    {
      name: 'ShopCart local',
      values: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
      _postman_variable_scope: 'environment',
    },
    null,
    2,
  ) + '\n',
);
const total = [...folders.values()].reduce((n, l) => n + l.length, 0);
console.log(`✔ ${total} requests en ${folders.size} carpetas → ${OUT}`);
