/* =============================================================================
   011_seed_volumen.sql — Datos de demostración con volumen (ARQUITECTURA §3.4).
   Todo pasa por los mismos SPs que usa la API (catálogo, inventario, carrito, checkout, pedidos,
   devoluciones), así montos, kardex y bitácora son reales. Es determinista (sin NEWID para decidir).
   Al final solo se RETROFECHAN columnas de fecha de pedidos/historial/kardex/cupones/usuarios.
   La bitácora NO se toca (es inmutable, incluso para el seed): sus entradas llevan la fecha real de carga.
   Simplificación documentada: el kardex de cancelaciones/devoluciones se fecha 30 min después de la
   venta para que el saldo por variante siga siendo monótono al ordenar por fecha.
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* ══ A. Catálogo, stock, clientes y cupones ═════════════════════════════════ */
DECLARE @Admin INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'admin@shopcart.test');
DECLARE @Operador INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'operador@shopcart.test');
DECLARE @Hash NVARCHAR(255) = (SELECT HashContrasena FROM dbo.Usuarios WHERE Correo = N'cliente@shopcart.test');

-- Categorías
DECLARE @Cat TABLE (N INT, Nombre NVARCHAR(100), Descripcion NVARCHAR(500));
INSERT INTO @Cat VALUES
    (1, N'Ropa',        N'Camisas, pantalones y prendas de uso diario'),
    (2, N'Calzado',     N'Zapatos casuales, deportivos y de vestir'),
    (3, N'Accesorios',  N'Bolsos, gorras, cinturones y más'),
    (4, N'Hogar',       N'Decoración y artículos para el hogar'),
    (5, N'Tecnología',  N'Dispositivos y accesorios electrónicos'),
    (6, N'Deportes',    N'Equipo y ropa para entrenar');
DECLARE @n INT = 1, @Nombre NVARCHAR(150), @Desc NVARCHAR(2000);
WHILE @n <= 6
BEGIN
    SELECT @Nombre = Nombre, @Desc = Descripcion FROM @Cat WHERE N = @n;
    EXEC dbo.SP_Catalogo_CrearCategoria @Admin, @Nombre, @Desc;
    SET @n += 1;
END

-- Productos (40): N, categoría, nombre, precio base, tipo de variante
DECLARE @Prod TABLE (N INT, Cat INT, Nombre NVARCHAR(150), Precio DECIMAL(18, 2), Tipo CHAR(2));
INSERT INTO @Prod VALUES
    (1,1,N'Camisa Oxford Clásica',189.00,'T'),(2,1,N'Camiseta Básica Algodón',79.00,'T'),
    (3,1,N'Pantalón Chino Slim',249.00,'T'),(4,1,N'Jeans Recto Azul',279.00,'T'),
    (5,1,N'Sudadera con Capucha',229.00,'T'),(6,1,N'Chaqueta Cortavientos',329.00,'T'),
    (7,1,N'Vestido Casual Verano',259.00,'T'),(8,1,N'Polo Piqué Premium',149.00,'T'),
    (9,2,N'Tenis Urbanos Blancos',399.00,'N'),(10,2,N'Zapato Oxford Cuero',549.00,'N'),
    (11,2,N'Botín Casual Café',499.00,'N'),(12,2,N'Sandalia Confort',189.00,'N'),
    (13,2,N'Mocasín Gamuza',429.00,'N'),(14,2,N'Zapatilla Running Ligera',459.00,'N'),
    (15,3,N'Mochila Urbana 20L',219.00,'C'),(16,3,N'Gorra Ajustable',69.00,'C'),
    (17,3,N'Cinturón de Cuero',119.00,'C'),(18,3,N'Billetera Slim',99.00,'C'),
    (19,3,N'Bufanda de Lana',89.00,'C'),(20,3,N'Lentes de Sol Polarizados',159.00,'C'),
    (21,3,N'Bolso Bandolera',189.00,'C'),
    (22,4,N'Lámpara de Mesa Nórdica',179.00,'D'),(23,4,N'Set de Tazas Cerámica x4',99.00,'D'),
    (24,4,N'Cojín Decorativo',59.00,'D'),(25,4,N'Cobija Térmica',149.00,'D'),
    (26,4,N'Jarrón de Vidrio',129.00,'D'),(27,4,N'Espejo Redondo 50 cm',199.00,'D'),
    (28,4,N'Organizador de Escritorio',89.00,'D'),
    (29,5,N'Audífonos Bluetooth',349.00,'K'),(30,5,N'Cargador Rápido USB-C',129.00,'K'),
    (31,5,N'Memoria USB Metálica',79.00,'K'),(32,5,N'Parlante Portátil',299.00,'K'),
    (33,5,N'Smartwatch Fit',699.00,'K'),(34,5,N'Power Bank 10000 mAh',189.00,'K'),
    (35,6,N'Pelota de Fútbol Pro',169.00,'C'),(36,6,N'Mat de Yoga Antideslizante',139.00,'C'),
    (37,6,N'Botella Térmica 750 ml',109.00,'C'),(38,6,N'Guantes de Gimnasio',89.00,'C'),
    (39,6,N'Cuerda para Saltar',49.00,'C'),(40,6,N'Banda Elástica Set x3',79.00,'C');

