/* =============================================================================
   006_sp_cart_coupons.sql — Carrito (RF-04) y cupones (RF-05).
   El carrito siempre se resuelve en el servidor (usuario de la sesión o token de invitado):
   el cliente nunca envía un IDCarrito. Toda mutación del carrito responde con el detalle.
   Errores: 50003 inactiva · 50010 carrito vacío · 50012 excede disponible ·
            50020-50025 cupón · 50043 prohibido · 50044 no encontrado · 50099 regla genérica.
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ══ Cupones: validación interna ════════════════════════════════════════════ */

/* (i) Lanza el error específico (50020-50025) si el cupón no aplica al carrito. */
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ValidarParaCarrito
    @IDCupon   INT,
    @IDCarrito INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Motivo NVARCHAR(40), @Mensaje NVARCHAR(200);
    SELECT @Motivo = Motivo, @Mensaje = Mensaje FROM dbo.FU_Cupones_CalculoDescuento(@IDCupon, @IDCarrito);

    IF @Motivo IS NULL RETURN;

    DECLARE @Numero INT = CASE @Motivo
        WHEN N'CUPON_INVALIDO'                THEN 50020
        WHEN N'CUPON_FUERA_VIGENCIA'          THEN 50021
        WHEN N'CUPON_MONTO_MINIMO'            THEN 50022
        WHEN N'CUPON_AGOTADO'                 THEN 50023
        WHEN N'CUPON_LIMITE_CLIENTE'          THEN 50024
        WHEN N'CUPON_SIN_PRODUCTOS_ELEGIBLES' THEN 50025
        ELSE 50020 END;
    THROW @Numero, @Mensaje, 1;
END
GO

/* ══ Carrito: resolución y lectura ══════════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ObtenerOCrearPorUsuario
    @IDUsuario INT,
    @Crear     BIT = 1
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @ID INT;
    BEGIN TRY
        BEGIN TRAN;
            SELECT @ID = IDCarrito FROM dbo.Carritos WITH (UPDLOCK, HOLDLOCK)
             WHERE IDUsuario = @IDUsuario AND Activo = 1;
            IF @ID IS NULL AND @Crear = 1
            BEGIN
                INSERT INTO dbo.Carritos (IDUsuario) VALUES (@IDUsuario);
                SET @ID = SCOPE_IDENTITY();
            END
        COMMIT;
        SELECT @ID AS IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- El token de invitado lo genera SIEMPRE el servidor: un token desconocido no crea carritos con ese valor.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ObtenerOCrearPorToken
    @TokenInvitado UNIQUEIDENTIFIER = NULL,
    @Crear         BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ID INT, @Token UNIQUEIDENTIFIER;
    IF @TokenInvitado IS NOT NULL
        SELECT @ID = IDCarrito, @Token = TokenInvitado FROM dbo.Carritos
         WHERE TokenInvitado = @TokenInvitado AND Activo = 1;

    IF @ID IS NULL AND @Crear = 1
    BEGIN
        SET @Token = NEWID();
        INSERT INTO dbo.Carritos (TokenInvitado) VALUES (@Token);
        SET @ID = SCOPE_IDENTITY();
    END
    SELECT @ID AS IDCarrito, @Token AS TokenInvitado;
END
GO

-- Recordsets: 1) cabecera y totales, 2) líneas con precio vigente, disponible y problema.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ObtenerDetalle
    @IDCarrito INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT c.IDCarrito, c.TokenInvitado,
           t.Subtotal, t.Descuento, t.Total,
           t.CuponCodigo, t.CuponValido, t.CuponMotivo, t.CuponMensaje,
           ISNULL((SELECT SUM(cl.Cantidad) FROM dbo.CarritoLineas AS cl WHERE cl.IDCarrito = c.IDCarrito), 0)
               AS CantidadItems,
           (SELECT MIN(r.ExpiraEn) FROM dbo.InventarioReservas AS r
             WHERE r.IDCarrito = c.IDCarrito AND r.Estado = N'Activa' AND r.ExpiraEn > SYSUTCDATETIME())
               AS ReservaExpiraEn
    FROM dbo.Carritos AS c
    CROSS APPLY dbo.FU_Carrito_CalcularTotales(c.IDCarrito) AS t
    WHERE c.IDCarrito = @IDCarrito;

    SELECT cl.IDCarritoLinea, cl.IDVariante, p.IDProducto, v.SKU, p.Nombre AS NombreProducto,
           v.AtributosJson,
           (SELECT TOP (1) i.Url FROM dbo.ProductoImagenes AS i
             WHERE i.IDProducto = p.IDProducto ORDER BY i.EsPrincipal DESC, i.Orden, i.IDImagen) AS Imagen,
           pv.PrecioUnitario,
           cl.Cantidad,
           x.DisponibleParaMi AS Disponible,
           CAST(cl.Cantidad * pv.PrecioUnitario AS DECIMAL(18, 2)) AS TotalLinea,
           CASE
               WHEN v.Activo = 0 OR p.Activo = 0 OR cat.Activo = 0 THEN N'INACTIVA'
               WHEN cl.Cantidad > x.DisponibleParaMi
                    THEN CASE WHEN x.DisponibleParaMi <= 0 THEN N'SIN_STOCK' ELSE N'EXCEDE_DISPONIBLE' END
           END AS Problema
    FROM dbo.CarritoLineas AS cl
    JOIN dbo.FU_Catalogo_PrecioVigente(@IDCarrito) AS pv ON pv.IDCarritoLinea = cl.IDCarritoLinea
    JOIN dbo.ProductoVariantes AS v ON v.IDVariante = cl.IDVariante
    JOIN dbo.Productos AS p ON p.IDProducto = v.IDProducto
    JOIN dbo.Categorias AS cat ON cat.IDCategoria = p.IDCategoria
    JOIN dbo.InventarioExistencias AS e ON e.IDVariante = cl.IDVariante
    -- Disponible "para mí" = libre + lo que yo mismo tengo reservado.
    CROSS APPLY (
        SELECT e.CantidadFisica - e.CantidadReservada
             + ISNULL((SELECT SUM(r.Cantidad) FROM dbo.InventarioReservas AS r
                        WHERE r.IDCarrito = cl.IDCarrito AND r.IDVariante = cl.IDVariante
                          AND r.Estado = N'Activa' AND r.ExpiraEn > SYSUTCDATETIME()), 0) AS DisponibleParaMi
    ) AS x
    WHERE cl.IDCarrito = @IDCarrito
    ORDER BY cl.IDCarritoLinea;
END
GO

/* ══ Carrito: mutaciones (cada una libera reservas si cambia el contenido) ═ */

