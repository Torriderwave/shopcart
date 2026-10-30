import { z, type ZodType } from 'zod';
import {
  ActualizarCantidadInputSchema,
  ActualizarUsuarioInputSchema,
  AgregarLineaInputSchema,
  AjusteInputSchema,
  AplicarCuponInputSchema,
  AuthResponseSchema,
  BuscarProductosQuerySchema,
  CambiarEstadoInputSchema,
  CancelarPedidoInputSchema,
  CarritoAbandonadoSchema,
  CarritoSchema,
  CategoriaInputSchema,
  CategoriaSchema,
  CategoriaUpdateInputSchema,
  CheckoutSchema,
  CrearDevolucionInputSchema,
  CrearPedidoInputSchema,
  CrearUsuarioInputSchema,
  CuponInputSchema,
  CuponSchema,
  DireccionInputSchema,
  DireccionSchema,
  EntradaBitacoraSchema,
  EntradaInputSchema,
  ERROR_CODES,
  ExistenciaListadoSchema,
  ExistenciaSchema,
  HealthSchema,
  IdParamSchema,
  ImagenInputSchema,
  KardexQuerySchema,
  KardexResponseSchema,
  KpisSchema,
  ListarBitacoraQuerySchema,
  ListarCategoriasQuerySchema,
  ListarCuponesQuerySchema,
  ListarExistenciasQuerySchema,
  ListarPedidosAdminQuerySchema,
  ListarPedidosQuerySchema,
  ListarUsuariosQuerySchema,
  LoginInputSchema,
  MetodoEnvioSchema,
  PaginationQuerySchema,
  PedidoDetalleSchema,
  PedidoResumenAdminSchema,
  PedidoResumenSchema,
  ProductoDetalleQuerySchema,
  ProductoDetalleSchema,
  ProductoInputSchema,
  ProductoResumenSchema,
  ProductoUpdateInputSchema,
  RangoQuerySchema,
  RegisterInputSchema,
  TopProductosQuerySchema,
  TopProductoSchema,
  UsuarioSchema,
  UsuarioSesionSchema,
  VarianteInputSchema,
  VarianteUpdateInputSchema,
  VentaCategoriaSchema,
  VentaPeriodoSchema,
  VentasQuerySchema,
} from '@shopcart/contracts';

/**
 * Documento OpenAPI 3.1 generado desde los esquemas de `contracts` (misma fuente que valida la API).
 * `openapi.test.ts` verifica que cada ruta registrada en Express esté documentada aquí y viceversa.
 */

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Access = 'publico' | 'opcional' | 'autenticado' | 'cliente' | 'operador' | 'admin';

interface Endpoint {
  m: Method;
  p: string; // ruta Express (/orders/:id)
  tag: string;
  sum: string;
  access: Access;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  res?: ZodType;
  list?: boolean; // data es un arreglo
  paged?: boolean; // arreglo con meta de paginación
  status?: 200 | 201 | 204;
  cartToken?: boolean;
  idempotency?: boolean;
  errors?: string[]; // códigos de error típicos del endpoint
}

const E = {
  stock: ['STOCK_INSUFICIENTE', 'CANTIDAD_EXCEDE_DISPONIBLE', 'VARIANTE_INACTIVA'],
  cupon: [
    'CUPON_INVALIDO',
    'CUPON_FUERA_VIGENCIA',
    'CUPON_MONTO_MINIMO',
    'CUPON_AGOTADO',
    'CUPON_LIMITE_CLIENTE',
    'CUPON_SIN_PRODUCTOS_ELEGIBLES',
  ],
};

