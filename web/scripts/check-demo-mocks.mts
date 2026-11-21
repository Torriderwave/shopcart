/* eslint-disable @typescript-eslint/no-explicit-any */
/* Comprueba el mock de la demo contra el OpenAPI, sin navegador:
 *   - cada operación del documento se ejerce al menos una vez;
 *   - toda respuesta 2xx valida contra el esquema de la respuesta del OpenAPI;
 *   - el control de acceso del documento se cumple (401 sin sesión, 403 con rol insuficiente);
 *   - reglas de negocio clave (cupones, reserva, idempotencia, stock, devoluciones).
 * Uso: npm run check:demo -w web   (regenera antes los artefactos con gen:demo) */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Entorno de navegador mínimo ──────────────────────────────────────────────
const mem = (): Storage => {
  const o: Record<string, string> = {};
  const def = (k: string, f: unknown) =>
    Object.defineProperty(o, k, { value: f, enumerable: false });
  def('getItem', (k: string) => (k in o ? o[k] : null));
  def('setItem', (k: string, v: string) => void (o[k] = String(v)));
  def('removeItem', (k: string) => void delete o[k]);
  return o as unknown as Storage;
};
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.localStorage = mem();
g.sessionStorage = mem();
g.location = { href: 'http://demo.test/demos/shopcart/' };
g.addEventListener = () => undefined;

const { instalarDemo } = await import('../src/demo/install');
const { OPERATIONS } = await import('../src/demo/generated/operations');
instalarDemo();
// Sin latencia artificial ni tareas de fondo: el proceso debe terminar.
const spec = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/demo/generated/openapi.json'),
    'utf8',
  ),
);

// ── Validador de esquemas JSON (subconjunto que emite zod → OpenAPI 3.0) ─────
type S = Record<string, any>;
function validar(schema: S, v: unknown, ruta: string, errs: string[]): void {
  if (schema.$ref)
    return validar(spec.components.schemas[schema.$ref.split('/').pop()!], v, ruta, errs);
  if (v === null) {
    if (schema.nullable || schema.type === 'null') return;
    if (schema.anyOf?.some((s: S) => s.type === 'null' || s.nullable)) return;
    errs.push(`${ruta}: null no permitido`);
    return;
  }
  if (schema.anyOf || schema.oneOf) {
    const alts: S[] = schema.anyOf ?? schema.oneOf;
    if (
      !alts.some((a) => {
        const e: string[] = [];
        validar(a, v, ruta, e);
        return !e.length;
      })
    )
      errs.push(`${ruta}: ninguna alternativa coincide`);
    return;
  }
  if (schema.enum && !schema.enum.includes(v))
    errs.push(`${ruta}: ${JSON.stringify(v)} fuera de ${JSON.stringify(schema.enum)}`);
  switch (schema.type) {
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v))
        return void errs.push(`${ruta}: se esperaba objeto`);
      const o = v as Record<string, unknown>;
      for (const r of schema.required ?? [])
        if (!(r in o) || o[r] === undefined) errs.push(`${ruta}.${r}: requerido`);
      for (const [k, sub] of Object.entries<S>(schema.properties ?? {}))
        if (k in o) validar(sub, o[k], `${ruta}.${k}`, errs);
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
        for (const [k, x] of Object.entries(o))
          if (!(k in (schema.properties ?? {})))
            validar(schema.additionalProperties, x, `${ruta}.${k}`, errs);
      return;
    }
    case 'array':
      if (!Array.isArray(v)) return void errs.push(`${ruta}: se esperaba arreglo`);
      v.forEach((x, i) => validar(schema.items ?? {}, x, `${ruta}[${i}]`, errs));
      return;
    case 'string':
      if (typeof v !== 'string') errs.push(`${ruta}: se esperaba string, llegó ${typeof v}`);
      return;
    case 'integer':
      if (!Number.isInteger(v))
        errs.push(`${ruta}: se esperaba entero, llegó ${JSON.stringify(v)}`);
      return;
    case 'number':
      if (typeof v !== 'number') errs.push(`${ruta}: se esperaba número`);
      return;
    case 'boolean':
      if (typeof v !== 'boolean') errs.push(`${ruta}: se esperaba booleano`);
      return;
  }
}

