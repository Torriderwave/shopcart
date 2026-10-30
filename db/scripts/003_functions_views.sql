/* =============================================================================
   003_functions_views.sql — Funciones tipo tabla (FU_) y vistas (VW_).
   Solo se leen desde stored procedures (el login de la app no tiene SELECT).
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ── FU_Catalogo_PrecioVigente ───────────────────────────────────────────────
   Precio aplicable a cada línea de un carrito: el congelado en la reserva activa
   (el cliente ve ese precio durante el checkout) o, si no hay, el precio actual. */
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_PrecioVigente (@IDCarrito INT)
RETURNS TABLE
AS
RETURN
(
    SELECT cl.IDCarritoLinea,
           cl.IDVariante,
           cl.Cantidad,
           CAST(COALESCE(r.PrecioUnitario, v.Precio) AS DECIMAL(18, 2)) AS PrecioUnitario
    FROM dbo.CarritoLineas AS cl
    JOIN dbo.ProductoVariantes AS v ON v.IDVariante = cl.IDVariante
    LEFT JOIN dbo.InventarioReservas AS r
           ON r.IDCarrito = cl.IDCarrito
          AND r.IDVariante = cl.IDVariante
          AND r.Estado = N'Activa'
          AND r.ExpiraEn > SYSUTCDATETIME()
    WHERE cl.IDCarrito = @IDCarrito
);
GO

/* ── FU_Cupones_CalculoDescuento ─────────────────────────────────────────────
   Evalúa un cupón contra un carrito. Siempre devuelve una fila.
   Motivo = código de error (NULL si el cupón es válido); Descuento nunca supera
   el subtotal elegible, así el total nunca queda por debajo de cero. */
CREATE OR ALTER FUNCTION dbo.FU_Cupones_CalculoDescuento (@IDCupon INT, @IDCarrito INT)
RETURNS TABLE
AS
RETURN
(
    WITH Lineas AS (
        SELECT CAST(p.Cantidad * p.PrecioUnitario AS DECIMAL(18, 2)) AS Monto,
               pr.IDCategoria
        FROM dbo.FU_Catalogo_PrecioVigente(@IDCarrito) AS p
        JOIN dbo.ProductoVariantes AS v ON v.IDVariante = p.IDVariante
        JOIN dbo.Productos AS pr ON pr.IDProducto = v.IDProducto
    ),
    Base AS (
        SELECT c.IDCupon, c.Tipo, c.Valor, c.MontoMinimo, c.UsosTotalesMax, c.UsosTotalesActual,
               c.UsosPorCliente, c.Activo, c.VigenteDesde, c.VigenteHasta,
               ca.IDUsuario,
               (SELECT ISNULL(SUM(Monto), 0) FROM Lineas) AS Subtotal,
               (SELECT ISNULL(SUM(l.Monto), 0) FROM Lineas AS l
                 WHERE c.IDCategoria IS NULL OR l.IDCategoria = c.IDCategoria) AS Elegible,
               (SELECT COUNT(*) FROM dbo.CuponUsos AS u
                 WHERE u.IDCupon = c.IDCupon AND u.IDUsuario = ca.IDUsuario) AS UsosCliente
        FROM dbo.Cupones AS c
        JOIN dbo.Carritos AS ca ON ca.IDCarrito = @IDCarrito
        WHERE c.IDCupon = @IDCupon
    ),
    Evaluado AS (
        SELECT b.*,
               CASE
                   WHEN b.IDCupon IS NULL OR b.Activo = 0                          THEN N'CUPON_INVALIDO'
                   WHEN SYSUTCDATETIME() < b.VigenteDesde OR SYSUTCDATETIME() > b.VigenteHasta
                                                                                  THEN N'CUPON_FUERA_VIGENCIA'
                   WHEN b.UsosTotalesActual >= b.UsosTotalesMax                    THEN N'CUPON_AGOTADO'
                   WHEN b.IDUsuario IS NOT NULL AND b.UsosCliente >= b.UsosPorCliente
                                                                                  THEN N'CUPON_LIMITE_CLIENTE'
                   WHEN b.Subtotal < b.MontoMinimo                                 THEN N'CUPON_MONTO_MINIMO'
                   WHEN b.Elegible <= 0                                            THEN N'CUPON_SIN_PRODUCTOS_ELEGIBLES'
               END AS Motivo
        FROM (SELECT 1 AS Dummy) AS d
        LEFT JOIN Base AS b ON 1 = 1
    )
    SELECT e.Subtotal,
           e.Elegible AS SubtotalElegible,
           CAST(CASE
                    WHEN e.Motivo IS NOT NULL THEN 0
                    WHEN e.Tipo = N'Porcentaje' THEN ROUND(e.Elegible * e.Valor / 100, 2)
                    WHEN e.Valor < e.Elegible THEN e.Valor
                    ELSE e.Elegible
                END AS DECIMAL(18, 2)) AS Descuento,
           CAST(CASE WHEN e.Motivo IS NULL THEN 1 ELSE 0 END AS BIT) AS Valido,
           e.Motivo,
           CASE e.Motivo
               WHEN N'CUPON_INVALIDO'                 THEN N'El cupón no existe o no está activo.'
               WHEN N'CUPON_FUERA_VIGENCIA'           THEN N'El cupón está vencido o aún no está vigente.'
               WHEN N'CUPON_AGOTADO'                  THEN N'El cupón ya alcanzó su límite de usos.'
               WHEN N'CUPON_LIMITE_CLIENTE'           THEN N'Ya usaste este cupón el máximo de veces permitido.'
               WHEN N'CUPON_MONTO_MINIMO'             THEN N'Tu compra no alcanza el monto mínimo del cupón.'
               WHEN N'CUPON_SIN_PRODUCTOS_ELEGIBLES'  THEN N'Tu carrito no tiene productos de la categoría del cupón.'
           END AS Mensaje
    FROM Evaluado AS e
);
GO

