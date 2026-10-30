/* =============================================================================
   008_sp_reports_audit.sql — Dashboard (RF-08) y consulta de bitácora (RF-09).
   Todas las cifras salen de VW_Dashboard_LineasNetas: solo pedidos con CuentaComoVenta=1,
   restando devoluciones por línea. «Ventas netas» = productos (el envío no es venta de producto).
   Las devoluciones se atribuyen a la fecha del pedido original. Fechas: YYYY-MM-DD hora de Guatemala.
   Sin @Desde/@Hasta: últimos 30 días hasta hoy (hora local).
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Resuelve el rango local [Desde, Hasta] (inclusivo) con valores por defecto y validación.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_ResolverRango
    @Desde      NVARCHAR(10),
    @Hasta      NVARCHAR(10),
    @DesdeFecha DATE OUTPUT,
    @HastaFecha DATE OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hoy DATE = CAST(DATEADD(HOUR, -6, SYSUTCDATETIME()) AS DATE);
    SET @HastaFecha = ISNULL(TRY_CONVERT(DATE, @Hasta, 23), @Hoy);
    SET @DesdeFecha = ISNULL(TRY_CONVERT(DATE, @Desde, 23), DATEADD(DAY, -29, @HastaFecha));
    IF (@Desde IS NOT NULL AND TRY_CONVERT(DATE, @Desde, 23) IS NULL)
       OR (@Hasta IS NOT NULL AND TRY_CONVERT(DATE, @Hasta, 23) IS NULL)
        THROW 50099, N'Las fechas deben tener formato YYYY-MM-DD.', 1;
    IF @DesdeFecha > @HastaFecha THROW 50099, N'La fecha inicial no puede ser posterior a la final.', 1;
    IF DATEDIFF(DAY, @DesdeFecha, @HastaFecha) > 731 THROW 50099, N'El rango máximo es de 2 años.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Reportes_Kpis
    @IDUsuarioSesion INT,
    @Desde           NVARCHAR(10) = NULL,
    @Hasta           NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
    DECLARE @D DATE, @H DATE;
    EXEC dbo.SP_Reportes_ResolverRango @Desde, @Hasta, @D OUTPUT, @H OUTPUT;

    SELECT CAST(ISNULL(SUM(MontoNeto), 0) AS DECIMAL(18, 2)) AS VentasNetas,
           COUNT(DISTINCT CASE WHEN CantidadNeta > 0 THEN IDPedido END) AS Pedidos,
           CAST(ISNULL(SUM(MontoNeto) / NULLIF(COUNT(DISTINCT CASE WHEN CantidadNeta > 0 THEN IDPedido END), 0), 0)
                AS DECIMAL(18, 2)) AS TicketPromedio,
           ISNULL(SUM(CantidadNeta), 0) AS Unidades,
           CAST(ISNULL(SUM(MontoDevuelto), 0) AS DECIMAL(18, 2)) AS MontoDevuelto,
           @D AS Desde, @H AS Hasta
    FROM dbo.VW_Dashboard_LineasNetas
    WHERE FechaLocal BETWEEN @D AND @H;
END
GO

-- Serie por día/semana (ISO, inicia lunes)/mes con períodos sin ventas en 0.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorPeriodo
    @IDUsuarioSesion INT,
    @Desde           NVARCHAR(10) = NULL,
    @Hasta           NVARCHAR(10) = NULL,
    @Agrupacion      NVARCHAR(6)  = N'dia'    -- dia | semana | mes
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
    IF @Agrupacion NOT IN (N'dia', N'semana', N'mes') THROW 50099, N'Agrupación no válida (dia, semana, mes).', 1;
    DECLARE @D DATE, @H DATE;
    EXEC dbo.SP_Reportes_ResolverRango @Desde, @Hasta, @D OUTPUT, @H OUTPUT;

    ;WITH Dias AS (
        SELECT TOP (DATEDIFF(DAY, @D, @H) + 1)
               DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @D) AS Dia
        FROM sys.all_objects AS a CROSS JOIN sys.all_objects AS b
    ),
    Periodos AS (
        SELECT DISTINCT
               CASE @Agrupacion
                   WHEN N'dia'    THEN Dia
                   WHEN N'semana' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', Dia) % 7), Dia)
                   ELSE DATEFROMPARTS(YEAR(Dia), MONTH(Dia), 1)
               END AS Periodo
        FROM Dias
    ),
    Ventas AS (
        SELECT CASE @Agrupacion
                   WHEN N'dia'    THEN FechaLocal
                   WHEN N'semana' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', FechaLocal) % 7), FechaLocal)
                   ELSE DATEFROMPARTS(YEAR(FechaLocal), MONTH(FechaLocal), 1)
               END AS Periodo,
               SUM(MontoNeto) AS VentasNetas,
               COUNT(DISTINCT CASE WHEN CantidadNeta > 0 THEN IDPedido END) AS Pedidos
        FROM dbo.VW_Dashboard_LineasNetas
        WHERE FechaLocal BETWEEN @D AND @H
        GROUP BY CASE @Agrupacion
                     WHEN N'dia'    THEN FechaLocal
                     WHEN N'semana' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', FechaLocal) % 7), FechaLocal)
                     ELSE DATEFROMPARTS(YEAR(FechaLocal), MONTH(FechaLocal), 1)
                 END
    )
    SELECT CONVERT(CHAR(10), p.Periodo, 23) AS Periodo,
           CAST(ISNULL(v.VentasNetas, 0) AS DECIMAL(18, 2)) AS VentasNetas,
           ISNULL(v.Pedidos, 0) AS Pedidos
    FROM Periodos AS p LEFT JOIN Ventas AS v ON v.Periodo = p.Periodo
    ORDER BY p.Periodo;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorCategoria
    @IDUsuarioSesion INT,
    @Desde           NVARCHAR(10) = NULL,
    @Hasta           NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
    DECLARE @D DATE, @H DATE;
    EXEC dbo.SP_Reportes_ResolverRango @Desde, @Hasta, @D OUTPUT, @H OUTPUT;

    -- Unidades y ventas vienen de la vista agregada; los pedidos distintos, de la base por línea.
    SELECT c.IDCategoria, c.Categoria,
           CAST(c.VentasNetas AS DECIMAL(18, 2)) AS VentasNetas, c.Unidades, p.Pedidos
    FROM (SELECT IDCategoria, Categoria, SUM(VentasNetas) AS VentasNetas, SUM(Unidades) AS Unidades
            FROM dbo.VW_Dashboard_VentasPorCategoria
           WHERE FechaLocal BETWEEN @D AND @H
           GROUP BY IDCategoria, Categoria) AS c
    CROSS APPLY (SELECT COUNT(DISTINCT l.IDPedido) AS Pedidos FROM dbo.VW_Dashboard_LineasNetas AS l
                  WHERE l.IDCategoria = c.IDCategoria AND l.FechaLocal BETWEEN @D AND @H AND l.CantidadNeta > 0) AS p
    WHERE c.Unidades > 0
    ORDER BY c.VentasNetas DESC, c.Categoria;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Reportes_TopProductos
    @IDUsuarioSesion INT,
    @Desde           NVARCHAR(10) = NULL,
    @Hasta           NVARCHAR(10) = NULL,
    @Limite          INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
    IF @Limite < 1 OR @Limite > 50 THROW 50099, N'El límite debe estar entre 1 y 50.', 1;
    DECLARE @D DATE, @H DATE;
    EXEC dbo.SP_Reportes_ResolverRango @Desde, @Hasta, @D OUTPUT, @H OUTPUT;

    SELECT TOP (@Limite)
           l.IDProducto, p.Nombre AS Producto,
           SUM(l.CantidadNeta) AS Unidades,
           CAST(SUM(l.MontoNeto) AS DECIMAL(18, 2)) AS VentasNetas
    FROM dbo.VW_Dashboard_LineasNetas AS l
    JOIN dbo.Productos AS p ON p.IDProducto = l.IDProducto
    WHERE l.FechaLocal BETWEEN @D AND @H
    GROUP BY l.IDProducto, p.Nombre
    HAVING SUM(l.CantidadNeta) > 0
    ORDER BY SUM(l.CantidadNeta) DESC, SUM(l.MontoNeto) DESC, p.Nombre;
END
GO

-- Carritos activos con líneas y sin actividad hace más de @Minutos (invitados incluidos).
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_CarritosAbandonados
    @IDUsuarioSesion INT,
    @Minutos         INT = 60,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    SELECT c.IDCarrito, u.Nombre AS Cliente, u.Correo AS CorreoCliente,
           x.Items, x.Subtotal, c.FechaActualizacion AS UltimaActividad,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.Carritos AS c
    LEFT JOIN dbo.Usuarios AS u ON u.IDUsuario = c.IDUsuario
    CROSS APPLY (SELECT SUM(cl.Cantidad) AS Items,
                        CAST(SUM(cl.Cantidad * pv.PrecioUnitario) AS DECIMAL(18, 2)) AS Subtotal
                   FROM dbo.CarritoLineas AS cl
                   JOIN dbo.FU_Catalogo_PrecioVigente(c.IDCarrito) AS pv ON pv.IDCarritoLinea = cl.IDCarritoLinea
                  WHERE cl.IDCarrito = c.IDCarrito) AS x
    WHERE c.Activo = 1 AND x.Items > 0
      AND c.FechaActualizacion < DATEADD(MINUTE, -@Minutos, SYSUTCDATETIME())
    ORDER BY c.FechaActualizacion DESC, c.IDCarrito
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Listar
    @IDUsuarioSesion INT,
    @Modulo          NVARCHAR(30) = NULL,
    @Entidad         NVARCHAR(50) = NULL,
    @IDUsuario       INT          = NULL,
    @Accion          NVARCHAR(12) = NULL,
    @Desde           NVARCHAR(10) = NULL,
    @Hasta           NVARCHAR(10) = NULL,
    @Pagina          INT          = 1,
    @TamanoPagina    INT          = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    DECLARE @DesdeUtc DATETIME2(3) = DATEADD(HOUR, 6, TRY_CONVERT(DATETIME2(3), @Desde, 23));
    DECLARE @HastaUtc DATETIME2(3) = DATEADD(HOUR, 6, DATEADD(DAY, 1, TRY_CONVERT(DATETIME2(3), @Hasta, 23)));

    SELECT b.IDBitacora, b.Fecha, ISNULL(u.Nombre, N'Sistema') AS Usuario, b.IDUsuario,
           b.Modulo, b.Entidad, b.IDEntidad, b.Accion, b.ValorAnterior, b.ValorNuevo,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.Bitacora AS b
    LEFT JOIN dbo.Usuarios AS u ON u.IDUsuario = b.IDUsuario
    WHERE (@Modulo IS NULL OR b.Modulo = @Modulo)
      AND (@Entidad IS NULL OR b.Entidad = @Entidad)
      AND (@IDUsuario IS NULL OR b.IDUsuario = @IDUsuario)
      AND (@Accion IS NULL OR b.Accion = @Accion)
      AND (@DesdeUtc IS NULL OR b.Fecha >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR b.Fecha < @HastaUtc)
    ORDER BY b.Fecha DESC, b.IDBitacora DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO
