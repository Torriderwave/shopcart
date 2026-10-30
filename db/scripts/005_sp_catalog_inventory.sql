/* =============================================================================
   005_sp_catalog_inventory.sql — Catálogo (RF-02) e inventario (RF-03).
   (i) = SP interno (sin transacción propia; exige una abierta).
   Errores: 50001 stock · 50003 variante inactiva · 50043 prohibido · 50044 no encontrado ·
            50050 en uso · 50060 ajuste inválido · 50099 regla de negocio.
   Convención de listados paginados: @OrdenarPor/@Direccion (CASE, sin SQL dinámico),
   @Pagina/@TamanoPagina y COUNT(*) OVER () AS TotalFilas.
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ══ Inventario internos ════════════════════════════════════════════════════ */

/* (i) Único punto que cambia existencias físicas: valida, actualiza, escribe kardex y bitácora.
   Garantiza la invariante  CantidadFisica = SUM(InventarioKardex.Cantidad). */
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_AplicarMovimiento
    @IDVariante        INT,
    @TipoMovimiento    NVARCHAR(12),
    @Cantidad          INT,                 -- con signo (Venta < 0)
    @Motivo            NVARCHAR(200),
    @IDUsuario         INT,
    @IDPedido          INT = NULL,
    @IDDevolucion      INT = NULL,
    @DescontarReserva  INT = 0              -- unidades reservadas que se consumen (ventas)
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0
        THROW 50098, N'SP_Inventario_AplicarMovimiento debe ejecutarse dentro de una transacción.', 1;

    DECLARE @Fisica INT, @Reservada INT;
    SELECT @Fisica = CantidadFisica, @Reservada = CantidadReservada
    FROM dbo.InventarioExistencias WITH (UPDLOCK, HOLDLOCK)
    WHERE IDVariante = @IDVariante;

    IF @Fisica IS NULL THROW 50044, N'La variante no existe.', 1;

    DECLARE @NuevaFisica INT = @Fisica + @Cantidad;
    DECLARE @NuevaReservada INT = @Reservada - @DescontarReserva;

    IF @NuevaFisica < 0 OR @NuevaReservada < 0 OR @NuevaReservada > @NuevaFisica
        THROW 50060, N'El movimiento dejaría la existencia en negativo o por debajo de lo reservado.', 1;

    UPDATE dbo.InventarioExistencias
       SET CantidadFisica = @NuevaFisica, CantidadReservada = @NuevaReservada
     WHERE IDVariante = @IDVariante;

    INSERT INTO dbo.InventarioKardex
        (IDVariante, TipoMovimiento, Cantidad, CantidadResultante, Motivo, IDUsuario, IDPedido, IDDevolucion)
    VALUES (@IDVariante, @TipoMovimiento, @Cantidad, @NuevaFisica, @Motivo, @IDUsuario, @IDPedido, @IDDevolucion);

    DECLARE @Anterior NVARCHAR(MAX) = (SELECT @Fisica AS fisica FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DECLARE @Nuevo NVARCHAR(MAX) = (
        SELECT @NuevaFisica AS fisica, @TipoMovimiento AS tipo, @Cantidad AS cantidad, @Motivo AS motivo
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.SP_Bitacora_Registrar @IDUsuario, N'Inventario', N'Existencia', @IDVariante, N'Movimiento',
         @Anterior, @Nuevo;
END
GO

/* (i) Reingreso de existencia por cancelación o devolución (RF-07). */
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReintegrarExistencia
    @IDVariante    INT,
    @Cantidad      INT,                     -- positiva
    @Tipo          NVARCHAR(12),            -- Cancelacion | Devolucion
    @Motivo        NVARCHAR(200),
    @IDUsuario     INT,
    @IDPedido      INT = NULL,
    @IDDevolucion  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Tipo NOT IN (N'Cancelacion', N'Devolucion') OR @Cantidad <= 0
        THROW 50099, N'Reintegro de existencia inválido.', 1;
    EXEC dbo.SP_Inventario_AplicarMovimiento @IDVariante, @Tipo, @Cantidad, @Motivo, @IDUsuario,
         @IDPedido, @IDDevolucion, 0;
END
GO

/* (i) Marca como Expirada toda reserva vencida (de una variante o de todas) y devuelve las
   unidades a disponible. La usan el job (vía el SP público) y la liberación perezosa. */
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ExpirarReservas
    @IDVariante INT = NULL,
    @Liberadas  INT = 0 OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0
        THROW 50098, N'SP_Inventario_ExpirarReservas debe ejecutarse dentro de una transacción.', 1;

    DECLARE @t TABLE (IDVariante INT NOT NULL, Cantidad INT NOT NULL);

    UPDATE r SET Estado = N'Expirada'
    OUTPUT inserted.IDVariante, inserted.Cantidad INTO @t
    FROM dbo.InventarioReservas AS r
    WHERE r.Estado = N'Activa'
      AND r.ExpiraEn <= SYSUTCDATETIME()
      AND (@IDVariante IS NULL OR r.IDVariante = @IDVariante);

    SET @Liberadas = (SELECT COUNT(*) FROM @t);

    UPDATE e SET CantidadReservada = e.CantidadReservada - x.Cantidad
    FROM dbo.InventarioExistencias AS e
    JOIN (SELECT IDVariante, SUM(Cantidad) AS Cantidad FROM @t GROUP BY IDVariante) AS x
      ON x.IDVariante = e.IDVariante;
END
GO

-- Job de 60 s del backend (SQL Server Express no tiene SQL Agent).
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_LiberarReservasVencidas
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @Liberadas INT;
        BEGIN TRAN;
            EXEC dbo.SP_Inventario_ExpirarReservas @IDVariante = NULL, @Liberadas = @Liberadas OUTPUT;
        COMMIT;
        SELECT @Liberadas AS Liberadas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/* (i) Reserva una variante para un carrito y congela su precio. Sin fila de kardex
   (las reservas no cambian la existencia física). */
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservarExistencia
    @IDVariante  INT,
    @IDCarrito   INT,
    @Cantidad    INT,
    @ExpiraEn    DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0
        THROW 50098, N'SP_Inventario_ReservarExistencia debe ejecutarse dentro de una transacción.', 1;

    -- Liberación perezosa: las reservas vencidas de esta variante vuelven a disponible.
    EXEC dbo.SP_Inventario_ExpirarReservas @IDVariante = @IDVariante;

    DECLARE @Precio DECIMAL(18, 2), @SKU NVARCHAR(50), @Activa BIT;
    SELECT @Precio = v.Precio, @SKU = v.SKU,
           @Activa = CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END
    FROM dbo.ProductoVariantes AS v
    JOIN dbo.Productos AS p ON p.IDProducto = v.IDProducto
    JOIN dbo.Categorias AS c ON c.IDCategoria = p.IDCategoria
    WHERE v.IDVariante = @IDVariante;

    IF @Activa IS NULL THROW 50044, N'La variante no existe.', 1;
    IF @Activa = 0 THROW 50003, N'El producto ya no está disponible.', 1;

    DECLARE @Fisica INT, @Reservada INT;
    SELECT @Fisica = CantidadFisica, @Reservada = CantidadReservada
    FROM dbo.InventarioExistencias WITH (UPDLOCK, HOLDLOCK)
    WHERE IDVariante = @IDVariante;

    UPDATE dbo.InventarioExistencias
       SET CantidadReservada = CantidadReservada + @Cantidad
     WHERE IDVariante = @IDVariante
       AND CantidadFisica - CantidadReservada >= @Cantidad;

    IF @@ROWCOUNT = 0
    BEGIN
        DECLARE @Msg NVARCHAR(200) = N'Stock insuficiente para ' + @SKU + N'. Disponible: '
            + CAST(CASE WHEN @Fisica - @Reservada < 0 THEN 0 ELSE @Fisica - @Reservada END AS NVARCHAR(12)) + N'.';
        THROW 50001, @Msg, 1;
    END

    INSERT INTO dbo.InventarioReservas (IDVariante, IDCarrito, Cantidad, PrecioUnitario, Estado, ExpiraEn)
    VALUES (@IDVariante, @IDCarrito, @Cantidad, @Precio, N'Activa', @ExpiraEn);
END
GO

/* (i) Libera (sin vencer) las reservas activas de un carrito: cambió su contenido o se canceló. */
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_LiberarReservasCarrito
    @IDCarrito INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0
        THROW 50098, N'SP_Inventario_LiberarReservasCarrito debe ejecutarse dentro de una transacción.', 1;

    DECLARE @t TABLE (IDVariante INT NOT NULL, Cantidad INT NOT NULL);

    UPDATE r SET Estado = N'Liberada'
    OUTPUT inserted.IDVariante, inserted.Cantidad INTO @t
    FROM dbo.InventarioReservas AS r
    WHERE r.IDCarrito = @IDCarrito AND r.Estado = N'Activa';

    UPDATE e SET CantidadReservada = e.CantidadReservada - x.Cantidad
    FROM dbo.InventarioExistencias AS e
    JOIN (SELECT IDVariante, SUM(Cantidad) AS Cantidad FROM @t GROUP BY IDVariante) AS x
      ON x.IDVariante = e.IDVariante;
END
GO

/* (i) Convierte las reservas activas de un carrito en ventas: kardex Venta (negativo) por línea. */
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ConsumirReservas
    @IDCarrito     INT,
    @IDPedido      INT,
    @IDUsuario     INT,
    @NumeroPedido  NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0
        THROW 50098, N'SP_Inventario_ConsumirReservas debe ejecutarse dentro de una transacción.', 1;

    DECLARE @Reservas TABLE (IDReserva INT NOT NULL PRIMARY KEY, IDVariante INT NOT NULL, Cantidad INT NOT NULL);
    INSERT INTO @Reservas (IDReserva, IDVariante, Cantidad)
    SELECT IDReserva, IDVariante, Cantidad
    FROM dbo.InventarioReservas
    WHERE IDCarrito = @IDCarrito AND Estado = N'Activa';

    DECLARE @IDReserva INT, @IDVariante INT, @Cantidad INT;
    DECLARE @Motivo NVARCHAR(200) = N'Venta pedido ' + @NumeroPedido;
    DECLARE @Neg INT;

    -- Orden fijo por variante: evita deadlocks entre checkouts concurrentes.
    WHILE EXISTS (SELECT 1 FROM @Reservas)
    BEGIN
        SELECT TOP (1) @IDReserva = IDReserva, @IDVariante = IDVariante, @Cantidad = Cantidad
        FROM @Reservas ORDER BY IDVariante, IDReserva;

        UPDATE dbo.InventarioReservas SET Estado = N'Consumida' WHERE IDReserva = @IDReserva;
        SET @Neg = -@Cantidad;
        EXEC dbo.SP_Inventario_AplicarMovimiento @IDVariante, N'Venta', @Neg, @Motivo, @IDUsuario,
             @IDPedido, NULL, @Cantidad;

        DELETE FROM @Reservas WHERE IDReserva = @IDReserva;
    END
END
GO

/* ══ Inventario público (Operador / Administrador) ══════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Inventario_Entrada
    @IDUsuarioSesion INT,
    @IDVariante      INT,
    @Cantidad        INT,
    @Motivo          NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';
        IF @Cantidad <= 0 THROW 50099, N'La cantidad de una entrada debe ser mayor que cero.', 1;
        IF LEN(LTRIM(RTRIM(ISNULL(@Motivo, N'')))) = 0 THROW 50099, N'El motivo es obligatorio.', 1;

        BEGIN TRAN;
            EXEC dbo.SP_Inventario_AplicarMovimiento @IDVariante, N'Entrada', @Cantidad,
                 @Motivo, @IDUsuarioSesion, NULL, NULL, 0;
        COMMIT;

        SELECT IDVariante, SKU, Producto, AtributosJson, Fisica, Reservada, Disponible
        FROM dbo.VW_Inventario_Disponible WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Ajuste manual (delta con signo). Exige motivo y no puede dejar la existencia en negativo (RF-03).
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_Ajuste
    @IDUsuarioSesion INT,
    @IDVariante      INT,
    @Cantidad        INT,
    @Motivo          NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';
        IF @Cantidad = 0 THROW 50099, N'El ajuste no puede ser cero.', 1;
        IF LEN(LTRIM(RTRIM(ISNULL(@Motivo, N'')))) = 0 THROW 50099, N'El motivo es obligatorio.', 1;

        BEGIN TRAN;
            EXEC dbo.SP_Inventario_AplicarMovimiento @IDVariante, N'Ajuste', @Cantidad,
                 @Motivo, @IDUsuarioSesion, NULL, NULL, 0;
        COMMIT;

        SELECT IDVariante, SKU, Producto, AtributosJson, Fisica, Reservada, Disponible
        FROM dbo.VW_Inventario_Disponible WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ListarExistencias
    @IDUsuarioSesion INT,
    @Q               NVARCHAR(100) = NULL,
    @IDCategoria     INT           = NULL,
    @SoloSinStock    BIT           = 0,
    @OrdenarPor      NVARCHAR(20)  = N'sku',        -- sku | producto | fisica | disponible
    @Direccion       NVARCHAR(4)   = N'asc',
    @Pagina          INT           = 1,
    @TamanoPagina    INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';

    DECLARE @Patron NVARCHAR(210) = CASE WHEN @Q IS NULL OR LTRIM(RTRIM(@Q)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Q)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;

    SELECT IDVariante, SKU, Producto, AtributosJson, IDCategoria, Categoria, VarianteActiva,
           Fisica, Reservada, Disponible,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.VW_Inventario_Disponible
    WHERE (@Patron IS NULL OR SKU LIKE @Patron OR Producto LIKE @Patron)
      AND (@IDCategoria IS NULL OR IDCategoria = @IDCategoria)
      AND (@SoloSinStock = 0 OR Disponible <= 0)
    ORDER BY
        CASE WHEN @OrdenarPor = N'sku'        AND @Direccion = N'asc'  THEN SKU END ASC,
        CASE WHEN @OrdenarPor = N'sku'        AND @Direccion = N'desc' THEN SKU END DESC,
        CASE WHEN @OrdenarPor = N'producto'   AND @Direccion = N'asc'  THEN Producto END ASC,
        CASE WHEN @OrdenarPor = N'producto'   AND @Direccion = N'desc' THEN Producto END DESC,
        CASE WHEN @OrdenarPor = N'fisica'     AND @Direccion = N'asc'  THEN Fisica END ASC,
        CASE WHEN @OrdenarPor = N'fisica'     AND @Direccion = N'desc' THEN Fisica END DESC,
        CASE WHEN @OrdenarPor = N'disponible' AND @Direccion = N'asc'  THEN Disponible END ASC,
        CASE WHEN @OrdenarPor = N'disponible' AND @Direccion = N'desc' THEN Disponible END DESC,
        IDVariante
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

-- Recordset 1: movimientos (más recientes primero). Recordset 2: la variante consultada.
-- @Desde/@Hasta: 'YYYY-MM-DD' en hora de Guatemala, ambos inclusivos.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ObtenerKardex
    @IDUsuarioSesion INT,
    @IDVariante      INT,
    @Tipo            NVARCHAR(12) = NULL,
    @Desde           NVARCHAR(10) = NULL,
    @Hasta           NVARCHAR(10) = NULL,
    @Pagina          INT          = 1,
    @TamanoPagina    INT          = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';

    IF NOT EXISTS (SELECT 1 FROM dbo.ProductoVariantes WHERE IDVariante = @IDVariante)
        THROW 50044, N'La variante no existe.', 1;

    DECLARE @DesdeUtc DATETIME2(3) = DATEADD(HOUR, 6, TRY_CONVERT(DATETIME2(3), @Desde, 23));
    DECLARE @HastaUtc DATETIME2(3) = DATEADD(HOUR, 6, DATEADD(DAY, 1, TRY_CONVERT(DATETIME2(3), @Hasta, 23)));

    SELECT k.IDKardex, k.Fecha, k.TipoMovimiento AS Tipo, k.Cantidad, k.CantidadResultante AS Resultante,
           k.Motivo, u.Nombre AS Usuario, p.NumeroPedido,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.InventarioKardex AS k
    JOIN dbo.Usuarios AS u ON u.IDUsuario = k.IDUsuario
    LEFT JOIN dbo.Pedidos AS p ON p.IDPedido = k.IDPedido
    WHERE k.IDVariante = @IDVariante
      AND (@Tipo IS NULL OR k.TipoMovimiento = @Tipo)
      AND (@DesdeUtc IS NULL OR k.Fecha >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR k.Fecha < @HastaUtc)
    ORDER BY k.Fecha DESC, k.IDKardex DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT IDVariante, SKU, Producto, AtributosJson, Fisica, Reservada, Disponible
    FROM dbo.VW_Inventario_Disponible WHERE IDVariante = @IDVariante;
END
GO

/* ══ Catálogo: lectura ══════════════════════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarCategorias
    @IncluirInactivas BIT = 0,
    @IDUsuarioSesion  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @IncluirInactivas = 1 EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    SELECT c.IDCategoria, c.Nombre, c.Descripcion, c.Activo,
           (SELECT COUNT(*) FROM dbo.Productos AS p WHERE p.IDCategoria = c.IDCategoria AND p.Activo = 1)
               AS ProductosActivos
    FROM dbo.Categorias AS c
    WHERE @IncluirInactivas = 1 OR c.Activo = 1
    ORDER BY c.Nombre;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_BuscarProductos
    @Q                NVARCHAR(100) = NULL,
    @IDCategoria      INT           = NULL,
    @PrecioMin        DECIMAL(18,2) = NULL,
    @PrecioMax        DECIMAL(18,2) = NULL,
    @SoloDisponibles  BIT           = 0,
    @IncluirInactivos BIT           = 0,
    @IDUsuarioSesion  INT           = NULL,
    @OrdenarPor       NVARCHAR(20)  = N'nombre',    -- nombre | precio | recientes
    @Direccion        NVARCHAR(4)   = N'asc',
    @Pagina           INT           = 1,
    @TamanoPagina     INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @IncluirInactivos = 1 EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    DECLARE @Patron NVARCHAR(210) = CASE WHEN @Q IS NULL OR LTRIM(RTRIM(@Q)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Q)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;

    SELECT t.IDProducto, t.Nombre, t.IDCategoria, t.Categoria, t.PrecioDesde, t.PrecioHasta,
           t.ImagenPrincipal, t.HayStock, t.Activo,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.VW_Catalogo_ProductosTienda AS t
    WHERE (@IncluirInactivos = 1 OR (t.Activo = 1 AND t.PrecioDesde IS NOT NULL))
      AND (@Patron IS NULL OR t.Nombre LIKE @Patron OR t.Descripcion LIKE @Patron
           OR EXISTS (SELECT 1 FROM dbo.ProductoVariantes AS v
                       WHERE v.IDProducto = t.IDProducto AND v.SKU LIKE @Patron))
      AND (@IDCategoria IS NULL OR t.IDCategoria = @IDCategoria)
      -- El producto califica si su rango de precios se traslapa con el filtro.
      AND (@PrecioMin IS NULL OR t.PrecioHasta >= @PrecioMin)
      AND (@PrecioMax IS NULL OR t.PrecioDesde <= @PrecioMax)
      AND (@SoloDisponibles = 0 OR t.HayStock = 1)
    ORDER BY
        CASE WHEN @OrdenarPor = N'nombre'    AND @Direccion = N'asc'  THEN t.Nombre END ASC,
        CASE WHEN @OrdenarPor = N'nombre'    AND @Direccion = N'desc' THEN t.Nombre END DESC,
        CASE WHEN @OrdenarPor = N'precio'    AND @Direccion = N'asc'  THEN t.PrecioDesde END ASC,
        CASE WHEN @OrdenarPor = N'precio'    AND @Direccion = N'desc' THEN t.PrecioDesde END DESC,
        CASE WHEN @OrdenarPor = N'recientes' AND @Direccion = N'asc'  THEN t.FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = N'recientes' AND @Direccion = N'desc' THEN t.FechaCreacion END DESC,
        t.IDProducto
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

-- Recordsets: 1) producto, 2) variantes con disponible, 3) imágenes.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerProductoPorId
    @IDProducto       INT,
    @IncluirInactivos BIT = 0,
    @IDUsuarioSesion  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @IncluirInactivos = 1 EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    IF NOT EXISTS (SELECT 1 FROM dbo.VW_Catalogo_ProductosTienda
                    WHERE IDProducto = @IDProducto AND (@IncluirInactivos = 1 OR Activo = 1))
        THROW 50044, N'El producto no existe.', 1;

    SELECT IDProducto, Nombre, Descripcion, IDCategoria, Categoria, PrecioDesde, PrecioHasta,
           ImagenPrincipal, HayStock, Activo
    FROM dbo.VW_Catalogo_ProductosTienda WHERE IDProducto = @IDProducto;

    SELECT v.IDVariante, v.SKU, v.AtributosJson, v.Precio, v.Activo,
           ISNULL(e.CantidadFisica - e.CantidadReservada, 0) AS Disponible
    FROM dbo.ProductoVariantes AS v
    LEFT JOIN dbo.InventarioExistencias AS e ON e.IDVariante = v.IDVariante
    WHERE v.IDProducto = @IDProducto AND (@IncluirInactivos = 1 OR v.Activo = 1)
    ORDER BY v.IDVariante;

    SELECT IDImagen, Url, Orden, EsPrincipal
    FROM dbo.ProductoImagenes WHERE IDProducto = @IDProducto ORDER BY EsPrincipal DESC, Orden, IDImagen;
END
GO

/* ══ Catálogo: escritura (Administrador) ════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearCategoria
    @IDUsuarioSesion INT,
    @Nombre          NVARCHAR(100),
    @Descripcion     NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @ID INT;
        BEGIN TRAN;
            INSERT INTO dbo.Categorias (Nombre, Descripcion) VALUES (LTRIM(RTRIM(@Nombre)), @Descripcion);
            SET @ID = SCOPE_IDENTITY();
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT Nombre, Descripcion, Activo FROM dbo.Categorias
                                             WHERE IDCategoria = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Categoria', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;
        SELECT IDCategoria, Nombre, Descripcion, Activo, 0 AS ProductosActivos
        FROM dbo.Categorias WHERE IDCategoria = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarCategoria
    @IDUsuarioSesion INT,
    @IDCategoria     INT,
    @Nombre          NVARCHAR(100),
    @Descripcion     NVARCHAR(500) = NULL,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDCategoria,
                   @Anterior = (SELECT c.Nombre, c.Descripcion, c.Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Categorias AS c WITH (UPDLOCK) WHERE c.IDCategoria = @IDCategoria;

            IF @Existe IS NULL THROW 50044, N'La categoría no existe.', 1;
            IF @Activo = 0 AND EXISTS (SELECT 1 FROM dbo.Productos WHERE IDCategoria = @IDCategoria AND Activo = 1)
                THROW 50050, N'No se puede desactivar una categoría con productos activos.', 1;

            UPDATE dbo.Categorias SET Nombre = LTRIM(RTRIM(@Nombre)), Descripcion = @Descripcion, Activo = @Activo
             WHERE IDCategoria = @IDCategoria;

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT Nombre, Descripcion, Activo FROM dbo.Categorias
                                             WHERE IDCategoria = @IDCategoria FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Categoria', @IDCategoria,
                 N'Cambio', @Anterior, @Nuevo;
        COMMIT;
        SELECT c.IDCategoria, c.Nombre, c.Descripcion, c.Activo,
               (SELECT COUNT(*) FROM dbo.Productos p WHERE p.IDCategoria = c.IDCategoria AND p.Activo = 1) AS ProductosActivos
        FROM dbo.Categorias AS c WHERE c.IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_DesactivarCategoria
    @IDUsuarioSesion INT,
    @IDCategoria     INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDCategoria,
                   @Anterior = (SELECT c.Nombre, c.Descripcion, c.Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Categorias AS c WITH (UPDLOCK) WHERE c.IDCategoria = @IDCategoria;

            IF @Existe IS NULL THROW 50044, N'La categoría no existe.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Productos WHERE IDCategoria = @IDCategoria AND Activo = 1)
                THROW 50050, N'No se puede desactivar una categoría con productos activos.', 1;

            UPDATE dbo.Categorias SET Activo = 0 WHERE IDCategoria = @IDCategoria;
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT Nombre, Descripcion, Activo FROM dbo.Categorias
                                             WHERE IDCategoria = @IDCategoria FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Categoria', @IDCategoria,
                 N'Baja', @Anterior, @Nuevo;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearProducto
    @IDUsuarioSesion INT,
    @IDCategoria     INT,
    @Nombre          NVARCHAR(150),
    @Descripcion     NVARCHAR(2000) = N''
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @ID INT;
        BEGIN TRAN;
            IF NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE IDCategoria = @IDCategoria AND Activo = 1)
                THROW 50044, N'La categoría no existe o está inactiva.', 1;

            INSERT INTO dbo.Productos (IDCategoria, Nombre, Descripcion)
            VALUES (@IDCategoria, LTRIM(RTRIM(@Nombre)), ISNULL(@Descripcion, N''));
            SET @ID = SCOPE_IDENTITY();

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT IDCategoria AS idCategoria, Nombre AS nombre,
                                                   Descripcion AS descripcion, Activo AS activo
                                            FROM dbo.Productos WHERE IDProducto = @ID
                                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Producto', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;
        EXEC dbo.SP_Catalogo_ObtenerProductoPorId @ID, 1, @IDUsuarioSesion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarProducto
    @IDUsuarioSesion INT,
    @IDProducto      INT,
    @IDCategoria     INT,
    @Nombre          NVARCHAR(150),
    @Descripcion     NVARCHAR(2000) = N'',
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDProducto,
                   @Anterior = (SELECT p.IDCategoria AS idCategoria, p.Nombre AS nombre,
                                       p.Descripcion AS descripcion, p.Activo AS activo
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Productos AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto;

            IF @Existe IS NULL THROW 50044, N'El producto no existe.', 1;
            IF NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE IDCategoria = @IDCategoria)
                THROW 50044, N'La categoría no existe.', 1;

            UPDATE dbo.Productos
               SET IDCategoria = @IDCategoria, Nombre = LTRIM(RTRIM(@Nombre)),
                   Descripcion = ISNULL(@Descripcion, N''), Activo = @Activo,
                   FechaActualizacion = SYSUTCDATETIME()
             WHERE IDProducto = @IDProducto;

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT IDCategoria AS idCategoria, Nombre AS nombre,
                                                   Descripcion AS descripcion, Activo AS activo
                                            FROM dbo.Productos WHERE IDProducto = @IDProducto
                                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Producto', @IDProducto,
                 N'Cambio', @Anterior, @Nuevo;
        COMMIT;
        EXEC dbo.SP_Catalogo_ObtenerProductoPorId @IDProducto, 1, @IDUsuarioSesion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_DesactivarProducto
    @IDUsuarioSesion INT,
    @IDProducto      INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDProducto,
                   @Anterior = (SELECT p.Nombre AS nombre, p.Activo AS activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Productos AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto;

            IF @Existe IS NULL THROW 50044, N'El producto no existe.', 1;

            UPDATE dbo.Productos SET Activo = 0, FechaActualizacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT Nombre AS nombre, Activo AS activo FROM dbo.Productos
                                             WHERE IDProducto = @IDProducto FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Producto', @IDProducto,
                 N'Baja', @Anterior, @Nuevo;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Crea la variante y su fila de existencias en 0 (sin existencia no se puede reservar).
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearVariante
    @IDUsuarioSesion INT,
    @IDProducto      INT,
    @SKU             NVARCHAR(50),
    @AtributosJson   NVARCHAR(1000),
    @Precio          DECIMAL(18, 2)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @ID INT;
        BEGIN TRAN;
            IF NOT EXISTS (SELECT 1 FROM dbo.Productos WHERE IDProducto = @IDProducto)
                THROW 50044, N'El producto no existe.', 1;

            INSERT INTO dbo.ProductoVariantes (IDProducto, SKU, AtributosJson, Precio)
            VALUES (@IDProducto, UPPER(LTRIM(RTRIM(@SKU))), @AtributosJson, @Precio);
            SET @ID = SCOPE_IDENTITY();

            INSERT INTO dbo.InventarioExistencias (IDVariante) VALUES (@ID);

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT SKU AS sku, JSON_QUERY(AtributosJson) AS atributos,
                                                   Precio AS precio, Activo AS activo
                                            FROM dbo.ProductoVariantes WHERE IDVariante = @ID
                                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Variante', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;
        EXEC dbo.SP_Catalogo_ObtenerProductoPorId @IDProducto, 1, @IDUsuarioSesion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Un cambio de precio queda en bitácora con valor anterior y nuevo (RF-09) y NO altera pedidos hechos.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarVariante
    @IDUsuarioSesion INT,
    @IDVariante      INT,
    @SKU             NVARCHAR(50),
    @AtributosJson   NVARCHAR(1000),
    @Precio          DECIMAL(18, 2),
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @IDProducto INT;
        BEGIN TRAN;
            DECLARE @Anterior NVARCHAR(MAX);
            SELECT @IDProducto = v.IDProducto,
                   @Anterior = (SELECT v.SKU AS sku, JSON_QUERY(v.AtributosJson) AS atributos,
                                       v.Precio AS precio, v.Activo AS activo
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.ProductoVariantes AS v WITH (UPDLOCK) WHERE v.IDVariante = @IDVariante;

            IF @IDProducto IS NULL THROW 50044, N'La variante no existe.', 1;

            UPDATE dbo.ProductoVariantes
               SET SKU = UPPER(LTRIM(RTRIM(@SKU))), AtributosJson = @AtributosJson, Precio = @Precio, Activo = @Activo
             WHERE IDVariante = @IDVariante;

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT SKU AS sku, JSON_QUERY(AtributosJson) AS atributos,
                                                   Precio AS precio, Activo AS activo
                                            FROM dbo.ProductoVariantes WHERE IDVariante = @IDVariante
                                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Variante', @IDVariante,
                 N'Cambio', @Anterior, @Nuevo;
        COMMIT;
        EXEC dbo.SP_Catalogo_ObtenerProductoPorId @IDProducto, 1, @IDUsuarioSesion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_DesactivarVariante
    @IDUsuarioSesion INT,
    @IDVariante      INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDVariante,
                   @Anterior = (SELECT v.SKU AS sku, v.Precio AS precio, v.Activo AS activo
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.ProductoVariantes AS v WITH (UPDLOCK) WHERE v.IDVariante = @IDVariante;

            IF @Existe IS NULL THROW 50044, N'La variante no existe.', 1;

            UPDATE dbo.ProductoVariantes SET Activo = 0 WHERE IDVariante = @IDVariante;
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT SKU AS sku, Precio AS precio, Activo AS activo
                                            FROM dbo.ProductoVariantes WHERE IDVariante = @IDVariante
                                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Variante', @IDVariante,
                 N'Baja', @Anterior, @Nuevo;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_GuardarImagen
    @IDUsuarioSesion INT,
    @IDProducto      INT,
    @Url             NVARCHAR(500),
    @Orden           INT = 0,
    @EsPrincipal     BIT = 0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @ID INT;
        BEGIN TRAN;
            IF NOT EXISTS (SELECT 1 FROM dbo.Productos WITH (UPDLOCK) WHERE IDProducto = @IDProducto)
                THROW 50044, N'El producto no existe.', 1;

            IF NOT EXISTS (SELECT 1 FROM dbo.ProductoImagenes WHERE IDProducto = @IDProducto)
                SET @EsPrincipal = 1;
            IF @EsPrincipal = 1
                UPDATE dbo.ProductoImagenes SET EsPrincipal = 0 WHERE IDProducto = @IDProducto AND EsPrincipal = 1;

            INSERT INTO dbo.ProductoImagenes (IDProducto, Url, Orden, EsPrincipal)
            VALUES (@IDProducto, @Url, @Orden, @EsPrincipal);
            SET @ID = SCOPE_IDENTITY();

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT @IDProducto AS idProducto, @Url AS url, @Orden AS orden,
                                                   @EsPrincipal AS esPrincipal FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Imagen', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;
        EXEC dbo.SP_Catalogo_ObtenerProductoPorId @IDProducto, 1, @IDUsuarioSesion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_EliminarImagen
    @IDUsuarioSesion INT,
    @IDImagen        INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @IDProducto INT, @Url NVARCHAR(500), @EraPrincipal BIT;
            SELECT @IDProducto = IDProducto, @Url = Url, @EraPrincipal = EsPrincipal
            FROM dbo.ProductoImagenes WITH (UPDLOCK) WHERE IDImagen = @IDImagen;

            IF @IDProducto IS NULL THROW 50044, N'La imagen no existe.', 1;

            DELETE FROM dbo.ProductoImagenes WHERE IDImagen = @IDImagen;

            IF @EraPrincipal = 1
                UPDATE dbo.ProductoImagenes SET EsPrincipal = 1
                 WHERE IDImagen = (SELECT TOP (1) IDImagen FROM dbo.ProductoImagenes
                                    WHERE IDProducto = @IDProducto ORDER BY Orden, IDImagen);

            DECLARE @Anterior NVARCHAR(MAX) = (SELECT @IDProducto AS idProducto, @Url AS url FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Catalogo', N'Imagen', @IDImagen, N'Baja', @Anterior, NULL;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
