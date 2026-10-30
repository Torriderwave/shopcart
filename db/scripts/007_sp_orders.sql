/* =============================================================================
   007_sp_orders.sql — Envío, checkout (RF-06), pedidos y devoluciones (RF-07).
   Errores: 50001 stock · 50002 reserva vencida · 50003 inactiva · 50010 carrito vacío ·
            50011 sin checkout activo · 50013 total cambió · 50020-25 cupón ·
            50030 transición inválida · 50031 no cancelable · 50032 devolución excede ·
            50033 devolución no permitida · 50034 envío no aplica · 50035 dirección inválida ·
            50043 prohibido · 50044 no encontrado · 50099 regla genérica.
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo.SP_MetodosEnvio_Listar
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IDMetodoEnvio, Nombre, Costo, MontoMinimo, DiasEstimados
    FROM dbo.MetodosEnvio
    WHERE Activo = 1
    ORDER BY Costo, IDMetodoEnvio;
END
GO

/* ══ Checkout ═══════════════════════════════════════════════════════════════ */

/* Estado del checkout en curso. Recordsets: 1) cabecera del carrito, 2) líneas (los de
   SP_Carrito_ObtenerDetalle), 3) opciones de envío con el total de cada una.
   50011 si no hay reservas vigentes que cubran EXACTAMENTE el carrito. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerCheckout
    @IDUsuarioSesion INT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente';

    DECLARE @IDCarrito INT = (SELECT IDCarrito FROM dbo.Carritos WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1);
    IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.CarritoLineas WHERE IDCarrito = @IDCarrito)
        THROW 50010, N'Tu carrito está vacío.', 1;

    IF EXISTS (SELECT 1
                 FROM dbo.CarritoLineas AS cl
                 LEFT JOIN dbo.InventarioReservas AS r
                        ON r.IDCarrito = cl.IDCarrito AND r.IDVariante = cl.IDVariante
                       AND r.Estado = N'Activa' AND r.ExpiraEn > SYSUTCDATETIME() AND r.Cantidad = cl.Cantidad
                WHERE cl.IDCarrito = @IDCarrito AND r.IDReserva IS NULL)
        THROW 50011, N'No hay un checkout activo. Inicia el checkout de nuevo.', 1;

    EXEC dbo.SP_Carrito_ObtenerDetalle @IDCarrito;

    SELECT m.IDMetodoEnvio, m.Nombre, m.DiasEstimados, m.Costo,
           CAST(CASE WHEN m.MontoMinimo IS NULL OR t.Subtotal - t.Descuento >= m.MontoMinimo THEN 1 ELSE 0 END AS BIT) AS Aplica,
           CAST(t.Total + m.Costo AS DECIMAL(18, 2)) AS Total
    FROM dbo.MetodosEnvio AS m
    CROSS APPLY dbo.FU_Carrito_CalcularTotales(@IDCarrito) AS t
    WHERE m.Activo = 1
    ORDER BY m.Costo, m.IDMetodoEnvio;
END
GO

/* Reserva (15 min) la existencia de cada línea y congela su precio. Reiniciar es idempotente:
   libera las reservas previas del carrito. Si una línea no alcanza, no se reserva nada. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_IniciarCheckout
    @IDUsuarioSesion INT,
    @ReservaMinutos  INT = 15
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente';
        BEGIN TRAN;
            DECLARE @IDCarrito INT;
            SELECT @IDCarrito = IDCarrito FROM dbo.Carritos WITH (UPDLOCK)
             WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1;

            IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.CarritoLineas WHERE IDCarrito = @IDCarrito)
                THROW 50010, N'Tu carrito está vacío.', 1;

            EXEC dbo.SP_Inventario_LiberarReservasCarrito @IDCarrito;

            IF EXISTS (SELECT 1
                         FROM dbo.CarritoLineas AS cl
                         JOIN dbo.ProductoVariantes AS v ON v.IDVariante = cl.IDVariante
                         JOIN dbo.Productos AS p ON p.IDProducto = v.IDProducto
                         JOIN dbo.Categorias AS c ON c.IDCategoria = p.IDCategoria
                        WHERE cl.IDCarrito = @IDCarrito AND (v.Activo = 0 OR p.Activo = 0 OR c.Activo = 0))
                THROW 50003, N'Tu carrito tiene productos que ya no están disponibles. Elimínalos para continuar.', 1;

            DECLARE @ExpiraEn DATETIME2(3) = DATEADD(MINUTE, @ReservaMinutos, SYSUTCDATETIME());
            DECLARE @Lineas TABLE (IDVariante INT NOT NULL PRIMARY KEY, Cantidad INT NOT NULL);
            INSERT INTO @Lineas SELECT IDVariante, Cantidad FROM dbo.CarritoLineas WHERE IDCarrito = @IDCarrito;

            DECLARE @IDVariante INT, @Cantidad INT;
            -- Orden fijo por variante: dos checkouts concurrentes no se bloquean en ciclo.
            WHILE EXISTS (SELECT 1 FROM @Lineas)
            BEGIN
                SELECT TOP (1) @IDVariante = IDVariante, @Cantidad = Cantidad FROM @Lineas ORDER BY IDVariante;
                EXEC dbo.SP_Inventario_ReservarExistencia @IDVariante, @IDCarrito, @Cantidad, @ExpiraEn;
                DELETE FROM @Lineas WHERE IDVariante = @IDVariante;
            END

            UPDATE dbo.Carritos SET FechaActualizacion = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;

        EXEC dbo.SP_Pedidos_ObtenerCheckout @IDUsuarioSesion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CancelarCheckout
    @IDUsuarioSesion INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente';
        BEGIN TRAN;
            DECLARE @IDCarrito INT;
            SELECT @IDCarrito = IDCarrito FROM dbo.Carritos WITH (UPDLOCK)
             WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1;
            IF @IDCarrito IS NOT NULL
                EXEC dbo.SP_Inventario_LiberarReservasCarrito @IDCarrito;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/* ══ Lectura de pedidos ═════════════════════════════════════════════════════ */