DECLARE @Var TABLE (Tipo CHAR(2), K INT, Atrib NVARCHAR(100), Codigo NVARCHAR(10), Delta DECIMAL(18, 2));
INSERT INTO @Var VALUES
    ('T',1,N'{"Talla":"S"}',N'S',0),('T',2,N'{"Talla":"M"}',N'M',0),('T',3,N'{"Talla":"L"}',N'L',0),
    ('N',1,N'{"Número":"38"}',N'38',0),('N',2,N'{"Número":"40"}',N'40',0),('N',3,N'{"Número":"42"}',N'42',0),('N',4,N'{"Número":"44"}',N'44',0),
    ('C',1,N'{"Color":"Negro"}',N'NEG',0),('C',2,N'{"Color":"Blanco"}',N'BLA',0),('C',3,N'{"Color":"Rojo"}',N'ROJ',0),
    ('D',1,N'{"Color":"Natural"}',N'NAT',0),('D',2,N'{"Color":"Gris"}',N'GRI',0),
    ('K',1,N'{"Capacidad":"64 GB"}',N'64G',0),('K',2,N'{"Capacidad":"128 GB"}',N'128G',80),('K',3,N'{"Capacidad":"256 GB"}',N'256G',180);

DECLARE @Cat1 INT, @IDProd INT, @NomProd NVARCHAR(150), @PrecioBase DECIMAL(18, 2), @TipoV CHAR(2), @CatN INT;
DECLARE cp CURSOR LOCAL FAST_FORWARD FOR SELECT N, Cat, Nombre, Precio, Tipo FROM @Prod ORDER BY N;
OPEN cp;
FETCH NEXT FROM cp INTO @n, @CatN, @NomProd, @PrecioBase, @TipoV;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Cat1 = (SELECT c.IDCategoria FROM dbo.Categorias AS c JOIN @Cat AS x ON x.Nombre = c.Nombre WHERE x.N = @CatN);
    SET @Desc = @NomProd + N'. Producto de la colección ShopCart: materiales de calidad y garantía de satisfacción.';
    EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Cat1, @NomProd, @Desc;
    SET @IDProd = (SELECT IDProducto FROM dbo.Productos WHERE Nombre = @NomProd);

    DECLARE @Img1 NVARCHAR(500) = N'https://picsum.photos/seed/shopcart-' + CAST(@n AS NVARCHAR(5)) + N'/600/600';
    DECLARE @Img2 NVARCHAR(500) = N'https://picsum.photos/seed/shopcart-' + CAST(@n AS NVARCHAR(5)) + N'b/600/600';
    EXEC dbo.SP_Catalogo_GuardarImagen @Admin, @IDProd, @Img1, 0, 1;
    EXEC dbo.SP_Catalogo_GuardarImagen @Admin, @IDProd, @Img2, 1, 0;

    DECLARE @Atrib NVARCHAR(100), @Codigo NVARCHAR(10), @Delta DECIMAL(18, 2), @Sku NVARCHAR(50), @Precio DECIMAL(18, 2);
    DECLARE cv CURSOR LOCAL FAST_FORWARD FOR SELECT Atrib, Codigo, Delta FROM @Var WHERE Tipo = @TipoV ORDER BY K;
    OPEN cv;
    FETCH NEXT FROM cv INTO @Atrib, @Codigo, @Delta;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @Sku = N'SC' + RIGHT(N'00' + CAST(@n AS NVARCHAR(3)), 2) + N'-' + @Codigo;
        SET @Precio = @PrecioBase + @Delta;
        EXEC dbo.SP_Catalogo_CrearVariante @Admin, @IDProd, @Sku, @Atrib, @Precio;
        FETCH NEXT FROM cv INTO @Atrib, @Codigo, @Delta;
    END
    CLOSE cv; DEALLOCATE cv;
    FETCH NEXT FROM cp INTO @n, @CatN, @NomProd, @PrecioBase, @TipoV;