const ENDPOINTS: Endpoint[] = [
  // ── Sistema
  {
    m: 'get',
    p: '/health',
    tag: 'Sistema',
    sum: 'Estado de la API y la base de datos',
    access: 'publico',
    res: HealthSchema,
  },

  // ── Autenticación
  {
    m: 'post',
    p: '/auth/register',
    tag: 'Autenticación',
    sum: 'Registrar cliente (fusiona el carrito de invitado si llega X-Cart-Token)',
    access: 'publico',
    body: RegisterInputSchema,
    res: AuthResponseSchema,
    status: 201,
    cartToken: true,
    errors: ['DUPLICADO', 'DEMASIADAS_SOLICITUDES'],
  },
  {
    m: 'post',
    p: '/auth/login',
    tag: 'Autenticación',
    sum: 'Iniciar sesión (access token en el cuerpo, refresh en cookie httpOnly)',
    access: 'publico',
    body: LoginInputSchema,
    res: AuthResponseSchema,
    cartToken: true,
    errors: ['CREDENCIALES_INVALIDAS', 'DEMASIADAS_SOLICITUDES'],
  },
  {
    m: 'post',
    p: '/auth/refresh',
    tag: 'Autenticación',
    sum: 'Renovar el access token con la cookie de refresh (rotación; el reuso revoca la familia)',
    access: 'publico',
    res: AuthResponseSchema,
    errors: ['REFRESH_INVALIDO'],
  },
  {
    m: 'post',
    p: '/auth/logout',
    tag: 'Autenticación',
    sum: 'Cerrar sesión y revocar el refresh token',
    access: 'publico',
    status: 204,
  },
  {
    m: 'get',
    p: '/auth/me',
    tag: 'Autenticación',
    sum: 'Usuario de la sesión',
    access: 'autenticado',
    res: UsuarioSesionSchema,
  },
  {
    m: 'get',
    p: '/me/direcciones',
    tag: 'Direcciones',
    sum: 'Mis direcciones',
    access: 'cliente',
    res: DireccionSchema,
    list: true,
  },
  {
    m: 'post',
    p: '/me/direcciones',
    tag: 'Direcciones',
    sum: 'Crear dirección',
    access: 'cliente',
    body: DireccionInputSchema,
    res: DireccionSchema,
    status: 201,
  },
  {
    m: 'put',
    p: '/me/direcciones/:id',
    tag: 'Direcciones',
    sum: 'Actualizar dirección propia',
    access: 'cliente',
    params: IdParamSchema,
    body: DireccionInputSchema,
    res: DireccionSchema,
    errors: ['PROHIBIDO', 'NO_ENCONTRADO'],
  },
  {
    m: 'delete',
    p: '/me/direcciones/:id',
    tag: 'Direcciones',
    sum: 'Eliminar dirección propia',
    access: 'cliente',
    params: IdParamSchema,
    status: 204,
    errors: ['PROHIBIDO', 'NO_ENCONTRADO'],
  },
  {
    m: 'get',
    p: '/admin/usuarios',
    tag: 'Usuarios',
    sum: 'Listar usuarios',
    access: 'admin',
    query: ListarUsuariosQuerySchema,
    res: UsuarioSchema,
    paged: true,
  },
  {
    m: 'post',
    p: '/admin/usuarios',
    tag: 'Usuarios',
    sum: 'Crear usuario con rol',
    access: 'admin',
    body: CrearUsuarioInputSchema,
    res: UsuarioSchema,
    status: 201,
    errors: ['DUPLICADO'],
  },
  {
    m: 'patch',
    p: '/admin/usuarios/:id',
    tag: 'Usuarios',
    sum: 'Cambiar nombre, rol o estado',
    access: 'admin',
    params: IdParamSchema,
    body: ActualizarUsuarioInputSchema,
    res: UsuarioSchema,
    errors: ['NO_ENCONTRADO'],
  },

  // ── Catálogo
  {
    m: 'get',
    p: '/catalog/categorias',
    tag: 'Catálogo',
    sum: 'Listar categorías',
    access: 'opcional',
    query: ListarCategoriasQuerySchema,
    res: CategoriaSchema,
    list: true,
  },
  {
    m: 'get',
    p: '/catalog/productos',
    tag: 'Catálogo',
    sum: 'Buscar productos (texto, categoría, precio, stock, orden, paginación)',
    access: 'opcional',
    query: BuscarProductosQuerySchema,
    res: ProductoResumenSchema,
    paged: true,
  },
  {
    m: 'get',
    p: '/catalog/productos/:id',
    tag: 'Catálogo',
    sum: 'Detalle de producto con variantes e imágenes',
    access: 'opcional',
    params: IdParamSchema,
    query: ProductoDetalleQuerySchema,
    res: ProductoDetalleSchema,
    errors: ['NO_ENCONTRADO'],
  },
  {
    m: 'post',
    p: '/catalog/categorias',
    tag: 'Catálogo (admin)',
    sum: 'Crear categoría',
    access: 'admin',
    body: CategoriaInputSchema,
    res: CategoriaSchema,
    status: 201,
    errors: ['DUPLICADO'],
  },
  {
    m: 'put',
    p: '/catalog/categorias/:id',
    tag: 'Catálogo (admin)',
    sum: 'Actualizar categoría',
    access: 'admin',
    params: IdParamSchema,
    body: CategoriaUpdateInputSchema,
    res: CategoriaSchema,
    errors: ['NO_ENCONTRADO', 'DUPLICADO'],
  },
  {
    m: 'delete',
    p: '/catalog/categorias/:id',
    tag: 'Catálogo (admin)',
    sum: 'Desactivar categoría (baja lógica; no si tiene productos activos)',
    access: 'admin',
    params: IdParamSchema,
    status: 204,
    errors: ['EN_USO', 'NO_ENCONTRADO'],
  },
  {
    m: 'post',
    p: '/catalog/productos',
    tag: 'Catálogo (admin)',
    sum: 'Crear producto',
    access: 'admin',
    body: ProductoInputSchema,
    res: ProductoDetalleSchema,
    status: 201,
    errors: ['REFERENCIA_INVALIDA'],
  },
  {
    m: 'put',
    p: '/catalog/productos/:id',
    tag: 'Catálogo (admin)',
    sum: 'Actualizar producto',
    access: 'admin',
    params: IdParamSchema,
    body: ProductoUpdateInputSchema,
    res: ProductoDetalleSchema,
    errors: ['NO_ENCONTRADO'],
  },
  {
    m: 'delete',
    p: '/catalog/productos/:id',
    tag: 'Catálogo (admin)',
    sum: 'Desactivar producto (baja lógica)',
    access: 'admin',
    params: IdParamSchema,
    status: 204,
    errors: ['NO_ENCONTRADO'],
  },
  {
    m: 'post',
    p: '/catalog/productos/:id/variantes',
    tag: 'Catálogo (admin)',
    sum: 'Crear variante (nace con existencia 0)',
    access: 'admin',
    params: IdParamSchema,
    body: VarianteInputSchema,
    res: ProductoDetalleSchema,
    status: 201,
    errors: ['DUPLICADO'],
  },
  {
    m: 'put',
    p: '/catalog/variantes/:id',
    tag: 'Catálogo (admin)',
    sum: 'Actualizar variante y precio (queda en bitácora)',
    access: 'admin',
    params: IdParamSchema,
    body: VarianteUpdateInputSchema,
    res: ProductoDetalleSchema,
    errors: ['NO_ENCONTRADO', 'DUPLICADO'],
  },
  {
    m: 'delete',
    p: '/catalog/variantes/:id',
    tag: 'Catálogo (admin)',
    sum: 'Desactivar variante (baja lógica)',
    access: 'admin',
    params: IdParamSchema,
    status: 204,
    errors: ['NO_ENCONTRADO'],
  },
  {
    m: 'post',
    p: '/catalog/productos/:id/imagenes',
    tag: 'Catálogo (admin)',
    sum: 'Agregar o reemplazar imagen (URL)',
    access: 'admin',
    params: IdParamSchema,
    body: ImagenInputSchema,
    res: ProductoDetalleSchema,
    status: 201,
  },
  {
    m: 'delete',
    p: '/catalog/imagenes/:id',
    tag: 'Catálogo (admin)',
    sum: 'Eliminar imagen',
    access: 'admin',
    params: IdParamSchema,
    status: 204,
  },

  // ── Inventario
  {
    m: 'get',
    p: '/inventory/existencias',
    tag: 'Inventario',
    sum: 'Existencias física/reservada/disponible por variante',
    access: 'operador',
    query: ListarExistenciasQuerySchema,
    res: ExistenciaListadoSchema,
    paged: true,
  },
  {
    m: 'get',
    p: '/inventory/variantes/:id/kardex',
    tag: 'Inventario',
    sum: 'Kardex de una variante (más reciente primero)',
    access: 'operador',
    params: IdParamSchema,
    query: KardexQuerySchema,
    res: KardexResponseSchema,
    errors: ['NO_ENCONTRADO'],
  },
  {
    m: 'post',
    p: '/inventory/entradas',
    tag: 'Inventario',
    sum: 'Registrar entrada de mercadería',
    access: 'operador',
    body: EntradaInputSchema,
    res: ExistenciaSchema,
    status: 201,
  },
  {
    m: 'post',
    p: '/inventory/ajustes',
    tag: 'Inventario',
    sum: 'Ajuste con motivo (delta con signo; no deja negativo)',
    access: 'operador',
    body: AjusteInputSchema,
    res: ExistenciaSchema,
    status: 201,
    errors: ['AJUSTE_INVALIDO'],
  },

  // ── Carrito
  {
    m: 'get',
    p: '/cart',
    tag: 'Carrito',
    sum: 'Ver carrito (cliente por JWT; invitado por X-Cart-Token)',
    access: 'opcional',
    res: CarritoSchema,
    cartToken: true,
  },
  {
    m: 'post',
    p: '/cart/items',
    tag: 'Carrito',
    sum: 'Agregar producto; sin token crea un carrito de invitado y devuelve tokenInvitado',
    access: 'opcional',
    body: AgregarLineaInputSchema,
    res: CarritoSchema,
    status: 201,
    cartToken: true,
    errors: E.stock,
  },
  {
    m: 'patch',
    p: '/cart/items/:id',
    tag: 'Carrito',
    sum: 'Cambiar cantidad de una línea',
    access: 'opcional',
    params: IdParamSchema,
    body: ActualizarCantidadInputSchema,
    res: CarritoSchema,
    cartToken: true,
    errors: E.stock,
  },
  {
    m: 'delete',
    p: '/cart/items/:id',
    tag: 'Carrito',
    sum: 'Quitar una línea',
    access: 'opcional',
    params: IdParamSchema,
    res: CarritoSchema,
    cartToken: true,
  },
  {
    m: 'post',
    p: '/cart/coupon',
    tag: 'Carrito',
    sum: 'Aplicar cupón',
    access: 'opcional',
    body: AplicarCuponInputSchema,
    res: CarritoSchema,
    cartToken: true,
    errors: E.cupon,
  },
  {
    m: 'delete',
    p: '/cart/coupon',
    tag: 'Carrito',
    sum: 'Quitar cupón',
    access: 'opcional',
    res: CarritoSchema,
    cartToken: true,
  },

  // ── Checkout y pedidos
  {
    m: 'get',
    p: '/shipping-methods',
    tag: 'Checkout',
    sum: 'Métodos de envío',
    access: 'publico',
    res: MetodoEnvioSchema,
    list: true,
  },
  {
    m: 'post',
    p: '/checkout',
    tag: 'Checkout',
    sum: 'Iniciar checkout: reserva existencias 15 min y congela precios (reiniciar es idempotente)',
    access: 'cliente',
    res: CheckoutSchema,
    errors: ['CARRITO_VACIO', ...E.stock],
  },
  {
    m: 'get',
    p: '/checkout',
    tag: 'Checkout',
    sum: 'Estado del checkout en curso',
    access: 'cliente',
    res: CheckoutSchema,
    errors: ['CHECKOUT_NO_INICIADO', 'CARRITO_VACIO'],
  },
  {
    m: 'delete',
    p: '/checkout',
    tag: 'Checkout',
    sum: 'Cancelar checkout y liberar reservas',
    access: 'cliente',
    status: 204,
  },
  {
    m: 'post',
    p: '/orders',
    tag: 'Pedidos',
    sum: 'Pagar (simulado): crea el pedido de forma atómica e idempotente (200 si repite la llave)',
    access: 'cliente',
    body: CrearPedidoInputSchema,
    res: PedidoDetalleSchema,
    status: 201,
    idempotency: true,
    errors: [
      'IDEMPOTENCY_KEY_REQUERIDA',
      'TOTAL_CAMBIO',
      'RESERVA_VENCIDA',
      'CHECKOUT_NO_INICIADO',
      'DIRECCION_INVALIDA',
      'METODO_ENVIO_NO_APLICA',
      ...E.cupon,
    ],
  },
  {
    m: 'get',
    p: '/orders/mine',
    tag: 'Pedidos',
    sum: 'Mis pedidos (filtros, orden, paginación)',
    access: 'cliente',
    query: ListarPedidosQuerySchema,
    res: PedidoResumenSchema,
    paged: true,
  },
  {
    m: 'get',
    p: '/orders',
    tag: 'Pedidos (operación)',
    sum: 'Todos los pedidos (filtros por estado, cliente, número y fechas)',
    access: 'operador',
    query: ListarPedidosAdminQuerySchema,
    res: PedidoResumenAdminSchema,
    paged: true,
  },
  {
    m: 'get',
    p: '/orders/:id',
    tag: 'Pedidos',
    sum: 'Detalle con líneas, historial, devoluciones y acciones permitidas (el cliente solo ve los suyos)',
    access: 'autenticado',
    params: IdParamSchema,
    res: PedidoDetalleSchema,
    errors: ['PROHIBIDO', 'NO_ENCONTRADO'],
  },
  {
    m: 'patch',
    p: '/orders/:id/status',
    tag: 'Pedidos (operación)',
    sum: 'Avanzar estado: Pagado→Preparando→Despachado→Entregado',
    access: 'operador',
    params: IdParamSchema,
    body: CambiarEstadoInputSchema,
    res: PedidoDetalleSchema,
    errors: ['TRANSICION_INVALIDA', 'NO_ENCONTRADO'],
  },
  {
    m: 'post',
    p: '/orders/:id/cancel',
    tag: 'Pedidos',
    sum: 'Cancelar (Pagado/Preparando): reintegra existencias. Cliente solo el suyo',
    access: 'autenticado',
    params: IdParamSchema,
    body: CancelarPedidoInputSchema,
    res: PedidoDetalleSchema,
    errors: ['PEDIDO_NO_CANCELABLE', 'PROHIBIDO'],
  },
  {
    m: 'post',
    p: '/orders/:id/returns',
    tag: 'Pedidos (operación)',
    sum: 'Devolución total o parcial por línea (pedido Entregado o DevueltoParcial)',
    access: 'operador',
    params: IdParamSchema,
    body: CrearDevolucionInputSchema,
    res: PedidoDetalleSchema,
    status: 201,
    errors: ['DEVOLUCION_NO_PERMITIDA', 'DEVOLUCION_EXCEDE_VENDIDO'],
  },

  // ── Cupones
  {
    m: 'get',
    p: '/coupons',
    tag: 'Cupones',
    sum: 'Listar cupones',
    access: 'admin',
    query: ListarCuponesQuerySchema,
    res: CuponSchema,
    paged: true,
  },
  {
    m: 'post',
    p: '/coupons',
    tag: 'Cupones',
    sum: 'Crear cupón',
    access: 'admin',
    body: CuponInputSchema,
    res: CuponSchema,
    status: 201,
    errors: ['DUPLICADO'],
  },
  {
    m: 'put',
    p: '/coupons/:id',
    tag: 'Cupones',
    sum: 'Actualizar cupón',
    access: 'admin',
    params: IdParamSchema,
    body: CuponInputSchema,
    res: CuponSchema,
    errors: ['NO_ENCONTRADO', 'DUPLICADO'],
  },
  {
    m: 'delete',
    p: '/coupons/:id',
    tag: 'Cupones',
    sum: 'Desactivar cupón',
    access: 'admin',
    params: IdParamSchema,
    status: 204,
    errors: ['NO_ENCONTRADO'],
  },

  // ── Reportes y bitácora
  {
    m: 'get',
    p: '/reports/kpis',
    tag: 'Reportes',
    sum: 'KPIs: ventas netas, pedidos, ticket promedio, unidades, devuelto',
    access: 'admin',
    query: RangoQuerySchema,
    res: KpisSchema,
  },
  {
    m: 'get',
    p: '/reports/ventas',
    tag: 'Reportes',
    sum: 'Ventas por día/semana/mes (períodos vacíos en 0)',
    access: 'admin',
    query: VentasQuerySchema,
    res: VentaPeriodoSchema,
    list: true,
  },
  {
    m: 'get',
    p: '/reports/ventas-categoria',
    tag: 'Reportes',
    sum: 'Ventas por categoría',
    access: 'admin',
    query: RangoQuerySchema,
    res: VentaCategoriaSchema,
    list: true,
  },
  {
    m: 'get',
    p: '/reports/top-productos',
    tag: 'Reportes',
    sum: 'Productos más vendidos',
    access: 'admin',
    query: TopProductosQuerySchema,
    res: TopProductoSchema,
    list: true,
  },
  {
    m: 'get',
    p: '/reports/carritos-abandonados',
    tag: 'Reportes',
    sum: 'Carritos abandonados (clientes e invitados)',
    access: 'admin',
    query: PaginationQuerySchema,
    res: CarritoAbandonadoSchema,
    paged: true,
  },
  {
    m: 'get',
    p: '/audit',
    tag: 'Bitácora',
    sum: 'Bitácora inmutable con valor anterior y nuevo',
    access: 'admin',
    query: ListarBitacoraQuerySchema,
    res: EntradaBitacoraSchema,
    paged: true,
  },
];