/* ── FU_Carrito_CalcularTotales ──────────────────────────────────────────────
   Subtotal, descuento (solo si el cupón sigue siendo válido) y total del carrito.
   Una única fórmula para carrito, checkout y pedido: el FE nunca calcula dinero. */
CREATE OR ALTER FUNCTION dbo.FU_Carrito_CalcularTotales (@IDCarrito INT)
RETURNS TABLE
AS
RETURN
(
    SELECT c.IDCarrito,
           c.IDCupon,
           cup.Codigo AS CuponCodigo,
           t.Subtotal,
           CAST(CASE WHEN c.IDCupon IS NOT NULL AND d.Valido = 1 THEN d.Descuento ELSE 0 END
                AS DECIMAL(18, 2)) AS Descuento,
           CAST(t.Subtotal - CASE WHEN c.IDCupon IS NOT NULL AND d.Valido = 1 THEN d.Descuento ELSE 0 END
                AS DECIMAL(18, 2)) AS Total,
           CAST(CASE WHEN c.IDCupon IS NULL THEN NULL ELSE d.Valido END AS BIT) AS CuponValido,
           CASE WHEN c.IDCupon IS NULL THEN NULL ELSE d.Motivo END AS CuponMotivo,
           CASE WHEN c.IDCupon IS NULL THEN NULL ELSE d.Mensaje END AS CuponMensaje
    FROM dbo.Carritos AS c
    CROSS APPLY (
        SELECT CAST(ISNULL(SUM(p.Cantidad * p.PrecioUnitario), 0) AS DECIMAL(18, 2)) AS Subtotal
        FROM dbo.FU_Catalogo_PrecioVigente(c.IDCarrito) AS p
    ) AS t
    OUTER APPLY dbo.FU_Cupones_CalculoDescuento(c.IDCupon, c.IDCarrito) AS d
    LEFT JOIN dbo.Cupones AS cup ON cup.IDCupon = c.IDCupon
    WHERE c.IDCarrito = @IDCarrito
);
GO

/* ── Vistas ────────────────────────────────────────────────────────────────── */

-- Disponible = física − reservada (RF-03).
CREATE OR ALTER VIEW dbo.VW_Inventario_Disponible
AS
SELECT v.IDVariante,
       v.SKU,
       v.AtributosJson,
       v.Activo AS VarianteActiva,
       p.IDProducto,
       p.Nombre AS Producto,
       p.Activo AS ProductoActivo,
       p.IDCategoria,
       c.Nombre AS Categoria,
       e.CantidadFisica AS Fisica,
       e.CantidadReservada AS Reservada,
       e.CantidadFisica - e.CantidadReservada AS Disponible
FROM dbo.InventarioExistencias AS e
JOIN dbo.ProductoVariantes AS v ON v.IDVariante = e.IDVariante
JOIN dbo.Productos AS p ON p.IDProducto = v.IDProducto
JOIN dbo.Categorias AS c ON c.IDCategoria = p.IDCategoria;
GO