END
CLOSE cp; DEALLOCATE cp;

-- Stock inicial: solo por SP_Inventario_Entrada (el kardex debe cuadrar). Algunas variantes quedan
-- con poco stock (4) o en 0 para demostrar «sin stock» y las alertas del operador.
DECLARE @IDV INT, @Idx INT = 0, @Qty INT;
DECLARE cs CURSOR LOCAL FAST_FORWARD FOR SELECT IDVariante FROM dbo.ProductoVariantes ORDER BY IDVariante;
OPEN cs;
FETCH NEXT FROM cs INTO @IDV;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Idx += 1;
    SET @Qty = CASE WHEN @Idx % 23 = 0 THEN 0 WHEN @Idx % 17 = 0 THEN 4 ELSE 150 + (@Idx * 37) % 250 END;
    IF @Qty > 0 EXEC dbo.SP_Inventario_Entrada @Operador, @IDV, @Qty, N'Stock inicial (carga de demostración)';
    FETCH NEXT FROM cs INTO @IDV;
END
CLOSE cs; DEALLOCATE cs;

-- Clientes (30) con su dirección principal
DECLARE @Cli TABLE (N INT, Nombre NVARCHAR(100), Correo NVARCHAR(254), Depto NVARCHAR(30), Ciudad NVARCHAR(100));
INSERT INTO @Cli VALUES
    (1,N'María Fernanda López',N'maria.lopez@correo.test',N'Guatemala',N'Guatemala'),
    (2,N'José Luis Pérez',N'jose.perez@correo.test',N'Guatemala',N'Mixco'),
    (3,N'Andrea Castillo',N'andrea.castillo@correo.test',N'Sacatepéquez',N'Antigua Guatemala'),
    (4,N'Diego Morales',N'diego.morales@correo.test',N'Quetzaltenango',N'Quetzaltenango'),
    (5,N'Lucía Ramírez',N'lucia.ramirez@correo.test',N'Escuintla',N'Escuintla'),
    (6,N'Carlos Méndez',N'carlos.mendez@correo.test',N'Guatemala',N'Villa Nueva'),
    (7,N'Sofía Hernández',N'sofia.hernandez@correo.test',N'Alta Verapaz',N'Cobán'),
    (8,N'Javier Ortiz',N'javier.ortiz@correo.test',N'Huehuetenango',N'Huehuetenango'),
    (9,N'Valeria Cruz',N'valeria.cruz@correo.test',N'Guatemala',N'Guatemala'),
    (10,N'Pablo Aguilar',N'pablo.aguilar@correo.test',N'Chimaltenango',N'Chimaltenango'),
    (11,N'Daniela Ruiz',N'daniela.ruiz@correo.test',N'Izabal',N'Puerto Barrios'),
    (12,N'Mateo Vásquez',N'mateo.vasquez@correo.test',N'Petén',N'Flores'),
    (13,N'Camila Arévalo',N'camila.arevalo@correo.test',N'Guatemala',N'San Miguel Petapa'),
    (14,N'Sebastián Gómez',N'sebastian.gomez@correo.test',N'Zacapa',N'Zacapa'),
    (15,N'Isabella Reyes',N'isabella.reyes@correo.test',N'Santa Rosa',N'Cuilapa'),
    (16,N'Nicolás Barrios',N'nicolas.barrios@correo.test',N'Guatemala',N'Guatemala'),
    (17,N'Gabriela Solís',N'gabriela.solis@correo.test',N'Sololá',N'Sololá'),
    (18,N'Emilio Cabrera',N'emilio.cabrera@correo.test',N'Jutiapa',N'Jutiapa'),
    (19,N'Renata Girón',N'renata.giron@correo.test',N'Quetzaltenango',N'Salcajá'),
    (20,N'Santiago Paz',N'santiago.paz@correo.test',N'Guatemala',N'Mixco'),
    (21,N'Paula Estrada',N'paula.estrada@correo.test',N'Retalhuleu',N'Retalhuleu'),
    (22,N'Alejandro Súarez',N'alejandro.suarez@correo.test',N'Suchitepéquez',N'Mazatenango'),
    (23,N'Natalia Pineda',N'natalia.pineda@correo.test',N'Guatemala',N'Guatemala'),
    (24,N'Rodrigo Fuentes',N'rodrigo.fuentes@correo.test',N'San Marcos',N'San Marcos'),
    (25,N'Mariana Chávez',N'mariana.chavez@correo.test',N'El Progreso',N'Guastatoya'),
    (26,N'Fernando Lemus',N'fernando.lemus@correo.test',N'Jalapa',N'Jalapa'),
    (27,N'Adriana Monzón',N'adriana.monzon@correo.test',N'Chiquimula',N'Chiquimula'),
    (28,N'Ricardo Orellana',N'ricardo.orellana@correo.test',N'Baja Verapaz',N'Salamá'),
    (29,N'Julia Barillas',N'julia.barillas@correo.test',N'Quiché',N'Santa Cruz del Quiché'),
    (30,N'Héctor Tzoc',N'hector.tzoc@correo.test',N'Totonicapán',N'Totonicapán');