// ── Generación ────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function schemaOf(s: ZodType): Json {
  const js = z.toJSONSchema(s, {
    io: 'input',
    unrepresentable: 'any',
    target: 'openapi-3.0',
  }) as Json;
  delete js.$schema;
  return js;
}

/** Parámetros de ruta/consulta a partir de un esquema objeto. */
function parametersOf(where: 'path' | 'query', s: ZodType): Json[] {
  const js = schemaOf(s) as { properties?: Record<string, Json>; required?: string[] };
  return Object.entries(js.properties ?? {}).map(([name, schema]) => ({
    name,
    in: where,
    required: where === 'path' || (js.required ?? []).includes(name),
    schema,
  }));
}

const ACCESS_TEXT: Record<Access, string> = {
  publico: 'Público.',
  opcional:
    'Público; con sesión, un Administrador también ve lo inactivo / el cliente usa su carrito.',
  autenticado: 'Requiere sesión (cualquier rol). El SP aplica la propiedad del recurso.',
  cliente: 'Rol: Cliente.',
  operador: 'Roles: Operador, Administrador.',
  admin: 'Rol: Administrador.',
};

const toOpenApiPath = (p: string): string => p.replace(/:(\w+)/g, '{$1}');

const errorRef = { $ref: '#/components/schemas/ErrorBody' };
const errResp = (description: string): Json => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});