-- Producto con rango de precios, imagen principal y disponibilidad (solo variantes activas).
CREATE OR ALTER VIEW dbo.VW_Catalogo_ProductosTienda
AS
SELECT p.IDProducto,
       p.Nombre,
       p.Descripcion,
       p.IDCategoria,
       c.Nombre AS Categoria,
       p.Activo AS ProductoActivo,
       c.Activo AS CategoriaActiva,
       CAST(CASE WHEN p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END AS BIT) AS Activo,
       p.FechaCreacion,
       x.PrecioDesde,
       x.PrecioHasta,
       ISNULL(x.HayStock, 0) AS HayStock,
       (SELECT TOP (1) i.Url FROM dbo.ProductoImagenes AS i
         WHERE i.IDProducto = p.IDProducto ORDER BY i.EsPrincipal DESC, i.Orden, i.IDImagen) AS ImagenPrincipal
FROM dbo.Productos AS p
JOIN dbo.Categorias AS c ON c.IDCategoria = p.IDCategoria
OUTER APPLY (
    SELECT MIN(v.Precio) AS PrecioDesde,
           MAX(v.Precio) AS PrecioHasta,
           CAST(MAX(CASE WHEN e.CantidadFisica - e.CantidadReservada > 0 THEN 1 ELSE 0 END) AS BIT) AS HayStock
    FROM dbo.ProductoVariantes AS v
    LEFT JOIN dbo.InventarioExistencias AS e ON e.IDVariante = v.IDVariante
    WHERE v.IDProducto = p.IDProducto AND v.Activo = 1
) AS x;
GO

-- Historial de estados con nombres legibles (RF-07).
CREATE OR ALTER VIEW dbo.VW_Pedidos_Historial
AS
SELECT h.IDHistorial,
       h.IDPedido,
       ea.Codigo AS EstadoAnteriorCodigo,
       ea.Nombre AS EstadoAnteriorNombre,
       en.Codigo AS EstadoNuevoCodigo,
       en.Nombre AS EstadoNuevoNombre,
       h.IDUsuario,
       u.Nombre AS Usuario,
       h.Nota,
       h.Fecha
FROM dbo.PedidoEstadoHistorial AS h
JOIN dbo.PedidoEstados AS en ON en.IDEstado = h.IDEstadoNuevo
LEFT JOIN dbo.PedidoEstados AS ea ON ea.IDEstado = h.IDEstadoAnterior
JOIN dbo.Usuarios AS u ON u.IDUsuario = h.IDUsuario;
GO

-- Base única de RF-08: línea vendida neta de devoluciones, solo pedidos que cuentan como venta
-- (excluye Cancelado). FechaLocal = fecha en Guatemala (UTC−6 todo el año, sin horario de verano).
CREATE OR ALTER VIEW dbo.VW_Dashboard_LineasNetas
AS
SELECT pl.IDPedidoLinea,
       pl.IDPedido,
       pe.IDUsuario,
       pe.FechaCreacion,
       CAST(DATEADD(HOUR, -6, pe.FechaCreacion) AS DATE) AS FechaLocal,
       est.Codigo AS EstadoCodigo,
       pl.IDCategoria,
       cat.Nombre AS Categoria,
       v.IDProducto,
       pl.NombreProducto,
       pl.SKU,
       pl.Cantidad AS CantidadBruta,
       pl.Cantidad - ISNULL(dv.Cantidad, 0) AS CantidadNeta,
       pl.TotalLinea AS MontoBruto,
       pl.TotalLinea - ISNULL(dv.Monto, 0) AS MontoNeto,
       ISNULL(dv.Monto, 0) AS MontoDevuelto
FROM dbo.PedidoLineas AS pl
JOIN dbo.Pedidos AS pe ON pe.IDPedido = pl.IDPedido
JOIN dbo.PedidoEstados AS est ON est.IDEstado = pe.IDEstado AND est.CuentaComoVenta = 1
JOIN dbo.Categorias AS cat ON cat.IDCategoria = pl.IDCategoria
JOIN dbo.ProductoVariantes AS v ON v.IDVariante = pl.IDVariante
OUTER APPLY (
    SELECT SUM(d.Cantidad) AS Cantidad, SUM(d.MontoReembolso) AS Monto
    FROM dbo.DevolucionLineas AS d
    WHERE d.IDPedidoLinea = pl.IDPedidoLinea
) AS dv;
GO

-- Ventas netas por día local y categoría.
CREATE OR ALTER VIEW dbo.VW_Dashboard_VentasPorCategoria
AS
SELECT FechaLocal,
       IDCategoria,
       Categoria,
       SUM(CantidadNeta) AS Unidades,
       SUM(MontoNeto) AS VentasNetas
FROM dbo.VW_Dashboard_LineasNetas
GROUP BY FechaLocal, IDCategoria, Categoria;
GO