// ── Cliente de pruebas ───────────────────────────────────────────────────────
const vistas = new Set<string>();
const fallos: string[] = [];
const BASE = 'http://demo.test/api/v1';
const esperar = (cond: boolean, msg: string) => {
  if (!cond) fallos.push(msg);
};

function opDe(method: string, path: string) {
  const full = path.split('?')[0]!;
  return [...OPERATIONS]
    .sort((a, b) => a.path.split(':').length - b.path.split(':').length)
    .find(
      (o) => o.method === method && new RegExp(`^${o.path.replace(/:\w+/g, '[^/]+')}$`).test(full),
    );
}

async function llamar(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; cart?: string; key?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cart) headers['X-Cart-Token'] = opts.cart;
  if (opts.key) headers['Idempotency-Key'] = opts.key;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const op = opDe(method, path);
  const ct = r.headers.get('content-type') ?? '';
  let json: any;
  if (ct.includes('json')) json = await r.json();
  if (r.ok && op) {
    vistas.add(op.id);
    const resp = spec.paths[op.path.replace(/:(\w+)/g, '{$1}')][method.toLowerCase()].responses;
    const def = resp[String(r.status)] ?? resp[String(op.status)];
    const schema = def?.content?.['application/json']?.schema;
    if (schema) {
      const errs: string[] = [];
      validar(schema, json, `${method} ${path}`, errs);
      for (const e of errs.slice(0, 5)) fallos.push(`contrato: ${e}`);
    } else if (def?.content?.['text/event-stream']) {
      await r.body?.cancel();
    }
  }
  if (r.status >= 500) fallos.push(`5xx en ${method} ${path}: ${JSON.stringify(json)}`);
  return {
    status: r.status,
    json,
    res: r,
    data: json?.data,
    code: json?.error?.code as string | undefined,
  };
}
const login = async (correo: string) =>
  (await llamar('POST', '/auth/login', { body: { correo, contrasena: 'x' } })).data;

// ── Escenario ────────────────────────────────────────────────────────────────
const adm = await login('irene.castellanos@shopcart-demo.local');
const ope = await login('bruno.ardiles@shopcart-demo.local');
const cli = await login('dalia.quintero@shopcart-demo.local');
const T = {
  a: adm.accessToken as string,
  o: ope.accessToken as string,
  c: cli.accessToken as string,
};
esperar(
  (
    await llamar('POST', '/auth/login', {
      body: { correo: 'nadie@shopcart-demo.local', contrasena: 'x' },
    })
  ).code === 'CREDENCIALES_INVALIDAS',
  'login con correo desconocido debe fallar',
);

// Acceso por documento: 401 sin sesión y 403 con rol insuficiente.
for (const op of OPERATIONS) {
  if (op.access === 'publico' || op.access === 'opcional') continue;
  const ruta = op.path.replace(/:\w+/g, '1');
  const sin = await llamar(op.method, ruta, { body: op.body ? {} : undefined });
  esperar(sin.status === 401, `${op.id}: sin sesión debía ser 401 y fue ${sin.status}`);
  const permitidos = {
    cliente: ['c'],
    operador: ['o', 'a'],
    admin: ['a'],
    autenticado: ['a', 'o', 'c'],
  }[op.access]!;
  const intruso = (['c', 'o', 'a'] as const).find((k) => !permitidos.includes(k));
  if (intruso) {
    const r = await llamar(op.method, ruta, { token: T[intruso], body: op.body ? {} : undefined });
    esperar(r.status === 403, `${op.id}: rol ${intruso} debía ser 403 y fue ${r.status}`);
  }
}