CREATE OR ALTER PROCEDURE dbo.SP_Carrito_AgregarLinea
    @IDCarrito  INT,
    @IDVariante INT,
    @Cantidad   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @Cantidad <= 0 THROW 50099, N'La cantidad debe ser mayor que cero.', 1;
        BEGIN TRAN;
            IF NOT EXISTS (SELECT 1 FROM dbo.Carritos WITH (UPDLOCK) WHERE IDCarrito = @IDCarrito AND Activo = 1)
                THROW 50044, N'El carrito no existe.', 1;

            -- Cambia el contenido: las reservas del checkout en curso ya no coinciden.
            EXEC dbo.SP_Inventario_LiberarReservasCarrito @IDCarrito;

            DECLARE @Activa BIT, @SKU NVARCHAR(50);
            SELECT @SKU = v.SKU,
                   @Activa = CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END
            FROM dbo.ProductoVariantes AS v
            JOIN dbo.Productos AS p ON p.IDProducto = v.IDProducto
            JOIN dbo.Categorias AS c ON c.IDCategoria = p.IDCategoria
            WHERE v.IDVariante = @IDVariante;

            IF @Activa IS NULL THROW 50044, N'El producto no existe.', 1;
            IF @Activa = 0 THROW 50003, N'El producto ya no está disponible.', 1;

            DECLARE @Disponible INT = (SELECT CantidadFisica - CantidadReservada
                                         FROM dbo.InventarioExistencias WHERE IDVariante = @IDVariante);
            DECLARE @Actual INT = ISNULL((SELECT Cantidad FROM dbo.CarritoLineas
                                           WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante), 0);
            DECLARE @Nueva INT = @Actual + @Cantidad;

            IF @Nueva > @Disponible
            BEGIN
                DECLARE @Msg NVARCHAR(200) = N'Solo hay ' + CAST(CASE WHEN @Disponible < 0 THEN 0 ELSE @Disponible END AS NVARCHAR(12))
                    + N' unidad(es) disponible(s) de ' + @SKU + N'.';
                THROW 50012, @Msg, 1;
            END

            IF @Actual = 0
                INSERT INTO dbo.CarritoLineas (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDVariante, @Nueva);
            ELSE
                UPDATE dbo.CarritoLineas SET Cantidad = @Nueva WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;

            UPDATE dbo.Carritos SET FechaActualizacion = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
        EXEC dbo.SP_Carrito_ObtenerDetalle @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ActualizarCantidad
    @IDCarrito      INT,
    @IDCarritoLinea INT,
    @Cantidad       INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @Cantidad <= 0 THROW 50099, N'La cantidad debe ser mayor que cero (para quitar el producto elimina la línea).', 1;
        BEGIN TRAN;
            DECLARE @CarritoDeLinea INT, @IDVariante INT, @SKU NVARCHAR(50);
            SELECT @CarritoDeLinea = cl.IDCarrito, @IDVariante = cl.IDVariante, @SKU = v.SKU
            FROM dbo.CarritoLineas AS cl WITH (UPDLOCK)
            JOIN dbo.ProductoVariantes AS v ON v.IDVariante = cl.IDVariante
            WHERE cl.IDCarritoLinea = @IDCarritoLinea;

            IF @CarritoDeLinea IS NULL THROW 50044, N'La línea del carrito no existe.', 1;
            IF @CarritoDeLinea <> @IDCarrito THROW 50043, N'La línea no pertenece a tu carrito.', 1;

            EXEC dbo.SP_Inventario_LiberarReservasCarrito @IDCarrito;

            DECLARE @Disponible INT = (SELECT CantidadFisica - CantidadReservada
                                         FROM dbo.InventarioExistencias WHERE IDVariante = @IDVariante);
            IF @Cantidad > @Disponible
            BEGIN
                DECLARE @Msg NVARCHAR(200) = N'Solo hay ' + CAST(CASE WHEN @Disponible < 0 THEN 0 ELSE @Disponible END AS NVARCHAR(12))
                    + N' unidad(es) disponible(s) de ' + @SKU + N'.';
                THROW 50012, @Msg, 1;
            END

            UPDATE dbo.CarritoLineas SET Cantidad = @Cantidad WHERE IDCarritoLinea = @IDCarritoLinea;
            UPDATE dbo.Carritos SET FechaActualizacion = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
        EXEC dbo.SP_Carrito_ObtenerDetalle @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Carrito_EliminarLinea
    @IDCarrito      INT,
    @IDCarritoLinea INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
            DECLARE @CarritoDeLinea INT;
            SELECT @CarritoDeLinea = IDCarrito FROM dbo.CarritoLineas WITH (UPDLOCK)
             WHERE IDCarritoLinea = @IDCarritoLinea;

            IF @CarritoDeLinea IS NULL THROW 50044, N'La línea del carrito no existe.', 1;
            IF @CarritoDeLinea <> @IDCarrito THROW 50043, N'La línea no pertenece a tu carrito.', 1;

            EXEC dbo.SP_Inventario_LiberarReservasCarrito @IDCarrito;
            DELETE FROM dbo.CarritoLineas WHERE IDCarritoLinea = @IDCarritoLinea;
            UPDATE dbo.Carritos SET FechaActualizacion = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
        EXEC dbo.SP_Carrito_ObtenerDetalle @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Aplicar o quitar un cupón NO afecta existencias: no toca las reservas del checkout.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_AplicarCupon
    @IDCarrito INT,
    @Codigo    NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
            IF NOT EXISTS (SELECT 1 FROM dbo.Carritos WITH (UPDLOCK) WHERE IDCarrito = @IDCarrito AND Activo = 1)
                THROW 50044, N'El carrito no existe.', 1;
            IF NOT EXISTS (SELECT 1 FROM dbo.CarritoLineas WHERE IDCarrito = @IDCarrito)
                THROW 50010, N'Tu carrito está vacío.', 1;

            DECLARE @IDCupon INT = (SELECT IDCupon FROM dbo.Cupones WHERE Codigo = UPPER(LTRIM(RTRIM(@Codigo))));
            IF @IDCupon IS NULL THROW 50020, N'El cupón no existe o no está activo.', 1;

            EXEC dbo.SP_Cupones_ValidarParaCarrito @IDCupon, @IDCarrito;

            UPDATE dbo.Carritos SET IDCupon = @IDCupon, FechaActualizacion = SYSUTCDATETIME()
             WHERE IDCarrito = @IDCarrito;
        COMMIT;
        EXEC dbo.SP_Carrito_ObtenerDetalle @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Carrito_QuitarCupon
    @IDCarrito INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Carritos SET IDCupon = NULL, FechaActualizacion = SYSUTCDATETIME()
     WHERE IDCarrito = @IDCarrito AND Activo = 1;
    EXEC dbo.SP_Carrito_ObtenerDetalle @IDCarrito;