DECLARE @CNom NVARCHAR(100), @CCor NVARCHAR(254), @CDep NVARCHAR(30), @CCiu NVARCHAR(100), @IDU INT, @L1 NVARCHAR(200), @Tel NVARCHAR(20);
SET @n = 1;
WHILE @n <= 30
BEGIN
    SELECT @CNom = Nombre, @CCor = Correo, @CDep = Depto, @CCiu = Ciudad FROM @Cli WHERE N = @n;
    EXEC dbo.SP_Auth_RegistrarCliente @CCor, @Hash, @CNom;
    SET @IDU = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = @CCor);
    SET @L1 = CAST(1 + (@n * 3) % 18 AS NVARCHAR(3)) + N'a avenida ' + CAST(2 + (@n * 7) % 30 AS NVARCHAR(3)) + N'-' + CAST(10 + (@n * 11) % 80 AS NVARCHAR(3)) + N' zona ' + CAST(1 + @n % 15 AS NVARCHAR(3));
    SET @Tel = N'5' + RIGHT(N'0000000' + CAST(1000000 + @n * 37193 AS NVARCHAR(10)), 7);
    EXEC dbo.SP_Direcciones_Crear @IDU, N'Casa', @CNom, @L1, NULL, @CCiu, @CDep, NULL, @Tel, 1;
    SET @n += 1;
END
-- Los dos clientes de prueba también tienen dirección y compras.
DECLARE @U1 INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'cliente@shopcart.test');
DECLARE @U2 INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'cliente2@shopcart.test');
EXEC dbo.SP_Direcciones_Crear @U1, N'Casa', N'Carla Cliente', N'5a avenida 10-20 zona 10', NULL, N'Guatemala', N'Guatemala', N'01010', N'55551234', 1;
EXEC dbo.SP_Direcciones_Crear @U2, N'Oficina', N'Carlos Cliente', N'12 calle 3-45 zona 1', NULL, N'Quetzaltenango', N'Quetzaltenango', NULL, N'55559876', 1;

