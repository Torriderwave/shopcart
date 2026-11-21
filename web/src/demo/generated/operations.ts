/* AUTO-GENERADO por web/scripts/gen-demo-mocks.mts desde el OpenAPI de la API. No editar. */

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

export const OPERATIONS = [
  {
    "id": "get_admin_usuarios",
    "method": "GET",
    "path": "/admin/usuarios",
    "tag": "Usuarios",
    "summary": "Listar usuarios",
    "access": "admin",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_admin_usuarios",
    "method": "POST",
    "path": "/admin/usuarios",
    "tag": "Usuarios",
    "summary": "Crear usuario con rol",
    "access": "admin",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "DUPLICADO"
    ]
  },
  {
    "id": "patch_admin_usuarios_id",
    "method": "PATCH",
    "path": "/admin/usuarios/:id",
    "tag": "Usuarios",
    "summary": "Cambiar nombre, rol o estado",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "get_audit",
    "method": "GET",
    "path": "/audit",
    "tag": "Bitácora",
    "summary": "Bitácora inmutable con valor anterior y nuevo",
    "access": "admin",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_auth_login",
    "method": "POST",
    "path": "/auth/login",
    "tag": "Autenticación",
    "summary": "Iniciar sesión (access token en el cuerpo, refresh en cookie httpOnly)",
    "access": "publico",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": true,
    "errors": [
      "CREDENCIALES_INVALIDAS",
      "DEMASIADAS_SOLICITUDES"
    ]
  },
  {
    "id": "post_auth_logout",
    "method": "POST",
    "path": "/auth/logout",
    "tag": "Autenticación",
    "summary": "Cerrar sesión y revocar el refresh token",
    "access": "publico",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_auth_me",
    "method": "GET",
    "path": "/auth/me",
    "tag": "Autenticación",
    "summary": "Usuario de la sesión",
    "access": "autenticado",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_auth_refresh",
    "method": "POST",
    "path": "/auth/refresh",
    "tag": "Autenticación",
    "summary": "Renovar el access token con la cookie de refresh (rotación; el reuso revoca la familia)",
    "access": "publico",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "REFRESH_INVALIDO"
    ]
  },
  {
    "id": "post_auth_register",
    "method": "POST",
    "path": "/auth/register",
    "tag": "Autenticación",
    "summary": "Registrar cliente (fusiona el carrito de invitado si llega X-Cart-Token)",
    "access": "publico",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": true,
    "errors": [
      "DUPLICADO",
      "DEMASIADAS_SOLICITUDES"
    ]
  },
  {
    "id": "get_cart",
    "method": "GET",
    "path": "/cart",
    "tag": "Carrito",
    "summary": "Ver carrito (cliente por JWT; invitado por X-Cart-Token)",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": true,
    "errors": []
  },
  {
    "id": "delete_cart_coupon",
    "method": "DELETE",
    "path": "/cart/coupon",
    "tag": "Carrito",
    "summary": "Quitar cupón",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": true,
    "errors": []
  },
  {
    "id": "post_cart_coupon",
    "method": "POST",
    "path": "/cart/coupon",
    "tag": "Carrito",
    "summary": "Aplicar cupón",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": true,
    "errors": [
      "CUPON_INVALIDO",
      "CUPON_FUERA_VIGENCIA",
      "CUPON_MONTO_MINIMO",
      "CUPON_AGOTADO",
      "CUPON_LIMITE_CLIENTE",
      "CUPON_SIN_PRODUCTOS_ELEGIBLES"
    ]
  },
  {
    "id": "post_cart_items",
    "method": "POST",
    "path": "/cart/items",
    "tag": "Carrito",
    "summary": "Agregar producto; sin token crea un carrito de invitado y devuelve tokenInvitado",
    "access": "opcional",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": true,
    "errors": [
      "STOCK_INSUFICIENTE",
      "CANTIDAD_EXCEDE_DISPONIBLE",
      "VARIANTE_INACTIVA"
    ]
  },
  {
    "id": "delete_cart_items_id",
    "method": "DELETE",
    "path": "/cart/items/:id",
    "tag": "Carrito",
    "summary": "Quitar una línea",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": true,
    "errors": []
  },
  {
    "id": "patch_cart_items_id",
    "method": "PATCH",
    "path": "/cart/items/:id",
    "tag": "Carrito",
    "summary": "Cambiar cantidad de una línea",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": true,
    "errors": [
      "STOCK_INSUFICIENTE",
      "CANTIDAD_EXCEDE_DISPONIBLE",
      "VARIANTE_INACTIVA"
    ]
  },
  {
    "id": "get_catalog_categorias",
    "method": "GET",
    "path": "/catalog/categorias",
    "tag": "Catálogo",
    "summary": "Listar categorías",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_catalog_categorias",
    "method": "POST",
    "path": "/catalog/categorias",
    "tag": "Catálogo (admin)",
    "summary": "Crear categoría",
    "access": "admin",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "DUPLICADO"
    ]
  },
  {
    "id": "delete_catalog_categorias_id",
    "method": "DELETE",
    "path": "/catalog/categorias/:id",
    "tag": "Catálogo (admin)",
    "summary": "Desactivar categoría (baja lógica; no si tiene productos activos)",
    "access": "admin",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "EN_USO",
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "put_catalog_categorias_id",
    "method": "PUT",
    "path": "/catalog/categorias/:id",
    "tag": "Catálogo (admin)",
    "summary": "Actualizar categoría",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO",
      "DUPLICADO"
    ]
  },
  {
    "id": "delete_catalog_imagenes_id",
    "method": "DELETE",
    "path": "/catalog/imagenes/:id",
    "tag": "Catálogo (admin)",
    "summary": "Eliminar imagen",
    "access": "admin",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_catalog_productos",
    "method": "GET",
    "path": "/catalog/productos",
    "tag": "Catálogo",
    "summary": "Buscar productos (texto, categoría, precio, stock, orden, paginación)",
    "access": "opcional",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_catalog_productos",
    "method": "POST",
    "path": "/catalog/productos",
    "tag": "Catálogo (admin)",
    "summary": "Crear producto",
    "access": "admin",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "REFERENCIA_INVALIDA"
    ]
  },
  {
    "id": "delete_catalog_productos_id",
    "method": "DELETE",
    "path": "/catalog/productos/:id",
    "tag": "Catálogo (admin)",
    "summary": "Desactivar producto (baja lógica)",
    "access": "admin",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "get_catalog_productos_id",
    "method": "GET",
    "path": "/catalog/productos/:id",
    "tag": "Catálogo",
    "summary": "Detalle de producto con variantes e imágenes",
    "access": "opcional",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "put_catalog_productos_id",
    "method": "PUT",
    "path": "/catalog/productos/:id",
    "tag": "Catálogo (admin)",
    "summary": "Actualizar producto",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "post_catalog_productos_id_imagenes",
    "method": "POST",
    "path": "/catalog/productos/:id/imagenes",
    "tag": "Catálogo (admin)",
    "summary": "Agregar o reemplazar imagen (URL)",
    "access": "admin",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_catalog_productos_id_variantes",
    "method": "POST",
    "path": "/catalog/productos/:id/variantes",
    "tag": "Catálogo (admin)",
    "summary": "Crear variante (nace con existencia 0)",
    "access": "admin",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "DUPLICADO"
    ]
  },
  {
    "id": "delete_catalog_variantes_id",
    "method": "DELETE",
    "path": "/catalog/variantes/:id",
    "tag": "Catálogo (admin)",
    "summary": "Desactivar variante (baja lógica)",
    "access": "admin",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "put_catalog_variantes_id",
    "method": "PUT",
    "path": "/catalog/variantes/:id",
    "tag": "Catálogo (admin)",
    "summary": "Actualizar variante y precio (queda en bitácora)",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO",
      "DUPLICADO"
    ]
  },
  {
    "id": "delete_checkout",
    "method": "DELETE",
    "path": "/checkout",
    "tag": "Checkout",
    "summary": "Cancelar checkout y liberar reservas",
    "access": "cliente",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_checkout",
    "method": "GET",
    "path": "/checkout",
    "tag": "Checkout",
    "summary": "Estado del checkout en curso",
    "access": "cliente",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "CHECKOUT_NO_INICIADO",
      "CARRITO_VACIO"
    ]
  },
  {
    "id": "post_checkout",
    "method": "POST",
    "path": "/checkout",
    "tag": "Checkout",
    "summary": "Iniciar checkout: reserva existencias 15 min y congela precios (reiniciar es idempotente)",
    "access": "cliente",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "CARRITO_VACIO",
      "STOCK_INSUFICIENTE",
      "CANTIDAD_EXCEDE_DISPONIBLE",
      "VARIANTE_INACTIVA"
    ]
  },
  {
    "id": "get_coupons",
    "method": "GET",
    "path": "/coupons",
    "tag": "Cupones",
    "summary": "Listar cupones",
    "access": "admin",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_coupons",
    "method": "POST",
    "path": "/coupons",
    "tag": "Cupones",
    "summary": "Crear cupón",
    "access": "admin",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "DUPLICADO"
    ]
  },
  {
    "id": "delete_coupons_id",
    "method": "DELETE",
    "path": "/coupons/:id",
    "tag": "Cupones",
    "summary": "Desactivar cupón",
    "access": "admin",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "put_coupons_id",
    "method": "PUT",
    "path": "/coupons/:id",
    "tag": "Cupones",
    "summary": "Actualizar cupón",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO",
      "DUPLICADO"
    ]
  },
  {
    "id": "get_health",
    "method": "GET",
    "path": "/health",
    "tag": "Sistema",
    "summary": "Estado de la API y la base de datos",
    "access": "publico",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_inventory_ajustes",
    "method": "POST",
    "path": "/inventory/ajustes",
    "tag": "Inventario",
    "summary": "Ajuste con motivo (delta con signo; no deja negativo)",
    "access": "operador",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "AJUSTE_INVALIDO"
    ]
  },
  {
    "id": "post_inventory_entradas",
    "method": "POST",
    "path": "/inventory/entradas",
    "tag": "Inventario",
    "summary": "Registrar entrada de mercadería",
    "access": "operador",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_inventory_existencias",
    "method": "GET",
    "path": "/inventory/existencias",
    "tag": "Inventario",
    "summary": "Existencias física/reservada/disponible por variante",
    "access": "operador",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_inventory_variantes_id_kardex",
    "method": "GET",
    "path": "/inventory/variantes/:id/kardex",
    "tag": "Inventario",
    "summary": "Kardex de una variante (más reciente primero)",
    "access": "operador",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "get_me_direcciones",
    "method": "GET",
    "path": "/me/direcciones",
    "tag": "Direcciones",
    "summary": "Mis direcciones",
    "access": "cliente",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_me_direcciones",
    "method": "POST",
    "path": "/me/direcciones",
    "tag": "Direcciones",
    "summary": "Crear dirección",
    "access": "cliente",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "delete_me_direcciones_id",
    "method": "DELETE",
    "path": "/me/direcciones/:id",
    "tag": "Direcciones",
    "summary": "Eliminar dirección propia",
    "access": "cliente",
    "status": 204,
    "kind": "none",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "PROHIBIDO",
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "put_me_direcciones_id",
    "method": "PUT",
    "path": "/me/direcciones/:id",
    "tag": "Direcciones",
    "summary": "Actualizar dirección propia",
    "access": "cliente",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "PROHIBIDO",
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "get_orders",
    "method": "GET",
    "path": "/orders",
    "tag": "Pedidos (operación)",
    "summary": "Todos los pedidos (filtros por estado, cliente, número y fechas)",
    "access": "operador",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "post_orders",
    "method": "POST",
    "path": "/orders",
    "tag": "Pedidos",
    "summary": "Pagar (simulado): crea el pedido de forma atómica e idempotente (200 si repite la llave)",
    "access": "cliente",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": true,
    "cartToken": false,
    "errors": [
      "IDEMPOTENCY_KEY_REQUERIDA",
      "TOTAL_CAMBIO",
      "RESERVA_VENCIDA",
      "CHECKOUT_NO_INICIADO",
      "DIRECCION_INVALIDA",
      "METODO_ENVIO_NO_APLICA",
      "CUPON_INVALIDO",
      "CUPON_FUERA_VIGENCIA",
      "CUPON_MONTO_MINIMO",
      "CUPON_AGOTADO",
      "CUPON_LIMITE_CLIENTE",
      "CUPON_SIN_PRODUCTOS_ELEGIBLES"
    ]
  },
  {
    "id": "get_orders_id",
    "method": "GET",
    "path": "/orders/:id",
    "tag": "Pedidos",
    "summary": "Detalle con líneas, historial, devoluciones y acciones permitidas (el cliente solo ve los suyos)",
    "access": "autenticado",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "PROHIBIDO",
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "post_orders_id_cancel",
    "method": "POST",
    "path": "/orders/:id/cancel",
    "tag": "Pedidos",
    "summary": "Cancelar (Pagado/Preparando): reintegra existencias. Cliente solo el suyo",
    "access": "autenticado",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "PEDIDO_NO_CANCELABLE",
      "PROHIBIDO"
    ]
  },
  {
    "id": "post_orders_id_returns",
    "method": "POST",
    "path": "/orders/:id/returns",
    "tag": "Pedidos (operación)",
    "summary": "Devolución total o parcial por línea (pedido Entregado o DevueltoParcial)",
    "access": "operador",
    "status": 201,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "DEVOLUCION_NO_PERMITIDA",
      "DEVOLUCION_EXCEDE_VENDIDO"
    ]
  },
  {
    "id": "patch_orders_id_status",
    "method": "PATCH",
    "path": "/orders/:id/status",
    "tag": "Pedidos (operación)",
    "summary": "Avanzar estado: Pagado→Preparando→Despachado→Entregado",
    "access": "operador",
    "status": 200,
    "kind": "json",
    "body": true,
    "idempotency": false,
    "cartToken": false,
    "errors": [
      "TRANSICION_INVALIDA",
      "NO_ENCONTRADO"
    ]
  },
  {
    "id": "get_orders_mine",
    "method": "GET",
    "path": "/orders/mine",
    "tag": "Pedidos",
    "summary": "Mis pedidos (filtros, orden, paginación)",
    "access": "cliente",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_carritos-abandonados",
    "method": "GET",
    "path": "/reports/carritos-abandonados",
    "tag": "Reportes",
    "summary": "Carritos abandonados (clientes e invitados)",
    "access": "admin",
    "status": 200,
    "kind": "paged",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_export",
    "method": "GET",
    "path": "/reports/export",
    "tag": "Reportes",
    "summary": "Exportar los reportes del rango a Excel",
    "access": "admin",
    "status": 200,
    "kind": "xlsx",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_kpis",
    "method": "GET",
    "path": "/reports/kpis",
    "tag": "Reportes",
    "summary": "KPIs: ventas netas, pedidos, ticket promedio, unidades, devuelto",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_stream",
    "method": "GET",
    "path": "/reports/stream",
    "tag": "Reportes",
    "summary": "Avisos en vivo cuando cambian ventas o carritos abandonados",
    "access": "admin",
    "status": 200,
    "kind": "sse",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_top-productos",
    "method": "GET",
    "path": "/reports/top-productos",
    "tag": "Reportes",
    "summary": "Productos más vendidos",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_ventas",
    "method": "GET",
    "path": "/reports/ventas",
    "tag": "Reportes",
    "summary": "Ventas por día/semana/mes (períodos vacíos en 0)",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_reports_ventas-categoria",
    "method": "GET",
    "path": "/reports/ventas-categoria",
    "tag": "Reportes",
    "summary": "Ventas por categoría",
    "access": "admin",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  },
  {
    "id": "get_shipping-methods",
    "method": "GET",
    "path": "/shipping-methods",
    "tag": "Checkout",
    "summary": "Métodos de envío",
    "access": "publico",
    "status": 200,
    "kind": "json",
    "body": false,
    "idempotency": false,
    "cartToken": false,
    "errors": []
  }
] as const satisfies readonly Operacion[];

export type OperationId = (typeof OPERATIONS)[number]['id'];