END
GO

/* Al iniciar sesión: suma las líneas del carrito de invitado al del usuario (acotadas al disponible).
   El cupón del invitado se conserva solo si el usuario no tenía uno. El carrito invitado se desactiva. */
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_FusionarInvitadoAUsuario
    @IDUsuario      INT,
    @TokenInvitado  UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
            DECLARE @Invitado INT, @CuponInvitado INT;
            SELECT @Invitado = IDCarrito, @CuponInvitado = IDCupon
            FROM dbo.Carritos WITH (UPDLOCK)
            WHERE TokenInvitado = @TokenInvitado AND Activo = 1;

            IF @Invitado IS NOT NULL
            BEGIN
                DECLARE @Usuario INT;
                SELECT @Usuario = IDCarrito FROM dbo.Carritos WITH (UPDLOCK, HOLDLOCK)
                 WHERE IDUsuario = @IDUsuario AND Activo = 1;
                IF @Usuario IS NULL
                BEGIN
                    INSERT INTO dbo.Carritos (IDUsuario) VALUES (@IDUsuario);
                    SET @Usuario = SCOPE_IDENTITY();
                END

                DECLARE @Lineas TABLE (IDVariante INT PRIMARY KEY, Cantidad INT NOT NULL);
                INSERT INTO @Lineas SELECT IDVariante, Cantidad FROM dbo.CarritoLineas WHERE IDCarrito = @Invitado;

                IF EXISTS (SELECT 1 FROM @Lineas)
                BEGIN
                    EXEC dbo.SP_Inventario_LiberarReservasCarrito @Usuario;   -- el contenido cambia

                    DECLARE @IDVariante INT, @Cant INT, @Actual INT, @Disp INT, @Nueva INT;
                    WHILE EXISTS (SELECT 1 FROM @Lineas)
                    BEGIN
                        SELECT TOP (1) @IDVariante = IDVariante, @Cant = Cantidad FROM @Lineas ORDER BY IDVariante;
                        SET @Actual = ISNULL((SELECT Cantidad FROM dbo.CarritoLineas
                                               WHERE IDCarrito = @Usuario AND IDVariante = @IDVariante), 0);
                        SET @Disp = ISNULL((SELECT e.CantidadFisica - e.CantidadReservada
                                              FROM dbo.InventarioExistencias AS e
                                              JOIN dbo.ProductoVariantes AS v ON v.IDVariante = e.IDVariante
                                              JOIN dbo.Productos AS p ON p.IDProducto = v.IDProducto
                                              JOIN dbo.Categorias AS c ON c.IDCategoria = p.IDCategoria
                                             WHERE e.IDVariante = @IDVariante
                                               AND v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1), 0);
                        SET @Nueva = CASE WHEN @Actual + @Cant > @Disp THEN @Disp ELSE @Actual + @Cant END;

                        IF @Nueva > 0 AND @Nueva <> @Actual
                        BEGIN
                            IF @Actual = 0
                                INSERT INTO dbo.CarritoLineas (IDCarrito, IDVariante, Cantidad) VALUES (@Usuario, @IDVariante, @Nueva);
                            ELSE
                                UPDATE dbo.CarritoLineas SET Cantidad = @Nueva
                                 WHERE IDCarrito = @Usuario AND IDVariante = @IDVariante;
                        END
                        DELETE FROM @Lineas WHERE IDVariante = @IDVariante;
                    END
                END

                UPDATE dbo.Carritos
                   SET IDCupon = ISNULL(IDCupon, @CuponInvitado), FechaActualizacion = SYSUTCDATETIME()
                 WHERE IDCarrito = @Usuario;
                UPDATE dbo.Carritos SET Activo = 0, IDCupon = NULL, FechaActualizacion = SYSUTCDATETIME()
                 WHERE IDCarrito = @Invitado;
            END
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/* ══ Cupones (Administrador) ════════════════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Listar
    @IDUsuarioSesion INT,
    @Q               NVARCHAR(30)  = NULL,
    @Activo          BIT           = NULL,
    @Vigente         BIT           = NULL,
    @OrdenarPor      NVARCHAR(20)  = N'codigo',     -- codigo | valor | usos | hasta
    @Direccion       NVARCHAR(4)   = N'asc',
    @Pagina          INT           = 1,
    @TamanoPagina    INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Patron NVARCHAR(70) = CASE WHEN @Q IS NULL OR LTRIM(RTRIM(@Q)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(UPPER(LTRIM(RTRIM(@Q))), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;

    SELECT c.IDCupon, c.Codigo, c.Tipo, c.Valor, c.MontoMinimo, c.UsosTotalesMax, c.UsosTotalesActual,
           c.UsosPorCliente, c.IDCategoria, cat.Nombre AS Categoria, c.VigenteDesde, c.VigenteHasta, c.Activo,
           CAST(CASE WHEN c.Activo = 1 AND @Ahora BETWEEN c.VigenteDesde AND c.VigenteHasta
                      AND c.UsosTotalesActual < c.UsosTotalesMax THEN 1 ELSE 0 END AS BIT) AS Vigente,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.Cupones AS c
    LEFT JOIN dbo.Categorias AS cat ON cat.IDCategoria = c.IDCategoria
    WHERE (@Patron IS NULL OR c.Codigo LIKE @Patron)
      AND (@Activo IS NULL OR c.Activo = @Activo)
      AND (@Vigente IS NULL OR @Vigente =
           CASE WHEN c.Activo = 1 AND @Ahora BETWEEN c.VigenteDesde AND c.VigenteHasta
                 AND c.UsosTotalesActual < c.UsosTotalesMax THEN 1 ELSE 0 END)
    ORDER BY
        CASE WHEN @OrdenarPor = N'codigo' AND @Direccion = N'asc'  THEN c.Codigo END ASC,
        CASE WHEN @OrdenarPor = N'codigo' AND @Direccion = N'desc' THEN c.Codigo END DESC,
        CASE WHEN @OrdenarPor = N'valor'  AND @Direccion = N'asc'  THEN c.Valor END ASC,
        CASE WHEN @OrdenarPor = N'valor'  AND @Direccion = N'desc' THEN c.Valor END DESC,
        CASE WHEN @OrdenarPor = N'usos'   AND @Direccion = N'asc'  THEN c.UsosTotalesActual END ASC,
        CASE WHEN @OrdenarPor = N'usos'   AND @Direccion = N'desc' THEN c.UsosTotalesActual END DESC,
        CASE WHEN @OrdenarPor = N'hasta'  AND @Direccion = N'asc'  THEN c.VigenteHasta END ASC,
        CASE WHEN @OrdenarPor = N'hasta'  AND @Direccion = N'desc' THEN c.VigenteHasta END DESC,
        c.IDCupon
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Crear
    @IDUsuarioSesion INT,
    @Codigo          NVARCHAR(30),
    @Tipo            NVARCHAR(12),
    @Valor           DECIMAL(18, 2),
    @MontoMinimo     DECIMAL(18, 2) = 0,
    @UsosTotalesMax  INT,
    @UsosPorCliente  INT,
    @IDCategoria     INT = NULL,
    @VigenteDesde    DATETIME2(3),
    @VigenteHasta    DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @ID INT;
        BEGIN TRAN;
            IF @IDCategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE IDCategoria = @IDCategoria)
                THROW 50044, N'La categoría del cupón no existe.', 1;

            INSERT INTO dbo.Cupones (Codigo, Tipo, Valor, MontoMinimo, UsosTotalesMax, UsosPorCliente,
                                     IDCategoria, VigenteDesde, VigenteHasta)
            VALUES (UPPER(LTRIM(RTRIM(@Codigo))), @Tipo, @Valor, ISNULL(@MontoMinimo, 0), @UsosTotalesMax,
                    @UsosPorCliente, @IDCategoria, @VigenteDesde, @VigenteHasta);
            SET @ID = SCOPE_IDENTITY();

            DECLARE @Nuevo NVARCHAR(MAX) = (
                SELECT Codigo AS codigo, Tipo AS tipo, Valor AS valor, MontoMinimo AS montoMinimo,
                       UsosTotalesMax AS usosTotalesMax, UsosPorCliente AS usosPorCliente,
                       IDCategoria AS idCategoria, VigenteDesde AS vigenteDesde, VigenteHasta AS vigenteHasta,
                       Activo AS activo
                FROM dbo.Cupones WHERE IDCupon = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Cupones', N'Cupon', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;

        SELECT c.IDCupon, c.Codigo, c.Tipo, c.Valor, c.MontoMinimo, c.UsosTotalesMax, c.UsosTotalesActual,
               c.UsosPorCliente, c.IDCategoria, cat.Nombre AS Categoria, c.VigenteDesde, c.VigenteHasta, c.Activo,
               CAST(1 AS BIT) AS Vigente
        FROM dbo.Cupones AS c LEFT JOIN dbo.Categorias AS cat ON cat.IDCategoria = c.IDCategoria
        WHERE c.IDCupon = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Actualizar
    @IDUsuarioSesion INT,
    @IDCupon         INT,
    @Codigo          NVARCHAR(30),
    @Tipo            NVARCHAR(12),
    @Valor           DECIMAL(18, 2),
    @MontoMinimo     DECIMAL(18, 2) = 0,
    @UsosTotalesMax  INT,
    @UsosPorCliente  INT,
    @IDCategoria     INT = NULL,
    @VigenteDesde    DATETIME2(3),
    @VigenteHasta    DATETIME2(3),
    @Activo          BIT = 1
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @UsosActual INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDCupon, @UsosActual = UsosTotalesActual,
                   @Anterior = (SELECT c.Codigo AS codigo, c.Tipo AS tipo, c.Valor AS valor,
                                       c.MontoMinimo AS montoMinimo, c.UsosTotalesMax AS usosTotalesMax,
                                       c.UsosPorCliente AS usosPorCliente, c.IDCategoria AS idCategoria,
                                       c.VigenteDesde AS vigenteDesde, c.VigenteHasta AS vigenteHasta,
                                       c.Activo AS activo
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Cupones AS c WITH (UPDLOCK) WHERE c.IDCupon = @IDCupon;

            IF @Existe IS NULL THROW 50044, N'El cupón no existe.', 1;
            IF @UsosTotalesMax < @UsosActual
                THROW 50099, N'El límite total no puede ser menor que los usos ya registrados.', 1;
            IF @IDCategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE IDCategoria = @IDCategoria)
                THROW 50044, N'La categoría del cupón no existe.', 1;

            UPDATE dbo.Cupones
               SET Codigo = UPPER(LTRIM(RTRIM(@Codigo))), Tipo = @Tipo, Valor = @Valor,
                   MontoMinimo = ISNULL(@MontoMinimo, 0), UsosTotalesMax = @UsosTotalesMax,
                   UsosPorCliente = @UsosPorCliente, IDCategoria = @IDCategoria,
                   VigenteDesde = @VigenteDesde, VigenteHasta = @VigenteHasta, Activo = @Activo
             WHERE IDCupon = @IDCupon;

            DECLARE @Nuevo NVARCHAR(MAX) = (
                SELECT Codigo AS codigo, Tipo AS tipo, Valor AS valor, MontoMinimo AS montoMinimo,
                       UsosTotalesMax AS usosTotalesMax, UsosPorCliente AS usosPorCliente,
                       IDCategoria AS idCategoria, VigenteDesde AS vigenteDesde, VigenteHasta AS vigenteHasta,
                       Activo AS activo
                FROM dbo.Cupones WHERE IDCupon = @IDCupon FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Cupones', N'Cupon', @IDCupon, N'Cambio', @Anterior, @Nuevo;
        COMMIT;

        SELECT c.IDCupon, c.Codigo, c.Tipo, c.Valor, c.MontoMinimo, c.UsosTotalesMax, c.UsosTotalesActual,
               c.UsosPorCliente, c.IDCategoria, cat.Nombre AS Categoria, c.VigenteDesde, c.VigenteHasta, c.Activo,
               CAST(CASE WHEN c.Activo = 1 AND SYSUTCDATETIME() BETWEEN c.VigenteDesde AND c.VigenteHasta
                          AND c.UsosTotalesActual < c.UsosTotalesMax THEN 1 ELSE 0 END AS BIT) AS Vigente
        FROM dbo.Cupones AS c LEFT JOIN dbo.Categorias AS cat ON cat.IDCategoria = c.IDCategoria
        WHERE c.IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Desactivar
    @IDUsuarioSesion INT,
    @IDCupon         INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        BEGIN TRAN;
            DECLARE @Existe INT, @Anterior NVARCHAR(MAX);
            SELECT @Existe = IDCupon,
                   @Anterior = (SELECT c.Codigo AS codigo, c.Activo AS activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Cupones AS c WITH (UPDLOCK) WHERE c.IDCupon = @IDCupon;

            IF @Existe IS NULL THROW 50044, N'El cupón no existe.', 1;

            UPDATE dbo.Cupones SET Activo = 0 WHERE IDCupon = @IDCupon;
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT Codigo AS codigo, Activo AS activo FROM dbo.Cupones
                                             WHERE IDCupon = @IDCupon FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Cupones', N'Cupon', @IDCupon, N'Baja', @Anterior, @Nuevo;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