await llamar('GET', '/health');
await llamar('GET', '/auth/me', { token: T.c });
esperar((await llamar('POST', '/auth/refresh')).status === 200, 'refresh tras login');
const reg = await llamar('POST', '/auth/register', {
  body: {
    nombre: 'Persona Nueva',
    correo: 'nueva@shopcart-demo.local',
    contrasena: 'cualquier-cosa-1',
  },
});
esperar(reg.status === 201, 'registro');
esperar(
  (
    await llamar('POST', '/auth/register', {
      body: {
        nombre: 'Persona Nueva',
        correo: 'nueva@shopcart-demo.local',
        contrasena: 'cualquier-cosa-1',
      },
    })
  ).code === 'DUPLICADO',
  'registro duplicado',
);
esperar(
  (
    await llamar('POST', '/auth/register', {
      body: { nombre: 'x', correo: 'mal', contrasena: '1' },
    })
  ).code === 'VALIDACION',
  'registro inválido',
);

// Catálogo
const cats = (await llamar('GET', '/catalog/categorias')).data;
const prods = await llamar('GET', '/catalog/productos?pageSize=100&sort=precio:asc');
esperar(prods.json.meta.total === 40, `40 productos en catálogo (hay ${prods.json.meta.total})`);
await llamar(
  'GET',
  '/catalog/productos?q=lino&soloDisponibles=true&idCategoria=1&precioMin=1&precioMax=900',
);
const det = (await llamar('GET', `/catalog/productos/${prods.data[0].idProducto}`)).data;
esperar(
  (await llamar('GET', '/catalog/productos/99999')).status === 404,
  'producto inexistente → 404',
);
await llamar('GET', '/shipping-methods');

// Invitado: carrito, token, cupón, fusión al iniciar sesión.
const v0 = det.variantes[0].idVariante as number;
const g1 = await llamar('POST', '/cart/items', { body: { idVariante: v0, cantidad: 2 } });
const tok = g1.data.tokenInvitado as string;
esperar(!!tok && g1.status === 201, 'carrito de invitado emite token');
esperar(
  (await llamar('POST', '/cart/items', { cart: tok, body: { idVariante: v0, cantidad: 100000 } }))
    .code === 'VALIDACION',
  'cantidad fuera de rango',
);
esperar(
  (await llamar('POST', '/cart/items', { cart: tok, body: { idVariante: v0, cantidad: 900 } }))
    .code === 'CANTIDAD_EXCEDE_DISPONIBLE',
  'excede disponible',
);
esperar(
  (await llamar('GET', '/cart', { cart: tok })).data.cantidadItems === 2,
  'GET /cart invitado',
);

// Cliente: carrito, cupones
await llamar('DELETE', '/cart/coupon', { token: T.c });
const clienteViejo = (await llamar('GET', '/cart', { token: T.c })).data;
for (const l of clienteViejo.lineas)
  await llamar('DELETE', `/cart/items/${l.idCarritoLinea}`, { token: T.c });
const caro = prods.data[prods.data.length - 1];
const dcaro = (await llamar('GET', `/catalog/productos/${caro.idProducto}`)).data;
let cart = (
  await llamar('POST', '/cart/items', {
    token: T.c,
    body: { idVariante: dcaro.variantes[0].idVariante, cantidad: 1 },
  })
).data;
esperar(cart.lineas.length === 1, 'cliente agrega al carrito');
const l1 = cart.lineas[0];
const extra = (
  await llamar('POST', '/cart/items', { token: T.c, body: { idVariante: v0, cantidad: 1 } })
).data;
cart = (
  await llamar(
    'DELETE',
    `/cart/items/${extra.lineas.find((l: any) => l.idVariante === v0).idCarritoLinea}`,
    { token: T.c },
  )
).data;
esperar(cart.lineas.length === 1, 'quitar línea del carrito');
cart = (
  await llamar('PATCH', `/cart/items/${l1.idCarritoLinea}`, { token: T.c, body: { cantidad: 2 } })
).data;
esperar(cart.cantidadItems === 2, 'patch cantidad');
const cupones: Record<string, string> = {};
for (const c of ['NOEXISTE', 'AGOTADO-DEMO', 'CADUCADO-DEMO', 'PROXIMO-DEMO', 'CASA20'])
  cupones[c] =
    (await llamar('POST', '/cart/coupon', { token: T.c, body: { codigo: c } })).code ?? 'OK';