/* Recordsets: 1) cabecera, 2) líneas con cantidad devuelta, 3) historial de estados,
   4) devoluciones, 5) líneas de devolución, 6) acciones permitidas, 7) transiciones manuales.
   Un cliente solo ve sus pedidos (50043); Operador/Administrador ven cualquiera. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerPorId
    @IDUsuarioSesion INT,
    @IDPedido        INT,
    @Reutilizado     BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Rol NVARCHAR(20);
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente,Operador,Administrador', @Rol OUTPUT;

    DECLARE @Dueno INT, @IDEstado INT;
    SELECT @Dueno = IDUsuario, @IDEstado = IDEstado FROM dbo.Pedidos WHERE IDPedido = @IDPedido;
    IF @Dueno IS NULL THROW 50044, N'El pedido no existe.', 1;
    IF @Rol = N'Cliente' AND @Dueno <> @IDUsuarioSesion THROW 50043, N'El pedido no te pertenece.', 1;

    SELECT p.IDPedido, p.NumeroPedido, p.FechaCreacion,
           e.Codigo AS EstadoCodigo, e.Nombre AS EstadoNombre,
           p.IDUsuario, u.Nombre AS ClienteNombre, u.Correo AS ClienteCorreo,
           p.DirDestinatario, p.DirLinea1, p.DirLinea2, p.DirCiudad, p.DirDepartamento, p.DirCodigoPostal, p.DirTelefono,
           p.MetodoEnvioNombre, p.CuponCodigo,
           p.Subtotal, p.Descuento, p.CostoEnvio, p.Total,
           ISNULL((SELECT SUM(d.MontoTotal) FROM dbo.Devoluciones AS d WHERE d.IDPedido = p.IDPedido), 0) AS MontoDevuelto,
           (SELECT SUM(pl.Cantidad) FROM dbo.PedidoLineas AS pl WHERE pl.IDPedido = p.IDPedido) AS CantidadItems,
           @Reutilizado AS Reutilizado
    FROM dbo.Pedidos AS p
    JOIN dbo.PedidoEstados AS e ON e.IDEstado = p.IDEstado
    JOIN dbo.Usuarios AS u ON u.IDUsuario = p.IDUsuario
    WHERE p.IDPedido = @IDPedido;

    SELECT pl.IDPedidoLinea, pl.SKU, pl.NombreProducto, pl.AtributosJson, pl.Cantidad,
           ISNULL(dv.Cantidad, 0) AS CantidadDevuelta,
           pl.PrecioUnitario, pl.DescuentoLinea, pl.TotalLinea
    FROM dbo.PedidoLineas AS pl
    OUTER APPLY (SELECT SUM(d.Cantidad) AS Cantidad FROM dbo.DevolucionLineas AS d
                  WHERE d.IDPedidoLinea = pl.IDPedidoLinea) AS dv
    WHERE pl.IDPedido = @IDPedido
    ORDER BY pl.IDPedidoLinea;

    SELECT EstadoAnteriorCodigo, EstadoAnteriorNombre, EstadoNuevoCodigo, EstadoNuevoNombre, Usuario, Nota, Fecha
    FROM dbo.VW_Pedidos_Historial WHERE IDPedido = @IDPedido
    ORDER BY Fecha, IDHistorial;

    SELECT d.IDDevolucion, d.Motivo, d.MontoTotal, d.Fecha, u.Nombre AS Usuario
    FROM dbo.Devoluciones AS d JOIN dbo.Usuarios AS u ON u.IDUsuario = d.IDUsuario
    WHERE d.IDPedido = @IDPedido ORDER BY d.Fecha, d.IDDevolucion;

    SELECT dl.IDDevolucion, dl.IDPedidoLinea, pl.SKU, dl.Cantidad, dl.MontoReembolso
    FROM dbo.DevolucionLineas AS dl
    JOIN dbo.Devoluciones AS d ON d.IDDevolucion = dl.IDDevolucion
    JOIN dbo.PedidoLineas AS pl ON pl.IDPedidoLinea = dl.IDPedidoLinea
    WHERE d.IDPedido = @IDPedido ORDER BY dl.IDDevolucion, dl.IDDevolucionLinea;

    SELECT CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.PedidoTransiciones AS t
                                   WHERE t.IDEstadoOrigen = @IDEstado AND t.Mecanismo = N'Cancelacion'
                                     AND (@Rol <> N'Cliente' OR t.PermiteCliente = 1)) THEN 1 ELSE 0 END AS BIT) AS PuedeCancelar,
           CAST(CASE WHEN @Rol IN (N'Operador', N'Administrador')
                      AND EXISTS (SELECT 1 FROM dbo.PedidoTransiciones AS t
                                   WHERE t.IDEstadoOrigen = @IDEstado AND t.Mecanismo = N'Devolucion') THEN 1 ELSE 0 END AS BIT) AS PuedeDevolver;

    SELECT d.Codigo, d.Nombre
    FROM dbo.PedidoTransiciones AS t
    JOIN dbo.PedidoEstados AS d ON d.IDEstado = t.IDEstadoDestino
    WHERE @Rol <> N'Cliente' AND t.IDEstadoOrigen = @IDEstado AND t.Mecanismo = N'Manual'
    ORDER BY d.Orden;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarPorUsuario
    @IDUsuarioSesion INT,
    @Estado          NVARCHAR(20) = NULL,
    @Desde           NVARCHAR(10) = NULL,      -- 'YYYY-MM-DD' hora de Guatemala
    @Hasta           NVARCHAR(10) = NULL,
    @Numero          NVARCHAR(30) = NULL,
    @OrdenarPor      NVARCHAR(20) = N'fecha',  -- fecha | total | numero | estado
    @Direccion       NVARCHAR(4)  = N'desc',
    @Pagina          INT          = 1,
    @TamanoPagina    INT          = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente';

    DECLARE @DesdeUtc DATETIME2(3) = DATEADD(HOUR, 6, TRY_CONVERT(DATETIME2(3), @Desde, 23));
    DECLARE @HastaUtc DATETIME2(3) = DATEADD(HOUR, 6, DATEADD(DAY, 1, TRY_CONVERT(DATETIME2(3), @Hasta, 23)));
    DECLARE @PatronNumero NVARCHAR(70) = CASE WHEN @Numero IS NULL OR LTRIM(RTRIM(@Numero)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(UPPER(LTRIM(RTRIM(@Numero))), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;

    SELECT p.IDPedido, p.NumeroPedido, p.FechaCreacion, e.Codigo AS EstadoCodigo, e.Nombre AS EstadoNombre,
           p.Total,
           (SELECT SUM(pl.Cantidad) FROM dbo.PedidoLineas AS pl WHERE pl.IDPedido = p.IDPedido) AS CantidadItems,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.Pedidos AS p
    JOIN dbo.PedidoEstados AS e ON e.IDEstado = p.IDEstado
    WHERE p.IDUsuario = @IDUsuarioSesion
      AND (@Estado IS NULL OR e.Codigo = @Estado)
      AND (@DesdeUtc IS NULL OR p.FechaCreacion >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR p.FechaCreacion < @HastaUtc)
      AND (@PatronNumero IS NULL OR p.NumeroPedido LIKE @PatronNumero)
    ORDER BY
        CASE WHEN @OrdenarPor = N'fecha'  AND @Direccion = N'asc'  THEN p.FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = N'fecha'  AND @Direccion = N'desc' THEN p.FechaCreacion END DESC,
        CASE WHEN @OrdenarPor = N'total'  AND @Direccion = N'asc'  THEN p.Total END ASC,
        CASE WHEN @OrdenarPor = N'total'  AND @Direccion = N'desc' THEN p.Total END DESC,
        CASE WHEN @OrdenarPor = N'numero' AND @Direccion = N'asc'  THEN p.NumeroPedido END ASC,
        CASE WHEN @OrdenarPor = N'numero' AND @Direccion = N'desc' THEN p.NumeroPedido END DESC,
        CASE WHEN @OrdenarPor = N'estado' AND @Direccion = N'asc'  THEN e.Orden END ASC,
        CASE WHEN @OrdenarPor = N'estado' AND @Direccion = N'desc' THEN e.Orden END DESC,
        p.IDPedido DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

-- Listado del operador y base del RF-08: filtros por estado, cliente y rango de fechas (en servidor).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarAdmin
    @IDUsuarioSesion INT,
    @Estado          NVARCHAR(20)  = NULL,
    @Desde           NVARCHAR(10)  = NULL,
    @Hasta           NVARCHAR(10)  = NULL,
    @Numero          NVARCHAR(30)  = NULL,
    @Cliente         NVARCHAR(100) = NULL,      -- nombre o correo
    @OrdenarPor      NVARCHAR(20)  = N'fecha',  -- fecha | total | numero | estado | cliente
    @Direccion       NVARCHAR(4)   = N'desc',
    @Pagina          INT           = 1,
    @TamanoPagina    INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';

    DECLARE @DesdeUtc DATETIME2(3) = DATEADD(HOUR, 6, TRY_CONVERT(DATETIME2(3), @Desde, 23));
    DECLARE @HastaUtc DATETIME2(3) = DATEADD(HOUR, 6, DATEADD(DAY, 1, TRY_CONVERT(DATETIME2(3), @Hasta, 23)));
    DECLARE @PatronNumero NVARCHAR(70) = CASE WHEN @Numero IS NULL OR LTRIM(RTRIM(@Numero)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(UPPER(LTRIM(RTRIM(@Numero))), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;
    DECLARE @PatronCliente NVARCHAR(210) = CASE WHEN @Cliente IS NULL OR LTRIM(RTRIM(@Cliente)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Cliente)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;

    SELECT p.IDPedido, p.NumeroPedido, p.FechaCreacion, e.Codigo AS EstadoCodigo, e.Nombre AS EstadoNombre,
           p.Total,
           (SELECT SUM(pl.Cantidad) FROM dbo.PedidoLineas AS pl WHERE pl.IDPedido = p.IDPedido) AS CantidadItems,
           p.IDUsuario, u.Nombre AS ClienteNombre, u.Correo AS ClienteCorreo,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.Pedidos AS p
    JOIN dbo.PedidoEstados AS e ON e.IDEstado = p.IDEstado
    JOIN dbo.Usuarios AS u ON u.IDUsuario = p.IDUsuario
    WHERE (@Estado IS NULL OR e.Codigo = @Estado)
      AND (@DesdeUtc IS NULL OR p.FechaCreacion >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR p.FechaCreacion < @HastaUtc)
      AND (@PatronNumero IS NULL OR p.NumeroPedido LIKE @PatronNumero)
      AND (@PatronCliente IS NULL OR u.Nombre LIKE @PatronCliente OR u.Correo LIKE @PatronCliente)
    ORDER BY
        CASE WHEN @OrdenarPor = N'fecha'   AND @Direccion = N'asc'  THEN p.FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = N'fecha'   AND @Direccion = N'desc' THEN p.FechaCreacion END DESC,
        CASE WHEN @OrdenarPor = N'total'   AND @Direccion = N'asc'  THEN p.Total END ASC,
        CASE WHEN @OrdenarPor = N'total'   AND @Direccion = N'desc' THEN p.Total END DESC,
        CASE WHEN @OrdenarPor = N'numero'  AND @Direccion = N'asc'  THEN p.NumeroPedido END ASC,
        CASE WHEN @OrdenarPor = N'numero'  AND @Direccion = N'desc' THEN p.NumeroPedido END DESC,
        CASE WHEN @OrdenarPor = N'estado'  AND @Direccion = N'asc'  THEN e.Orden END ASC,
        CASE WHEN @OrdenarPor = N'estado'  AND @Direccion = N'desc' THEN e.Orden END DESC,
        CASE WHEN @OrdenarPor = N'cliente' AND @Direccion = N'asc'  THEN u.Nombre END ASC,
        CASE WHEN @OrdenarPor = N'cliente' AND @Direccion = N'desc' THEN u.Nombre END DESC,
        p.IDPedido DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

/* ══ Crear pedido (pago simulado, atómico e idempotente) ════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CrearPedido
    @IDUsuarioSesion    INT,
    @IDDireccion        INT,
    @IDMetodoEnvio      INT,
    @TotalEsperado      DECIMAL(18, 2),
    @LlaveIdempotencia  UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDPedido INT;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente';

        BEGIN TRAN;
            -- 1. Idempotencia: el bloqueo de rango sobre (IDUsuario, Llave) hace que dos solicitudes
            --    simultáneas con la misma llave se serialicen; la segunda encuentra el pedido de la primera.
            SELECT @IDPedido = IDPedido FROM dbo.Pedidos WITH (UPDLOCK, HOLDLOCK)
             WHERE IDUsuario = @IDUsuarioSesion AND LlaveIdempotencia = @LlaveIdempotencia;
            IF @IDPedido IS NOT NULL
            BEGIN
                COMMIT;
                EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSesion, @IDPedido, 1;
                RETURN;
            END

            -- 2. Carrito del usuario.
            DECLARE @IDCarrito INT, @IDCupon INT;
            SELECT @IDCarrito = IDCarrito, @IDCupon = IDCupon FROM dbo.Carritos WITH (UPDLOCK)
             WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1;
            IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.CarritoLineas WHERE IDCarrito = @IDCarrito)
                THROW 50010, N'Tu carrito está vacío.', 1;

            -- 3. Dirección: existe, activa y del usuario.
            DECLARE @DuenoDir INT, @DirActiva BIT;
            SELECT @DuenoDir = IDUsuario, @DirActiva = Activo FROM dbo.Direcciones WHERE IDDireccion = @IDDireccion;
            IF @DuenoDir IS NULL OR @DirActiva = 0 THROW 50035, N'La dirección seleccionada no existe.', 1;
            IF @DuenoDir <> @IDUsuarioSesion THROW 50043, N'La dirección no te pertenece.', 1;

            -- 4. Método de envío.
            DECLARE @CostoEnvio DECIMAL(18, 2), @MinimoEnvio DECIMAL(18, 2), @NombreEnvio NVARCHAR(50);
            SELECT @CostoEnvio = Costo, @MinimoEnvio = MontoMinimo, @NombreEnvio = Nombre
            FROM dbo.MetodosEnvio WHERE IDMetodoEnvio = @IDMetodoEnvio AND Activo = 1;
            IF @NombreEnvio IS NULL THROW 50034, N'El método de envío no está disponible.', 1;

            -- 5. Las reservas vigentes deben cubrir exactamente las líneas del carrito.
            IF EXISTS (SELECT 1
                         FROM dbo.CarritoLineas AS cl
                         LEFT JOIN dbo.InventarioReservas AS r
                                ON r.IDCarrito = cl.IDCarrito AND r.IDVariante = cl.IDVariante
                               AND r.Estado = N'Activa' AND r.ExpiraEn > SYSUTCDATETIME() AND r.Cantidad = cl.Cantidad
                        WHERE cl.IDCarrito = @IDCarrito AND r.IDReserva IS NULL)
            BEGIN
                IF EXISTS (SELECT 1 FROM dbo.InventarioReservas
                            WHERE IDCarrito = @IDCarrito
                              AND (Estado = N'Expirada' OR (Estado = N'Activa' AND ExpiraEn <= SYSUTCDATETIME())))
                    THROW 50002, N'Tu reserva venció. Reinicia el checkout para continuar.', 1;
                THROW 50011, N'No hay un checkout activo. Inicia el checkout de nuevo.', 1;
            END

            -- 6. Cupón: se bloquea su fila ANTES de contar usos, así dos pagos simultáneos se serializan.
            --    El uso se descuenta recién en el paso 7b: si se incrementara antes de calcular los montos,
            --    el último uso permitido haría que la función viera el cupón como agotado.
            DECLARE @CatCupon INT = NULL, @CodigoCupon NVARCHAR(30) = NULL;
            IF @IDCupon IS NOT NULL
            BEGIN
                SELECT @CatCupon = IDCategoria, @CodigoCupon = Codigo
                FROM dbo.Cupones WITH (UPDLOCK, HOLDLOCK) WHERE IDCupon = @IDCupon;

                EXEC dbo.SP_Cupones_ValidarParaCarrito @IDCupon, @IDCarrito;
            END

            -- 7. Montos (precios de la reserva) y verificación contra lo que vio el cliente.
            DECLARE @Subtotal DECIMAL(18, 2), @Descuento DECIMAL(18, 2);
            SELECT @Subtotal = Subtotal, @Descuento = Descuento FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito);

            IF @MinimoEnvio IS NOT NULL AND @Subtotal - @Descuento < @MinimoEnvio
                THROW 50034, N'El método de envío no aplica al monto de esta compra.', 1;

            DECLARE @Total DECIMAL(18, 2) = @Subtotal - @Descuento + @CostoEnvio;
            IF @Total <> @TotalEsperado
                THROW 50013, N'El total cambió. Revisa tu compra antes de pagar.', 1;

            -- 7b. Consumo del uso del cupón (la fila sigue bloqueada desde el paso 6).
            IF @IDCupon IS NOT NULL
            BEGIN
                UPDATE dbo.Cupones SET UsosTotalesActual = UsosTotalesActual + 1
                 WHERE IDCupon = @IDCupon AND Activo = 1 AND UsosTotalesActual < UsosTotalesMax;
                IF @@ROWCOUNT = 0 THROW 50023, N'El cupón ya alcanzó su límite de usos.', 1;
            END

            -- 8. Encabezado del pedido (dirección y envío congelados).
            DECLARE @IDEstadoPagado INT = (SELECT IDEstado FROM dbo.PedidoEstados WHERE Codigo = N'Pagado');
            DECLARE @Secuencia INT = NEXT VALUE FOR dbo.Seq_NumeroPedido;
            DECLARE @Numero NVARCHAR(30) = N'SC-' + CONVERT(CHAR(8), DATEADD(HOUR, -6, SYSUTCDATETIME()), 112)
                + N'-' + RIGHT(N'000000' + CAST(@Secuencia AS NVARCHAR(10)), 6);

            INSERT INTO dbo.Pedidos
                (NumeroPedido, IDUsuario, IDEstado, IDDireccion,
                 DirDestinatario, DirLinea1, DirLinea2, DirCiudad, DirDepartamento, DirCodigoPostal, DirTelefono,
                 IDMetodoEnvio, MetodoEnvioNombre, IDCupon, CuponCodigo,
                 Subtotal, Descuento, CostoEnvio, Total, LlaveIdempotencia)
            SELECT @Numero, @IDUsuarioSesion, @IDEstadoPagado, d.IDDireccion,
                   d.Destinatario, d.Linea1, d.Linea2, d.Ciudad, d.Departamento, d.CodigoPostal, d.Telefono,
                   @IDMetodoEnvio, @NombreEnvio, @IDCupon, @CodigoCupon,
                   @Subtotal, @Descuento, @CostoEnvio, @Total, @LlaveIdempotencia
            FROM dbo.Direcciones AS d WHERE d.IDDireccion = @IDDireccion;
            SET @IDPedido = SCOPE_IDENTITY();

            -- 9. Líneas con precio congelado y descuento prorrateado entre las líneas elegibles.
            DECLARE @L TABLE (IDVariante INT PRIMARY KEY, IDCategoria INT, SKU NVARCHAR(50), Nombre NVARCHAR(150),
                              Atributos NVARCHAR(1000), Cantidad INT, Precio DECIMAL(18, 2), Monto DECIMAL(18, 2),
                              Elegible BIT, DescuentoLinea DECIMAL(18, 2));
            INSERT INTO @L (IDVariante, IDCategoria, SKU, Nombre, Atributos, Cantidad, Precio, Monto, Elegible, DescuentoLinea)
            SELECT cl.IDVariante, pr.IDCategoria, v.SKU, pr.Nombre, v.AtributosJson, cl.Cantidad, pv.PrecioUnitario,
                   CAST(cl.Cantidad * pv.PrecioUnitario AS DECIMAL(18, 2)),
                   CAST(CASE WHEN @IDCupon IS NOT NULL AND (@CatCupon IS NULL OR pr.IDCategoria = @CatCupon) THEN 1 ELSE 0 END AS BIT),
                   0
            FROM dbo.CarritoLineas AS cl
            JOIN dbo.FU_Catalogo_PrecioVigente(@IDCarrito) AS pv ON pv.IDCarritoLinea = cl.IDCarritoLinea
            JOIN dbo.ProductoVariantes AS v ON v.IDVariante = cl.IDVariante
            JOIN dbo.Productos AS pr ON pr.IDProducto = v.IDProducto
            WHERE cl.IDCarrito = @IDCarrito;

            IF @Descuento > 0
            BEGIN
                DECLARE @Elegible DECIMAL(18, 2) = (SELECT SUM(Monto) FROM @L WHERE Elegible = 1);
                UPDATE @L SET DescuentoLinea = ROUND(@Descuento * Monto / @Elegible, 2) WHERE Elegible = 1;

                -- El residuo de centavos va a la línea elegible de mayor monto: Σ descuentos = descuento del pedido.
                DECLARE @Residuo DECIMAL(18, 2) = @Descuento - (SELECT SUM(DescuentoLinea) FROM @L);
                IF @Residuo <> 0
                    UPDATE @L SET DescuentoLinea = DescuentoLinea + @Residuo
                     WHERE IDVariante = (SELECT TOP (1) IDVariante FROM @L WHERE Elegible = 1 ORDER BY Monto DESC, IDVariante);
            END

            INSERT INTO dbo.PedidoLineas (IDPedido, IDVariante, IDCategoria, SKU, NombreProducto, AtributosJson,
                                          Cantidad, PrecioUnitario, DescuentoLinea, TotalLinea)
            SELECT @IDPedido, IDVariante, IDCategoria, SKU, Nombre, Atributos, Cantidad, Precio, DescuentoLinea,
                   Monto - DescuentoLinea
            FROM @L;

            -- 10. Reservas → ventas (kardex Venta, baja existencia física y reservada).
            EXEC dbo.SP_Inventario_ConsumirReservas @IDCarrito, @IDPedido, @IDUsuarioSesion, @Numero;

            -- 11. Uso del cupón.
            IF @IDCupon IS NOT NULL
                INSERT INTO dbo.CuponUsos (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon, @IDUsuarioSesion, @IDPedido);

            -- 12. Historial y bitácora.
            INSERT INTO dbo.PedidoEstadoHistorial (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Nota)
            VALUES (@IDPedido, NULL, @IDEstadoPagado, @IDUsuarioSesion, N'Pago confirmado (simulado)');

            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT @Numero AS numeroPedido, N'Pagado' AS estado, @Total AS total,
                                                   @CodigoCupon AS cupon FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Pedidos', N'Pedido', @IDPedido, N'Alta', NULL, @Nuevo;

            -- 13. El carrito se cierra.
            UPDATE dbo.Carritos SET Activo = 0, FechaActualizacion = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;

        EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSesion, @IDPedido, 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/* ══ Ciclo de vida ══════════════════════════════════════════════════════════ */