-- Cupones: vigentes, con categoría, fijo, casi agotado, futuro y vencido (todos los casos de RF-04).
DECLARE @CatRopa INT = (SELECT IDCategoria FROM dbo.Categorias WHERE Nombre = N'Ropa');
DECLARE @CatTec INT = (SELECT IDCategoria FROM dbo.Categorias WHERE Nombre = N'Tecnología');
DECLARE @Ahora0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @CupCod NVARCHAR(30), @CupTipo NVARCHAR(12), @CupVal DECIMAL(18,2), @CupMin DECIMAL(18,2), @CupMax INT, @CupCli INT, @CupCat INT, @CupDesde DATETIME2(3), @CupHasta DATETIME2(3);
SELECT @CupCod=N'BIENVENIDA10', @CupTipo=N'Porcentaje', @CupVal=10, @CupMin=0, @CupMax=1000, @CupCli=1, @CupCat=NULL, @CupDesde=DATEADD(DAY,-200,@Ahora0), @CupHasta=DATEADD(DAY,90,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'VERANO15', @CupTipo=N'Porcentaje', @CupVal=15, @CupMin=300, @CupMax=200, @CupCli=2, @CupCat=@CatRopa, @CupDesde=DATEADD(DAY,-120,@Ahora0), @CupHasta=DATEADD(DAY,60,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'ENVIO50', @CupTipo=N'Fijo', @CupVal=50, @CupMin=400, @CupMax=500, @CupCli=1, @CupCat=NULL, @CupDesde=DATEADD(DAY,-150,@Ahora0), @CupHasta=DATEADD(DAY,120,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'TECH100', @CupTipo=N'Fijo', @CupVal=100, @CupMin=800, @CupMax=100, @CupCli=1, @CupCat=@CatTec, @CupDesde=DATEADD(DAY,-100,@Ahora0), @CupHasta=DATEADD(DAY,45,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'FLASH20', @CupTipo=N'Porcentaje', @CupVal=20, @CupMin=0, @CupMax=25, @CupCli=1, @CupCat=NULL, @CupDesde=DATEADD(DAY,-30,@Ahora0), @CupHasta=DATEADD(DAY,30,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'AGOTADO10', @CupTipo=N'Porcentaje', @CupVal=10, @CupMin=0, @CupMax=3, @CupCli=1, @CupCat=NULL, @CupDesde=DATEADD(DAY,-60,@Ahora0), @CupHasta=DATEADD(DAY,60,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'NAVIDAD25', @CupTipo=N'Porcentaje', @CupVal=25, @CupMin=0, @CupMax=300, @CupCli=1, @CupCat=NULL, @CupDesde=DATEADD(DAY,45,@Ahora0), @CupHasta=DATEADD(DAY,75,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
SELECT @CupCod=N'BLACKFRIDAY30', @CupTipo=N'Porcentaje', @CupVal=30, @CupMin=0, @CupMax=500, @CupCli=1, @CupCat=NULL, @CupDesde=DATEADD(DAY,-200,@Ahora0), @CupHasta=DATEADD(DAY,-150,@Ahora0);
EXEC dbo.SP_Cupones_Crear @Admin, @CupCod, @CupTipo, @CupVal, @CupMin, @CupMax, @CupCli, @CupCat, @CupDesde, @CupHasta;
GO

/* ══ B. Pedidos históricos (420) por los SPs reales, luego retrofechados ═════ */
DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
DECLARE @Operador INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'operador@shopcart.test');

CREATE TABLE #Clientes (N INT IDENTITY(1, 1) PRIMARY KEY, IDUsuario INT, IDDireccion INT);
INSERT INTO #Clientes (IDUsuario, IDDireccion)
SELECT u.IDUsuario, d.IDDireccion
FROM dbo.Usuarios AS u JOIN dbo.Direcciones AS d ON d.IDUsuario = u.IDUsuario AND d.EsPrincipal = 1
WHERE u.Rol = N'Cliente' ORDER BY u.IDUsuario;
DECLARE @NC INT = (SELECT COUNT(*) FROM #Clientes);

CREATE TABLE #Orderable (N INT IDENTITY(1, 1) PRIMARY KEY, IDVariante INT);
INSERT INTO #Orderable (IDVariante)
SELECT e.IDVariante FROM dbo.InventarioExistencias AS e WHERE e.CantidadFisica >= 100 ORDER BY e.IDVariante;
DECLARE @NO INT = (SELECT COUNT(*) FROM #Orderable);

DECLARE @Cupones TABLE (N INT, Codigo NVARCHAR(30));
INSERT INTO @Cupones VALUES (0,N'BIENVENIDA10'),(1,N'VERANO15'),(2,N'ENVIO50'),(3,N'TECH100'),(4,N'FLASH20'),(5,N'AGOTADO10');

DECLARE @Total INT = 420, @i INT = 1, @Hechos INT = 0, @Omitidos INT = 0;
DECLARE @Span DECIMAL(18, 2) = 175.5 * 1440, @Inicio DATETIME2(3) = DATEADD(DAY, -176, @Ahora);
DECLARE @T0 DATETIME2(3), @U INT, @Dir INT, @C INT, @P INT, @Env INT, @Monto DECIMAL(18, 2), @Key UNIQUEIDENTIFIER;
DECLARE @k INT, @NL INT, @V INT, @Q INT, @Cod NVARCHAR(30), @Fate INT, @LineaId INT, @Json NVARCHAR(MAX);
DECLARE @Cnt INT, @Paso INT, @Ult DATETIME2(3);

WHILE @i <= @Total
BEGIN
    BEGIN TRY
        SET @T0 = DATEADD(MINUTE, CAST(FLOOR(@Span * POWER(CAST(@i AS DECIMAL(18, 6)) / @Total, 0.8)) AS INT), @Inicio);
        SELECT @U = IDUsuario, @Dir = IDDireccion FROM #Clientes WHERE N = ((@i * 7 + @i / 5) % @NC) + 1;

        EXEC dbo.SP_Carrito_ObtenerOCrearPorUsuario @U, 1;
        SET @C = (SELECT IDCarrito FROM dbo.Carritos WHERE IDUsuario = @U AND Activo = 1);

        SET @NL = 1 + (@i % 4); SET @k = 0;
        WHILE @k < @NL
        BEGIN
            SET @V = (SELECT IDVariante FROM #Orderable WHERE N = ((@i * 31 + @k * 17) % @NO) + 1);
            SET @Q = 1 + ((@i + @k) % 3);
            EXEC dbo.SP_Carrito_AgregarLinea @C, @V, @Q;
            SET @k += 1;
        END

        IF @i % 3 = 0
        BEGIN
            SET @Cod = (SELECT Codigo FROM @Cupones WHERE N = (@i / 3) % 6);
            BEGIN TRY
                EXEC dbo.SP_Carrito_AplicarCupon @C, @Cod;
            END TRY
            BEGIN CATCH
                -- cupón no aplicable a este carrito/cliente: se sigue sin cupón
            END CATCH
        END

        EXEC dbo.SP_Pedidos_IniciarCheckout @U, 15;

        SELECT TOP (1) @Env = m.IDMetodoEnvio, @Monto = t.Total + m.Costo
        FROM dbo.MetodosEnvio AS m
        CROSS APPLY dbo.FU_Carrito_CalcularTotales(@C) AS t
        WHERE m.Activo = 1 AND (m.MontoMinimo IS NULL OR t.Subtotal - t.Descuento >= m.MontoMinimo)
        ORDER BY CASE @i % 3 WHEN 0 THEN m.Costo WHEN 1 THEN ABS(m.IDMetodoEnvio - 2) ELSE ABS(m.IDMetodoEnvio - 3) END, m.IDMetodoEnvio;

        SET @Key = NEWID();
        EXEC dbo.SP_Pedidos_CrearPedido @U, @Dir, @Env, @Monto, @Key;
        SET @P = (SELECT IDPedido FROM dbo.Pedidos WHERE IDUsuario = @U AND LlaveIdempotencia = @Key);

        -- Ciclo de vida: por posición (los más recientes quedan pendientes) y por «destino» (@i % 20)
        SET @Fate = @i % 20;
        IF @Fate IN (14, 15)
            EXEC dbo.SP_Pedidos_Cancelar @U, @P, N'Cambié de opinión sobre la compra';
        ELSE IF @i <= @Total - 10   -- los 10 más recientes quedan en Pagado (cola del operador)
        BEGIN
            EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @P, N'Preparando', NULL;
            IF @i <= @Total - 20    -- los 10 siguientes quedan en Preparando
            BEGIN
                IF @i <= @Total - 35 -- los 15 siguientes quedan en Despachado
                BEGIN
                    EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @P, N'Despachado', N'Entregado a la transportista';
                    EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @P, N'Entregado', NULL;
                    IF @Fate = 16
                    BEGIN
                        SET @LineaId = (SELECT TOP (1) IDPedidoLinea FROM dbo.PedidoLineas WHERE IDPedido = @P ORDER BY IDPedidoLinea);
                        SET @Json = N'[{"idPedidoLinea":' + CAST(@LineaId AS NVARCHAR(12)) + N',"cantidad":1}]';
                        EXEC dbo.SP_Pedidos_CrearDevolucion @Operador, @P, N'Producto con defecto de fábrica', @Json;
                    END
                    ELSE IF @Fate = 17
                    BEGIN
                        SET @Json = (SELECT IDPedidoLinea AS idPedidoLinea, Cantidad AS cantidad FROM dbo.PedidoLineas
                                      WHERE IDPedido = @P FOR JSON PATH);
                        EXEC dbo.SP_Pedidos_CrearDevolucion @Operador, @P, N'El cliente no quedó conforme', @Json;
                    END
                END
                ELSE
                    EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @P, N'Despachado', N'Entregado a la transportista';
            END
        END

        -- Retrofecha: pedido, historial (escalonado), cupón y kardex. La bitácora no se toca.
        SET @Cnt = (SELECT COUNT(*) FROM dbo.PedidoEstadoHistorial WHERE IDPedido = @P);
        SET @Paso = CASE WHEN DATEDIFF(MINUTE, @T0, @Ahora) / (@Cnt + 1) > 1440 THEN 1440
                         ELSE DATEDIFF(MINUTE, @T0, @Ahora) / (@Cnt + 1) END;
        UPDATE ph SET Fecha = DATEADD(MINUTE, (x.rn - 1) * @Paso, @T0)
        FROM dbo.PedidoEstadoHistorial AS ph
        JOIN (SELECT IDHistorial, ROW_NUMBER() OVER (ORDER BY IDHistorial) AS rn
                FROM dbo.PedidoEstadoHistorial WHERE IDPedido = @P) AS x ON x.IDHistorial = ph.IDHistorial;
        SET @Ult = (SELECT MAX(Fecha) FROM dbo.PedidoEstadoHistorial WHERE IDPedido = @P);
        UPDATE dbo.Pedidos SET FechaCreacion = @T0, FechaActualizacion = @Ult WHERE IDPedido = @P;
        UPDATE dbo.Devoluciones SET Fecha = @Ult WHERE IDPedido = @P;
        UPDATE dbo.CuponUsos SET Fecha = @T0 WHERE IDPedido = @P;
        UPDATE dbo.InventarioKardex SET Fecha = @T0 WHERE IDPedido = @P AND TipoMovimiento = N'Venta';
        UPDATE dbo.InventarioKardex SET Fecha = DATEADD(MINUTE, 30, @T0) WHERE IDPedido = @P AND TipoMovimiento <> N'Venta';

        SET @Hechos += 1;
    END TRY
    BEGIN CATCH
        SET @Omitidos += 1;
        IF @@TRANCOUNT > 0 ROLLBACK;
        PRINT CONCAT(N'  pedido ', @i, N' omitido: ', ERROR_MESSAGE());
    END CATCH
    SET @i += 1;
END
PRINT CONCAT(N'  pedidos generados: ', @Hechos, N' (omitidos: ', @Omitidos, N')');

-- El stock inicial es anterior a la primera venta; clientes registrados antes de su primera compra.
UPDATE dbo.InventarioKardex SET Fecha = DATEADD(DAY, -180, @Ahora) WHERE TipoMovimiento = N'Entrada';
UPDATE u SET FechaCreacion = ISNULL(DATEADD(DAY, -1, (SELECT MIN(p.FechaCreacion) FROM dbo.Pedidos AS p WHERE p.IDUsuario = u.IDUsuario)),
                                    DATEADD(DAY, -100, @Ahora))
FROM dbo.Usuarios AS u WHERE u.Rol = N'Cliente';
UPDATE dbo.Productos SET FechaCreacion = DATEADD(DAY, -185, @Ahora), FechaActualizacion = DATEADD(DAY, -185, @Ahora);

/* ── Carritos abandonados (8 de clientes + 7 de invitados) ─────────────────── */
DECLARE @a INT = 1, @Horas INT;
DECLARE @Token TABLE (IDCarrito INT, TokenInvitado UNIQUEIDENTIFIER);
WHILE @a <= 15
BEGIN
    SET @Horas = 2 + @a * 5;
    IF @a <= 8
    BEGIN
        SELECT @U = IDUsuario FROM #Clientes WHERE N = ((@a * 3) % @NC) + 1;
        EXEC dbo.SP_Carrito_ObtenerOCrearPorUsuario @U, 1;
        SET @C = (SELECT IDCarrito FROM dbo.Carritos WHERE IDUsuario = @U AND Activo = 1);
    END
    ELSE
    BEGIN
        DELETE FROM @Token;
        INSERT INTO @Token EXEC dbo.SP_Carrito_ObtenerOCrearPorToken NULL, 1;
        SET @C = (SELECT TOP (1) IDCarrito FROM @Token);
    END
    SET @k = 0;
    WHILE @k < 1 + (@a % 3)
    BEGIN
        SET @V = (SELECT IDVariante FROM #Orderable WHERE N = ((@a * 29 + @k * 13) % @NO) + 1);
        SET @Q = 1 + (@a % 2);
        EXEC dbo.SP_Carrito_AgregarLinea @C, @V, @Q;
        SET @k += 1;
    END
    UPDATE dbo.Carritos SET FechaActualizacion = DATEADD(HOUR, -@Horas, @Ahora), FechaCreacion = DATEADD(HOUR, -@Horas - 1, @Ahora)
     WHERE IDCarrito = @C;
    SET @a += 1;
END

-- Un par de productos descontinuados (aparecen en pedidos históricos pero ya no en la tienda).
DECLARE @Admin INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'admin@shopcart.test');
DECLARE @D1 INT = (SELECT IDProducto FROM dbo.Productos WHERE Nombre = N'Cobija Térmica');
DECLARE @D2 INT = (SELECT IDProducto FROM dbo.Productos WHERE Nombre = N'Cuerda para Saltar');
EXEC dbo.SP_Catalogo_DesactivarProducto @Admin, @D1;
EXEC dbo.SP_Catalogo_DesactivarProducto @Admin, @D2;

-- Usuarios del equipo y un cliente desactivado (conserva su historial: «desactivarse sin borrarse», RF-01).
DECLARE @HashEquipo NVARCHAR(255) = (SELECT HashContrasena FROM dbo.Usuarios WHERE Correo = N'operador@shopcart.test');
EXEC dbo.SP_Auth_CrearUsuario @Admin, N'operador2@shopcart.test', @HashEquipo, N'Olga Operadora', N'Operador';
DECLARE @Baja INT = (SELECT IDUsuario FROM dbo.Usuarios WHERE Correo = N'hector.tzoc@correo.test');
EXEC dbo.SP_Auth_ActualizarUsuario @Admin, @Baja, NULL, NULL, 0;

DROP TABLE #Clientes; DROP TABLE #Orderable;
GO