esperar(cupones.NOEXISTE === 'CUPON_INVALIDO', 'cupón inexistente');
esperar(cupones['AGOTADO-DEMO'] === 'CUPON_AGOTADO', 'cupón agotado');
esperar(cupones['CADUCADO-DEMO'] === 'CUPON_FUERA_VIGENCIA', 'cupón vencido');
esperar(cupones['PROXIMO-DEMO'] === 'CUPON_FUERA_VIGENCIA', 'cupón no vigente');
const antes = cart.subtotal as number;
cart = (await llamar('POST', '/cart/coupon', { token: T.c, body: { codigo: 'demo10' } })).data;
esperar(
  Math.abs(cart.descuento - antes * 0.1) < 0.011 &&
    cart.total === +(antes - cart.descuento).toFixed(2),
  `DEMO10 descuenta 10 % (${cart.descuento} de ${antes})`,
);

// Checkout y pago
esperar(
  (await llamar('GET', '/checkout', { token: T.c })).code === 'CHECKOUT_NO_INICIADO',
  'GET checkout sin iniciar',
);
const varStock = (
  await llamar('GET', '/inventory/existencias?q=' + dcaro.variantes[0].sku, { token: T.o })
).data[0];
const co = await llamar('POST', '/checkout', { token: T.c });
esperar(!!co.data.carrito.reservaExpiraEn, 'checkout reserva 15 min');
const stockRes = (
  await llamar('GET', '/inventory/existencias?q=' + dcaro.variantes[0].sku, { token: T.o })
).data[0];
esperar(
  stockRes.reservada === varStock.reservada + 2 && stockRes.fisica === varStock.fisica,
  'la reserva aparta existencias',
);
await llamar('GET', '/checkout', { token: T.c });
const dirs = (await llamar('GET', '/me/direcciones', { token: T.c })).data;
const nd = await llamar('POST', '/me/direcciones', {
  token: T.c,
  body: {
    alias: 'Prueba',
    destinatario: 'Dalia Quintero',
    linea1: '1a calle 1-1',
    ciudad: 'Guatemala',
    departamento: 'Guatemala',
    telefono: '55550000',
    esPrincipal: false,
  },
});
await llamar('PUT', `/me/direcciones/${nd.data.idDireccion}`, {
  token: T.c,
  body: {
    alias: 'Prueba 2',
    destinatario: 'Dalia Quintero',
    linea1: '2a calle 2-2',
    ciudad: 'Guatemala',
    departamento: 'Guatemala',
    telefono: '55550000',
    esPrincipal: false,
  },
});
await llamar('DELETE', `/me/direcciones/${nd.data.idDireccion}`, { token: T.c });
const envio = co.data.opcionesEnvio.find((o: any) => o.aplica) as any;
const llave = crypto.randomUUID();
esperar(
  (
    await llamar('POST', '/orders', {
      token: T.c,
      body: {
        idDireccion: dirs[0].idDireccion,
        idMetodoEnvio: envio.idMetodoEnvio,
        totalEsperado: envio.total,
      },
    })
  ).code === 'IDEMPOTENCY_KEY_REQUERIDA',
  'pago sin llave',
);
esperar(
  (
    await llamar('POST', '/orders', {
      token: T.c,
      key: llave,
      body: {
        idDireccion: dirs[0].idDireccion,
        idMetodoEnvio: envio.idMetodoEnvio,
        totalEsperado: envio.total + 1,
      },
    })
  ).code === 'TOTAL_CAMBIO',
  'total cambiado',
);
const pago = await llamar('POST', '/orders', {
  token: T.c,
  key: llave,
  body: {
    idDireccion: dirs[0].idDireccion,
    idMetodoEnvio: envio.idMetodoEnvio,
    totalEsperado: envio.total,
  },
});
esperar(
  pago.status === 201 && pago.data.estadoCodigo === 'Pagado' && pago.data.cuponCodigo === 'DEMO10',
  'pedido creado con cupón',
);
esperar(Math.abs(pago.data.total - envio.total) < 0.001, 'el pedido cobra el total acordado');
const repetido = await llamar('POST', '/orders', {
  token: T.c,
  key: llave,
  body: {
    idDireccion: dirs[0].idDireccion,
    idMetodoEnvio: envio.idMetodoEnvio,
    totalEsperado: envio.total,
  },
});
esperar(
  repetido.status === 200 &&
    repetido.data.reutilizado === true &&
    repetido.data.idPedido === pago.data.idPedido,
  'idempotencia: misma llave, mismo pedido',
);
const stockPost = (
  await llamar('GET', '/inventory/existencias?q=' + dcaro.variantes[0].sku, { token: T.o })
).data[0];
esperar(
  stockPost.fisica === varStock.fisica - 2 && stockPost.reservada === varStock.reservada,
  'la venta descuenta existencias y libera la reserva',
);
esperar(
  (await llamar('GET', '/cart', { token: T.c })).data.lineas.length === 0,
  'el carrito queda vacío tras pagar',
);