export function buildOpenApi(): Json {
  const paths: Record<string, Json> = {};

  for (const e of ENDPOINTS) {
    const parameters: Json[] = [];
    if (e.params) parameters.push(...parametersOf('path', e.params));
    if (e.query) parameters.push(...parametersOf('query', e.query));
    if (e.cartToken) {
      parameters.push({
        name: 'X-Cart-Token',
        in: 'header',
        required: false,
        description: 'Token del carrito de invitado (UUID emitido por el servidor).',
        schema: { type: 'string', format: 'uuid' },
      });
    }
    if (e.idempotency) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'UUID generado por el cliente; repetirlo devuelve el mismo pedido (200).',
        schema: { type: 'string', format: 'uuid' },
      });
    }

    const status = e.status ?? 200;
    const data = e.res ? schemaOf(e.res) : undefined;
    const dataSchema = data && (e.list || e.paged) ? { type: 'array', items: data } : data;
    const responses: Record<string, Json> = {};
    if (status === 204) {
      responses['204'] = { description: 'Sin contenido' };
    } else {
      responses[String(status)] = {
        description: 'Correcto',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['success', 'data'],
              properties: {
                success: { type: 'boolean', enum: [true] },
                data: dataSchema ?? {},
                ...(e.paged ? { meta: { $ref: '#/components/schemas/PaginationMeta' } } : {}),
              },
            },
          },
        },
      };
    }
    if (e.body || e.params || e.query)
      responses['400'] = errResp('VALIDACION: datos de entrada inválidos');
    if (e.access !== 'publico' && e.access !== 'opcional') {
      responses['401'] = errResp('NO_AUTENTICADO / TOKEN_EXPIRADO');
      if (e.access !== 'autenticado')
        responses['403'] = errResp('PROHIBIDO: el rol no tiene permiso');
    }
    if (e.errors?.length) responses['409'] = errResp(`Regla de negocio: ${e.errors.join(', ')}`);

    const op: Json = {
      tags: [e.tag],
      summary: e.sum,
      description: ACCESS_TEXT[e.access],
      operationId: `${e.m}_${e.p.replace(/[/:]+/g, '_').replace(/^_|_$/g, '')}`,
      ...(parameters.length ? { parameters } : {}),
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: schemaOf(e.body) } },
            },
          }
        : {}),
      responses,
      ...(e.access === 'publico'
        ? {}
        : { security: e.access === 'opcional' ? [{}, { bearerAuth: [] }] : [{ bearerAuth: [] }] }),
    };

    const key = toOpenApiPath(e.p);
    paths[key] = { ...(paths[key] ?? {}), [e.m]: op };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'ShopCart API',
      version: '1.0.0',
      description:
        'API REST de ShopCart (Tech Challenge 360). Todas las respuestas usan el envelope ' +
        '`{ success, data, meta? }`; los errores `{ success:false, error:{ code, message, details? } }`. ' +
        `Códigos de error: ${ERROR_CODES.join(', ')}. ` +
        'Fechas en ISO 8601 UTC; los filtros `desde/hasta` son YYYY-MM-DD en hora de Guatemala.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [...new Set(ENDPOINTS.map((e) => e.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token (15 min).',
        },
      },
      schemas: {
        ErrorBody: schemaOf(
          z.object({
            success: z.literal(false),
            error: z.object({
              code: z.enum(ERROR_CODES),
              message: z.string(),
              details: z.record(z.string(), z.unknown()).optional(),
            }),
          }),
        ),
        PaginationMeta: schemaOf(
          z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() }),
        ),
      },
    },
  };
}

/** Pares "METODO /ruta" documentados (para la prueba de cobertura). */
export const documentedRoutes = (): string[] =>
  ENDPOINTS.map((e) => `${e.m.toUpperCase()} /api/v1${e.p}`).sort();