-- Avance manual de estado (Operador/Administrador). Solo aristas de mecanismo 'Manual'.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CambiarEstado
    @IDUsuarioSesion INT,
    @IDPedido        INT,
    @Estado          NVARCHAR(20),
    @Nota            NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';
        BEGIN TRAN;
            DECLARE @IDEstadoActual INT, @CodigoActual NVARCHAR(20);
            SELECT @IDEstadoActual = p.IDEstado, @CodigoActual = e.Codigo
            FROM dbo.Pedidos AS p WITH (UPDLOCK) JOIN dbo.PedidoEstados AS e ON e.IDEstado = p.IDEstado
            WHERE p.IDPedido = @IDPedido;
            IF @IDEstadoActual IS NULL THROW 50044, N'El pedido no existe.', 1;

            DECLARE @IDDestino INT = (SELECT IDEstado FROM dbo.PedidoEstados WHERE Codigo = @Estado);
            IF @IDDestino IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.PedidoTransiciones
                                                  WHERE IDEstadoOrigen = @IDEstadoActual AND IDEstadoDestino = @IDDestino
                                                    AND Mecanismo = N'Manual')
            BEGIN
                DECLARE @Msg NVARCHAR(200) = N'Transición de estado no permitida: ' + @CodigoActual + N' → ' + ISNULL(@Estado, N'?') + N'.';
                THROW 50030, @Msg, 1;
            END

            UPDATE dbo.Pedidos SET IDEstado = @IDDestino, FechaActualizacion = SYSUTCDATETIME() WHERE IDPedido = @IDPedido;
            INSERT INTO dbo.PedidoEstadoHistorial (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Nota)
            VALUES (@IDPedido, @IDEstadoActual, @IDDestino, @IDUsuarioSesion, @Nota);

            DECLARE @Ant NVARCHAR(MAX) = (SELECT @CodigoActual AS estado FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT @Estado AS estado, @Nota AS nota FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Pedidos', N'Pedido', @IDPedido, N'Transicion', @Ant, @Nuevo;
        COMMIT;

        EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSesion, @IDPedido, 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Cancelación antes del despacho: reintegra la existencia (kardex Cancelacion) y deja historial.
-- No se reintegra el uso del cupón (decisión documentada).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Cancelar
    @IDUsuarioSesion INT,
    @IDPedido        INT,
    @Motivo          NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @Rol NVARCHAR(20);
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente,Operador,Administrador', @Rol OUTPUT;
        IF LEN(LTRIM(RTRIM(ISNULL(@Motivo, N'')))) = 0 THROW 50099, N'El motivo de la cancelación es obligatorio.', 1;

        BEGIN TRAN;
            DECLARE @Dueno INT, @IDEstadoActual INT, @CodigoActual NVARCHAR(20), @Numero NVARCHAR(30);
            SELECT @Dueno = p.IDUsuario, @IDEstadoActual = p.IDEstado, @CodigoActual = e.Codigo, @Numero = p.NumeroPedido
            FROM dbo.Pedidos AS p WITH (UPDLOCK) JOIN dbo.PedidoEstados AS e ON e.IDEstado = p.IDEstado
            WHERE p.IDPedido = @IDPedido;

            IF @Dueno IS NULL THROW 50044, N'El pedido no existe.', 1;
            IF @Rol = N'Cliente' AND @Dueno <> @IDUsuarioSesion THROW 50043, N'El pedido no te pertenece.', 1;

            DECLARE @IDCancelado INT = (SELECT IDEstado FROM dbo.PedidoEstados WHERE Codigo = N'Cancelado');
            IF NOT EXISTS (SELECT 1 FROM dbo.PedidoTransiciones
                            WHERE IDEstadoOrigen = @IDEstadoActual AND IDEstadoDestino = @IDCancelado
                              AND Mecanismo = N'Cancelacion' AND (@Rol <> N'Cliente' OR PermiteCliente = 1))
            BEGIN
                DECLARE @Msg NVARCHAR(200) = N'El pedido no puede cancelarse en estado ' + @CodigoActual + N'.';
                THROW 50031, @Msg, 1;
            END

            DECLARE @Lineas TABLE (IDVariante INT NOT NULL PRIMARY KEY, Cantidad INT NOT NULL);
            INSERT INTO @Lineas SELECT IDVariante, SUM(Cantidad) FROM dbo.PedidoLineas WHERE IDPedido = @IDPedido GROUP BY IDVariante;

            DECLARE @IDVariante INT, @Cantidad INT, @MotivoKardex NVARCHAR(200) = N'Cancelación pedido ' + @Numero;
            WHILE EXISTS (SELECT 1 FROM @Lineas)
            BEGIN
                SELECT TOP (1) @IDVariante = IDVariante, @Cantidad = Cantidad FROM @Lineas ORDER BY IDVariante;
                EXEC dbo.SP_Inventario_ReintegrarExistencia @IDVariante, @Cantidad, N'Cancelacion', @MotivoKardex,
                     @IDUsuarioSesion, @IDPedido, NULL;
                DELETE FROM @Lineas WHERE IDVariante = @IDVariante;
            END

            UPDATE dbo.Pedidos SET IDEstado = @IDCancelado, FechaActualizacion = SYSUTCDATETIME() WHERE IDPedido = @IDPedido;
            INSERT INTO dbo.PedidoEstadoHistorial (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Nota)
            VALUES (@IDPedido, @IDEstadoActual, @IDCancelado, @IDUsuarioSesion, @Motivo);

            DECLARE @Ant NVARCHAR(MAX) = (SELECT @CodigoActual AS estado FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT N'Cancelado' AS estado, @Motivo AS motivo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Pedidos', N'Pedido', @IDPedido, N'Transicion', @Ant, @Nuevo;
        COMMIT;

        EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSesion, @IDPedido, 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/* Devolución total o parcial por línea (Operador/Administrador). @LineasJson = [{"idPedidoLinea":1,"cantidad":2}].
   Reembolso proporcional al TotalLinea (incluye el descuento prorrateado); la última unidad de una línea
   cierra la diferencia para que Σ reembolsos = TotalLinea al centavo. El envío no se reembolsa. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CrearDevolucion
    @IDUsuarioSesion INT,
    @IDPedido        INT,
    @Motivo          NVARCHAR(500),
    @LineasJson      NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Operador,Administrador';
        IF LEN(LTRIM(RTRIM(ISNULL(@Motivo, N'')))) = 0 THROW 50099, N'El motivo de la devolución es obligatorio.', 1;
        IF ISJSON(@LineasJson) <> 1 THROW 50099, N'Las líneas de la devolución no son válidas.', 1;

        BEGIN TRAN;
            DECLARE @IDEstadoActual INT, @CodigoActual NVARCHAR(20), @Numero NVARCHAR(30);
            SELECT @IDEstadoActual = p.IDEstado, @CodigoActual = e.Codigo, @Numero = p.NumeroPedido
            FROM dbo.Pedidos AS p WITH (UPDLOCK) JOIN dbo.PedidoEstados AS e ON e.IDEstado = p.IDEstado
            WHERE p.IDPedido = @IDPedido;
            IF @IDEstadoActual IS NULL THROW 50044, N'El pedido no existe.', 1;

            IF NOT EXISTS (SELECT 1 FROM dbo.PedidoTransiciones WHERE IDEstadoOrigen = @IDEstadoActual AND Mecanismo = N'Devolucion')
                THROW 50033, N'Este pedido no admite devoluciones en su estado actual.', 1;

            DECLARE @Req TABLE (IDPedidoLinea INT NOT NULL PRIMARY KEY, Cantidad INT NOT NULL);
            INSERT INTO @Req (IDPedidoLinea, Cantidad)
            SELECT IDPedidoLinea, SUM(Cantidad)
            FROM OPENJSON(@LineasJson) WITH (IDPedidoLinea INT '$.idPedidoLinea', Cantidad INT '$.cantidad')
            WHERE IDPedidoLinea IS NOT NULL AND Cantidad IS NOT NULL
            GROUP BY IDPedidoLinea;

            IF NOT EXISTS (SELECT 1 FROM @Req) OR EXISTS (SELECT 1 FROM @Req WHERE Cantidad <= 0)
                THROW 50099, N'Indica al menos una línea con cantidad mayor que cero.', 1;
            IF EXISTS (SELECT 1 FROM @Req AS r
                        LEFT JOIN dbo.PedidoLineas AS pl ON pl.IDPedidoLinea = r.IDPedidoLinea AND pl.IDPedido = @IDPedido
                       WHERE pl.IDPedidoLinea IS NULL)
                THROW 50044, N'Una de las líneas no pertenece al pedido.', 1;

            DECLARE @Calc TABLE (IDPedidoLinea INT NOT NULL PRIMARY KEY, IDVariante INT NOT NULL, Cantidad INT NOT NULL,
                                 Restante INT NOT NULL, Monto DECIMAL(18, 2) NOT NULL);
            INSERT INTO @Calc (IDPedidoLinea, IDVariante, Cantidad, Restante, Monto)
            SELECT pl.IDPedidoLinea, pl.IDVariante, r.Cantidad,
                   pl.Cantidad - ISNULL(d.Cantidad, 0),
                   CAST(CASE WHEN r.Cantidad + ISNULL(d.Cantidad, 0) = pl.Cantidad
                             THEN pl.TotalLinea - ISNULL(d.Monto, 0)
                             ELSE ROUND(pl.TotalLinea * r.Cantidad / pl.Cantidad, 2) END AS DECIMAL(18, 2))
            FROM @Req AS r
            JOIN dbo.PedidoLineas AS pl ON pl.IDPedidoLinea = r.IDPedidoLinea
            OUTER APPLY (SELECT SUM(x.Cantidad) AS Cantidad, SUM(x.MontoReembolso) AS Monto
                           FROM dbo.DevolucionLineas AS x WHERE x.IDPedidoLinea = pl.IDPedidoLinea) AS d;

            IF EXISTS (SELECT 1 FROM @Calc WHERE Cantidad > Restante)
                THROW 50032, N'No se puede devolver más cantidad de la vendida en una línea del pedido.', 1;

            DECLARE @IDDevolucion INT;
            INSERT INTO dbo.Devoluciones (IDPedido, IDUsuario, Motivo, MontoTotal)
            VALUES (@IDPedido, @IDUsuarioSesion, @Motivo, (SELECT SUM(Monto) FROM @Calc));
            SET @IDDevolucion = SCOPE_IDENTITY();

            INSERT INTO dbo.DevolucionLineas (IDDevolucion, IDPedidoLinea, Cantidad, MontoReembolso)
            SELECT @IDDevolucion, IDPedidoLinea, Cantidad, Monto FROM @Calc;

            -- Reintegro de existencia (kardex Devolucion), en orden por variante.
            DECLARE @Stock TABLE (IDVariante INT NOT NULL PRIMARY KEY, Cantidad INT NOT NULL);
            INSERT INTO @Stock SELECT IDVariante, SUM(Cantidad) FROM @Calc GROUP BY IDVariante;
            DECLARE @IDVariante INT, @Cantidad INT, @MotivoKardex NVARCHAR(200) = N'Devolución pedido ' + @Numero;
            WHILE EXISTS (SELECT 1 FROM @Stock)
            BEGIN
                SELECT TOP (1) @IDVariante = IDVariante, @Cantidad = Cantidad FROM @Stock ORDER BY IDVariante;
                EXEC dbo.SP_Inventario_ReintegrarExistencia @IDVariante, @Cantidad, N'Devolucion', @MotivoKardex,
                     @IDUsuarioSesion, @IDPedido, @IDDevolucion;
                DELETE FROM @Stock WHERE IDVariante = @IDVariante;
            END

            -- ¿Queda algo por devolver? Define el nuevo estado.
            DECLARE @CodigoNuevo NVARCHAR(20) = CASE WHEN EXISTS (
                SELECT 1 FROM dbo.PedidoLineas AS pl
                 WHERE pl.IDPedido = @IDPedido
                   AND pl.Cantidad > ISNULL((SELECT SUM(x.Cantidad) FROM dbo.DevolucionLineas AS x
                                              WHERE x.IDPedidoLinea = pl.IDPedidoLinea), 0))
                THEN N'DevueltoParcial' ELSE N'DevueltoTotal' END;
            DECLARE @IDNuevo INT = (SELECT IDEstado FROM dbo.PedidoEstados WHERE Codigo = @CodigoNuevo);

            IF NOT EXISTS (SELECT 1 FROM dbo.PedidoTransiciones
                            WHERE IDEstadoOrigen = @IDEstadoActual AND IDEstadoDestino = @IDNuevo AND Mecanismo = N'Devolucion')
            BEGIN
                DECLARE @Msg NVARCHAR(200) = N'Transición de estado no permitida: ' + @CodigoActual + N' → ' + @CodigoNuevo + N'.';
                THROW 50030, @Msg, 1;
            END

            UPDATE dbo.Pedidos SET IDEstado = @IDNuevo, FechaActualizacion = SYSUTCDATETIME() WHERE IDPedido = @IDPedido;
            INSERT INTO dbo.PedidoEstadoHistorial (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Nota)
            VALUES (@IDPedido, @IDEstadoActual, @IDNuevo, @IDUsuarioSesion, @Motivo);

            DECLARE @NuevaDev NVARCHAR(MAX) = (SELECT @IDPedido AS idPedido, MontoTotal AS montoTotal, Motivo AS motivo
                                               FROM dbo.Devoluciones WHERE IDDevolucion = @IDDevolucion
                                               FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Pedidos', N'Devolucion', @IDDevolucion, N'Alta', NULL, @NuevaDev;

            DECLARE @Ant NVARCHAR(MAX) = (SELECT @CodigoActual AS estado FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            DECLARE @Nuevo NVARCHAR(MAX) = (SELECT @CodigoNuevo AS estado, @Motivo AS motivo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Pedidos', N'Pedido', @IDPedido, N'Transicion', @Ant, @Nuevo;
        COMMIT;

        EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSesion, @IDPedido, 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