// Reserva vencida
await llamar('POST', '/cart/items', { token: T.c, body: { idVariante: v0, cantidad: 1 } });
await llamar('POST', '/checkout', { token: T.c });
const dbm = await import('../src/demo/db');
dbm.db().reservas.find((r) => r.dueno === `u:${cli.usuario.idUsuario}`)!.expiraEn = new Date(
  Date.now() - 1000,
).toISOString();
const venc = await llamar('POST', '/orders', {
  token: T.c,
  key: crypto.randomUUID(),
  body: { idDireccion: dirs[0].idDireccion, idMetodoEnvio: envio.idMetodoEnvio, totalEsperado: 1 },
});
esperar(
  venc.code === 'CHECKOUT_NO_INICIADO' || venc.code === 'RESERVA_VENCIDA',
  `reserva vencida se rechaza (${venc.code})`,
);
await llamar('POST', '/checkout', { token: T.c });
await llamar('DELETE', '/checkout', { token: T.c });
const rr = (await llamar('GET', '/inventory/existencias?q=' + det.variantes[0].sku, { token: T.o }))
  .data[0];
esperar(rr.reservada === 0, 'cancelar el checkout libera la reserva');

// Fusión del carrito de invitado
const fus = await login('mateo.solorzano@shopcart-demo.local').then(async (a) => {
  const r = await llamar('POST', '/auth/login', {
    cart: tok,
    body: { correo: 'mateo.solorzano@shopcart-demo.local', contrasena: 'x' },
  });
  return { a, r, cart: (await llamar('GET', '/cart', { token: r.data.accessToken })).data };
});
esperar(fus.cart.cantidadItems === 2, 'el carrito de invitado se fusiona al iniciar sesión');
await llamar('POST', '/auth/logout', { token: fus.r.data.accessToken });

// Pedidos
const mis = await llamar('GET', '/orders/mine?sort=total:desc&estado=Entregado', { token: T.c });
await llamar('GET', '/orders/mine', { token: T.c });
esperar(mis.json.meta.total >= 0, 'mis pedidos');
const todos = await llamar('GET', '/orders?pageSize=100&cliente=quintero', { token: T.o });
await llamar('GET', '/orders?numero=SC-', { token: T.a });
await llamar('GET', `/orders/${pago.data.idPedido}`, { token: T.c });
const ajeno = (await llamar('GET', '/orders?pageSize=100', { token: T.a })).data.find(
  (p: any) => p.idUsuario !== cli.usuario.idUsuario,
);
esperar(
  (await llamar('GET', `/orders/${ajeno.idPedido}`, { token: T.c })).code === 'PROHIBIDO',
  'un cliente no ve pedidos ajenos',
);
void todos;
esperar(
  (
    await llamar('PATCH', `/orders/${pago.data.idPedido}/status`, {
      token: T.o,
      body: { estado: 'Entregado' },
    })
  ).code === 'TRANSICION_INVALIDA',
  'transición inválida',
);
for (const e of ['Preparando', 'Despachado', 'Entregado'])
  esperar(
    (
      await llamar('PATCH', `/orders/${pago.data.idPedido}/status`, {
        token: T.o,
        body: { estado: e },
      })
    ).status === 200,
    `transición a ${e}`,
  );
esperar(
  (
    await llamar('POST', `/orders/${pago.data.idPedido}/cancel`, {
      token: T.c,
      body: { motivo: 'prueba' },
    })
  ).code === 'PEDIDO_NO_CANCELABLE',
  'entregado no se cancela',
);
const lineaP = pago.data.lineas[0];
esperar(
  (
    await llamar('POST', `/orders/${pago.data.idPedido}/returns`, {
      token: T.o,
      body: { motivo: 'prueba', lineas: [{ idPedidoLinea: lineaP.idPedidoLinea, cantidad: 99 }] },
    })
  ).code === 'DEVOLUCION_EXCEDE_VENDIDO',
  'devolución excede lo vendido',
);
const dev = await llamar('POST', `/orders/${pago.data.idPedido}/returns`, {
  token: T.o,
  body: {
    motivo: 'No era lo esperado',
    lineas: [{ idPedidoLinea: lineaP.idPedidoLinea, cantidad: lineaP.cantidad }],
  },
});
esperar(
  dev.status === 201 &&
    dev.data.estadoCodigo === 'DevueltoTotal' &&
    Math.abs(dev.data.montoDevuelto - lineaP.totalLinea) < 0.001,
  'devolución total reembolsa la línea exacta',
);
// Cancelación por el cliente de un pedido recién pagado (reintegra existencias)
await llamar('POST', '/cart/items', { token: T.c, body: { idVariante: v0, cantidad: 1 } });
await llamar('POST', '/checkout', { token: T.c });
const co2 = (await llamar('GET', '/checkout', { token: T.c })).data;
const opt2 = co2.opcionesEnvio.find((o: any) => o.aplica && o.costo > 0);
const p2 = await llamar('POST', '/orders', {
  token: T.c,
  key: crypto.randomUUID(),
  body: {
    idDireccion: dirs[0].idDireccion,
    idMetodoEnvio: opt2.idMetodoEnvio,
    totalEsperado: opt2.total,
  },
});
const c2 = await llamar('POST', `/orders/${p2.data.idPedido}/cancel`, {
  token: T.c,
  body: { motivo: 'Cambié de opinión' },
});
esperar(c2.data?.estadoCodigo === 'Cancelado', 'cancelación del cliente');

// Inventario
const ex = await llamar('GET', '/inventory/existencias?soloSinStock=true&sort=fisica:asc', {
  token: T.o,
});
await llamar('GET', '/inventory/existencias?idCategoria=1&q=lino', { token: T.o });
const vid = prods.data[0] && det.variantes[0].idVariante;
const e1 = await llamar('POST', '/inventory/entradas', {
  token: T.o,
  body: { idVariante: vid, cantidad: 10, motivo: 'Reposición de prueba' },
});
const e2 = await llamar('POST', '/inventory/ajustes', {
  token: T.o,
  body: { idVariante: vid, cantidad: -3, motivo: 'Merma de prueba' },
});
esperar(e2.data.fisica === e1.data.fisica - 3, 'ajuste resta');
esperar(
  (
    await llamar('POST', '/inventory/ajustes', {
      token: T.o,
      body: { idVariante: vid, cantidad: -1_000_000, motivo: 'imposible' },
    })
  ).code === 'AJUSTE_INVALIDO',
  'un ajuste que deja la existencia negativa se rechaza',
);
const kx = await llamar('GET', `/inventory/variantes/${vid}/kardex?tipo=Entrada`, { token: T.o });
esperar(kx.json.meta && kx.data.movimientos.length > 0, 'kardex con meta');
void ex;

// Admin: catálogo
const cn = await llamar('POST', '/catalog/categorias', {
  token: T.a,
  body: { nombre: 'Categoría de prueba', descripcion: 'x' },
});
esperar(
  (
    await llamar('POST', '/catalog/categorias', {
      token: T.a,
      body: { nombre: 'categoria de prueba' },
    })
  ).code === 'DUPLICADO',
  'categoría duplicada',
);
await llamar('PUT', `/catalog/categorias/${cn.data.idCategoria}`, {
  token: T.a,
  body: { nombre: 'Categoría de prueba 2', descripcion: null, activo: true },
});
const pn = await llamar('POST', '/catalog/productos', {
  token: T.a,
  body: { idCategoria: cn.data.idCategoria, nombre: 'Producto de prueba', descripcion: 'x' },
});
esperar(
  (await llamar('DELETE', `/catalog/categorias/${cn.data.idCategoria}`, { token: T.a })).code ===
    'EN_USO',
  'categoría con productos activos no se baja',
);
await llamar('PUT', `/catalog/productos/${pn.data.idProducto}`, {
  token: T.a,
  body: {
    idCategoria: cn.data.idCategoria,
    nombre: 'Producto de prueba 2',
    descripcion: 'y',
    activo: true,
  },
});
const vn = await llamar('POST', `/catalog/productos/${pn.data.idProducto}/variantes`, {
  token: T.a,
  body: { sku: 'zz-1', atributos: { Color: 'Rojo' }, precio: 10 },
});
esperar(
  (
    await llamar('POST', `/catalog/productos/${pn.data.idProducto}/variantes`, {
      token: T.a,
      body: { sku: 'ZZ-1', atributos: {}, precio: 10 },
    })
  ).code === 'DUPLICADO',
  'SKU duplicado',
);
const idv = vn.data.variantes[0].idVariante;
await llamar('PUT', `/catalog/variantes/${idv}`, {
  token: T.a,
  body: { sku: 'ZZ-1', atributos: { Color: 'Rojo' }, precio: 12.5, activo: true },
});
const im = await llamar('POST', `/catalog/productos/${pn.data.idProducto}/imagenes`, {
  token: T.a,
  body: { url: '/demos/shopcart/productos/01.jpg', orden: 0, esPrincipal: true },
});
await llamar('DELETE', `/catalog/imagenes/${im.data.imagenes[0].idImagen}`, { token: T.a });
await llamar('DELETE', `/catalog/variantes/${idv}`, { token: T.a });
await llamar('DELETE', `/catalog/productos/${pn.data.idProducto}`, { token: T.a });
await llamar('DELETE', `/catalog/categorias/${cn.data.idCategoria}`, { token: T.a });
esperar(
  (await llamar('GET', `/catalog/productos/${pn.data.idProducto}`)).status === 404,
  'producto dado de baja no se ve en la tienda',
);
await llamar('GET', '/catalog/categorias?incluirInactivas=true', { token: T.a });
await llamar('GET', '/catalog/productos?incluirInactivos=true&pageSize=100', { token: T.a });
void cats;

// Admin: usuarios, cupones, reportes, bitácora
await llamar('GET', '/admin/usuarios?rol=Cliente&activo=true&sort=correo:desc', { token: T.a });
const un = await llamar('POST', '/admin/usuarios', {
  token: T.a,
  body: {
    nombre: 'Operadora Nueva',
    correo: 'op.nueva@shopcart-demo.local',
    contrasena: 'cualquier-cosa-1',
    rol: 'Operador',
  },
});
await llamar('PATCH', `/admin/usuarios/${un.data.idUsuario}`, {
  token: T.a,
  body: { activo: false },
});
esperar(
  (
    await llamar('POST', '/auth/login', {
      body: { correo: 'op.nueva@shopcart-demo.local', contrasena: 'x' },
    })
  ).code === 'CREDENCIALES_INVALIDAS',
  'usuario desactivado no entra',
);
await llamar('GET', '/coupons?sort=usos:desc&vigente=true', { token: T.a });
const hoy = new Date();
const masMes = new Date(Date.now() + 30 * 86400000);
const cn2 = await llamar('POST', '/coupons', {
  token: T.a,
  body: {
    codigo: 'prueba-20',
    tipo: 'Porcentaje',
    valor: 20,
    montoMinimo: 0,
    usosTotalesMax: 10,
    usosPorCliente: 1,
    idCategoria: null,
    vigenteDesde: hoy.toISOString(),
    vigenteHasta: masMes.toISOString(),
    activo: true,
  },
});
esperar(cn2.data.codigo === 'PRUEBA-20', 'cupón se guarda en mayúsculas');
await llamar('PUT', `/coupons/${cn2.data.idCupon}`, {
  token: T.a,
  body: {
    codigo: 'PRUEBA-20',
    tipo: 'Fijo',
    valor: 5,
    montoMinimo: 0,
    usosTotalesMax: 10,
    usosPorCliente: 1,
    idCategoria: null,
    vigenteDesde: hoy.toISOString(),
    vigenteHasta: masMes.toISOString(),
    activo: true,
  },
});
await llamar('DELETE', `/coupons/${cn2.data.idCupon}`, { token: T.a });
const k = await llamar('GET', '/reports/kpis', { token: T.a });
esperar(k.data.pedidos > 30 && k.data.ventasNetas > 0, 'KPIs con historial');
const vs = await llamar('GET', '/reports/ventas?agrupacion=semana', { token: T.a });
const vd = await llamar('GET', '/reports/ventas', { token: T.a });
esperar(vd.data.length === 30, `ventas por día cubren 30 días (${vd.data.length})`);
void vs;
await llamar('GET', '/reports/ventas?agrupacion=mes', { token: T.a });
await llamar('GET', '/reports/ventas-categoria', { token: T.a });
await llamar('GET', '/reports/top-productos?limite=5', { token: T.a });
const ab = await llamar('GET', '/reports/carritos-abandonados', { token: T.a });
esperar(ab.json.meta.total >= 4, 'carritos abandonados');
const xl = await fetch(`${BASE}/reports/export`, { headers: { Authorization: `Bearer ${T.a}` } });
const bytes = new Uint8Array(await xl.arrayBuffer());
vistas.add('get_reports_export');
esperar(
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.length > 500,
  'export .xlsx es un ZIP válido',
);
const st = await fetch(`${BASE}/reports/stream`, { headers: { Authorization: `Bearer ${T.a}` } });
const rd = st.body!.getReader();
esperar(
  new TextDecoder().decode((await rd.read()).value).startsWith('event: listo'),
  'SSE abre con "listo"',
);
await rd.cancel();
vistas.add('get_reports_stream');
const au = await llamar('GET', '/audit?modulo=Pedidos&accion=Transicion', { token: T.a });
esperar(au.json.meta.total > 0, 'bitácora con transiciones');
await llamar('POST', '/auth/logout');

// ── Resultado ────────────────────────────────────────────────────────────────
const faltan = OPERATIONS.filter((o) => !vistas.has(o.id)).map((o) => o.id);
if (faltan.length) fallos.push(`operaciones sin ejercer: ${faltan.join(', ')}`);
console.log(
  `demo: ${vistas.size}/${OPERATIONS.length} operaciones ejercidas y validadas contra el OpenAPI`,
);
if (fallos.length) {
  console.error(`FALLOS (${fallos.length}):\n- ${[...new Set(fallos)].join('\n- ')}`);
  process.exit(1);
}
console.log('demo: OK');
process.exit(0);
