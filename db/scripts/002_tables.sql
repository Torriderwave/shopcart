/* =============================================================================
   002_tables.sql — 23 tablas de dominio con PK/FK/UNIQUE/CHECK/índices.
   Convención: PK_, FK_, UQ_, CK_, IX_, DF_ (la API mapea UQ_* a errores DUPLICADO).
   Montos DECIMAL(18,2); cantidades INT; fechas DATETIME2(3) en UTC. NOT NULL salvo
   que la columna diga NULL explícitamente.
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ══ Auth y direcciones ═══════════════════════════════════════════════════ */

CREATE TABLE dbo.Usuarios (
    IDUsuario       INT           NOT NULL IDENTITY(1, 1),
    Correo          NVARCHAR(254) NOT NULL,
    HashContrasena  NVARCHAR(255) NOT NULL,
    Nombre          NVARCHAR(100) NOT NULL,
    Rol             NVARCHAR(20)  NOT NULL,
    Activo          BIT           NOT NULL CONSTRAINT DF_Usuarios_Activo DEFAULT 1,
    FechaCreacion   DATETIME2(3)  NOT NULL CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Usuarios PRIMARY KEY (IDUsuario),
    CONSTRAINT UQ_Usuarios_Correo UNIQUE (Correo),
    CONSTRAINT CK_Usuarios_Rol CHECK (Rol IN (N'Cliente', N'Operador', N'Administrador')),
    CONSTRAINT CK_Usuarios_CorreoMinusculas
        CHECK (Correo COLLATE Latin1_General_BIN2 = LOWER(Correo) COLLATE Latin1_General_BIN2)
);
GO

CREATE TABLE dbo.RefreshTokens (
    IDRefreshToken  INT              NOT NULL IDENTITY(1, 1),
    IDUsuario       INT              NOT NULL,
    TokenHash       CHAR(64)         NOT NULL,
    Familia         UNIQUEIDENTIFIER NOT NULL,
    ExpiraEn        DATETIME2(3)     NOT NULL,
    Revocado        BIT              NOT NULL CONSTRAINT DF_RefreshTokens_Revocado DEFAULT 0,
    ReemplazadoPor  INT              NULL,
    FechaCreacion   DATETIME2(3)     NOT NULL CONSTRAINT DF_RefreshTokens_FechaCreacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_RefreshTokens PRIMARY KEY (IDRefreshToken),
    CONSTRAINT UQ_RefreshTokens_TokenHash UNIQUE (TokenHash),
    CONSTRAINT FK_RefreshTokens_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT FK_RefreshTokens_Reemplazo FOREIGN KEY (ReemplazadoPor) REFERENCES dbo.RefreshTokens (IDRefreshToken)
);
CREATE INDEX IX_RefreshTokens_Familia ON dbo.RefreshTokens (Familia);
CREATE INDEX IX_RefreshTokens_Usuario ON dbo.RefreshTokens (IDUsuario);
GO

CREATE TABLE dbo.Direcciones (
    IDDireccion   INT           NOT NULL IDENTITY(1, 1),
    IDUsuario     INT           NOT NULL,
    Alias         NVARCHAR(50)  NOT NULL,
    Destinatario  NVARCHAR(100) NOT NULL,
    Linea1        NVARCHAR(200) NOT NULL,
    Linea2        NVARCHAR(200) NULL,
    Ciudad        NVARCHAR(100) NOT NULL,
    Departamento  NVARCHAR(30)  NOT NULL,
    CodigoPostal  NVARCHAR(10)  NULL,
    Telefono      NVARCHAR(20)  NOT NULL,
    EsPrincipal   BIT           NOT NULL CONSTRAINT DF_Direcciones_EsPrincipal DEFAULT 0,
    Activo        BIT           NOT NULL CONSTRAINT DF_Direcciones_Activo DEFAULT 1,
    CONSTRAINT PK_Direcciones PRIMARY KEY (IDDireccion),
    CONSTRAINT FK_Direcciones_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT CK_Direcciones_Departamento CHECK (Departamento IN (
        N'Alta Verapaz', N'Baja Verapaz', N'Chimaltenango', N'Chiquimula', N'El Progreso', N'Escuintla',
        N'Guatemala', N'Huehuetenango', N'Izabal', N'Jalapa', N'Jutiapa', N'Petén', N'Quetzaltenango',
        N'Quiché', N'Retalhuleu', N'Sacatepéquez', N'San Marcos', N'Santa Rosa', N'Sololá',
        N'Suchitepéquez', N'Totonicapán', N'Zacapa'))
);
CREATE INDEX IX_Direcciones_Usuario ON dbo.Direcciones (IDUsuario);
-- A lo más una dirección principal activa por usuario.
CREATE UNIQUE INDEX UQ_Direcciones_Principal ON dbo.Direcciones (IDUsuario)
    WHERE EsPrincipal = 1 AND Activo = 1;
GO

/* ══ Catálogo ═════════════════════════════════════════════════════════════ */

CREATE TABLE dbo.Categorias (
    IDCategoria  INT           NOT NULL IDENTITY(1, 1),
    Nombre       NVARCHAR(100) NOT NULL,
    Descripcion  NVARCHAR(500) NULL,
    Activo       BIT           NOT NULL CONSTRAINT DF_Categorias_Activo DEFAULT 1,
    CONSTRAINT PK_Categorias PRIMARY KEY (IDCategoria),
    CONSTRAINT UQ_Categorias_Nombre UNIQUE (Nombre)
);
GO

CREATE TABLE dbo.Productos (
    IDProducto          INT            NOT NULL IDENTITY(1, 1),
    IDCategoria         INT            NOT NULL,
    Nombre              NVARCHAR(150)  NOT NULL,
    Descripcion         NVARCHAR(2000) NOT NULL CONSTRAINT DF_Productos_Descripcion DEFAULT N'',
    Activo              BIT            NOT NULL CONSTRAINT DF_Productos_Activo DEFAULT 1,
    FechaCreacion       DATETIME2(3)   NOT NULL CONSTRAINT DF_Productos_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion  DATETIME2(3)   NOT NULL CONSTRAINT DF_Productos_FechaActualizacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Productos PRIMARY KEY (IDProducto),
    CONSTRAINT FK_Productos_Categorias FOREIGN KEY (IDCategoria) REFERENCES dbo.Categorias (IDCategoria)
);
CREATE INDEX IX_Productos_Activo_Categoria ON dbo.Productos (Activo, IDCategoria);
GO

CREATE TABLE dbo.ProductoVariantes (
    IDVariante     INT            NOT NULL IDENTITY(1, 1),
    IDProducto     INT            NOT NULL,
    SKU            NVARCHAR(50)   NOT NULL,
    AtributosJson  NVARCHAR(1000) NOT NULL CONSTRAINT DF_ProductoVariantes_Atributos DEFAULT N'{}',
    Precio         DECIMAL(18, 2) NOT NULL,
    Activo         BIT            NOT NULL CONSTRAINT DF_ProductoVariantes_Activo DEFAULT 1,
    CONSTRAINT PK_ProductoVariantes PRIMARY KEY (IDVariante),
    CONSTRAINT UQ_ProductoVariantes_SKU UNIQUE (SKU),
    CONSTRAINT FK_ProductoVariantes_Productos FOREIGN KEY (IDProducto) REFERENCES dbo.Productos (IDProducto),
    CONSTRAINT CK_ProductoVariantes_Precio CHECK (Precio >= 0),
    CONSTRAINT CK_ProductoVariantes_Atributos CHECK (ISJSON(AtributosJson) = 1),
    CONSTRAINT CK_ProductoVariantes_SKUMayusculas
        CHECK (SKU COLLATE Latin1_General_BIN2 = UPPER(SKU) COLLATE Latin1_General_BIN2)
);
CREATE INDEX IX_ProductoVariantes_Producto ON dbo.ProductoVariantes (IDProducto);
GO

CREATE TABLE dbo.ProductoImagenes (
    IDImagen     INT            NOT NULL IDENTITY(1, 1),
    IDProducto   INT            NOT NULL,
    Url          NVARCHAR(500)  NOT NULL,
    Orden        INT            NOT NULL CONSTRAINT DF_ProductoImagenes_Orden DEFAULT 0,
    EsPrincipal  BIT            NOT NULL CONSTRAINT DF_ProductoImagenes_EsPrincipal DEFAULT 0,
    CONSTRAINT PK_ProductoImagenes PRIMARY KEY (IDImagen),
    CONSTRAINT FK_ProductoImagenes_Productos FOREIGN KEY (IDProducto) REFERENCES dbo.Productos (IDProducto)
);
CREATE INDEX IX_ProductoImagenes_Producto ON dbo.ProductoImagenes (IDProducto);
CREATE UNIQUE INDEX UQ_ProductoImagenes_Principal ON dbo.ProductoImagenes (IDProducto) WHERE EsPrincipal = 1;
GO

/* ══ Cupones (antes que Carritos por la FK) ═══════════════════════════════ */

CREATE TABLE dbo.Cupones (
    IDCupon            INT            NOT NULL IDENTITY(1, 1),
    Codigo             NVARCHAR(30)   NOT NULL,
    Tipo               NVARCHAR(12)   NOT NULL,
    Valor              DECIMAL(18, 2) NOT NULL,
    MontoMinimo        DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Cupones_MontoMinimo DEFAULT 0,
    UsosTotalesMax     INT            NOT NULL,
    UsosTotalesActual  INT            NOT NULL CONSTRAINT DF_Cupones_UsosActual DEFAULT 0,
    UsosPorCliente     INT            NOT NULL,
    IDCategoria        INT            NULL,
    VigenteDesde       DATETIME2(3)   NOT NULL,
    VigenteHasta       DATETIME2(3)   NOT NULL,
    Activo             BIT            NOT NULL CONSTRAINT DF_Cupones_Activo DEFAULT 1,
    CONSTRAINT PK_Cupones PRIMARY KEY (IDCupon),
    CONSTRAINT UQ_Cupones_Codigo UNIQUE (Codigo),
    CONSTRAINT FK_Cupones_Categorias FOREIGN KEY (IDCategoria) REFERENCES dbo.Categorias (IDCategoria),
    CONSTRAINT CK_Cupones_Tipo CHECK (Tipo IN (N'Porcentaje', N'Fijo')),
    CONSTRAINT CK_Cupones_Valor CHECK (
        (Tipo = N'Porcentaje' AND Valor > 0 AND Valor <= 100) OR (Tipo = N'Fijo' AND Valor > 0)),
    CONSTRAINT CK_Cupones_MontoMinimo CHECK (MontoMinimo >= 0),
    CONSTRAINT CK_Cupones_Limites CHECK (UsosTotalesMax > 0 AND UsosPorCliente > 0),
    CONSTRAINT CK_Cupones_UsosActual CHECK (UsosTotalesActual >= 0 AND UsosTotalesActual <= UsosTotalesMax),
    CONSTRAINT CK_Cupones_Vigencia CHECK (VigenteDesde < VigenteHasta),
    CONSTRAINT CK_Cupones_CodigoMayusculas
        CHECK (Codigo COLLATE Latin1_General_BIN2 = UPPER(Codigo) COLLATE Latin1_General_BIN2)
);
CREATE INDEX IX_Cupones_Categoria ON dbo.Cupones (IDCategoria);
GO

/* ══ Carrito y envío ══════════════════════════════════════════════════════ */

CREATE TABLE dbo.Carritos (
    IDCarrito           INT              NOT NULL IDENTITY(1, 1),
    IDUsuario           INT              NULL,
    TokenInvitado       UNIQUEIDENTIFIER NULL,
    IDCupon             INT              NULL,
    Activo              BIT              NOT NULL CONSTRAINT DF_Carritos_Activo DEFAULT 1,
    FechaCreacion       DATETIME2(3)     NOT NULL CONSTRAINT DF_Carritos_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion  DATETIME2(3)     NOT NULL CONSTRAINT DF_Carritos_FechaActualizacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Carritos PRIMARY KEY (IDCarrito),
    CONSTRAINT FK_Carritos_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT FK_Carritos_Cupones FOREIGN KEY (IDCupon) REFERENCES dbo.Cupones (IDCupon),
    -- Exactamente uno de (IDUsuario, TokenInvitado).
    CONSTRAINT CK_Carritos_Dueno CHECK (
        (IDUsuario IS NOT NULL AND TokenInvitado IS NULL) OR (IDUsuario IS NULL AND TokenInvitado IS NOT NULL))
);
CREATE INDEX IX_Carritos_Cupon ON dbo.Carritos (IDCupon);
CREATE INDEX IX_Carritos_Activo_FechaActualizacion ON dbo.Carritos (Activo, FechaActualizacion);
-- Un carrito activo por usuario; un token de invitado identifica un solo carrito.
CREATE UNIQUE INDEX UQ_Carritos_UsuarioActivo ON dbo.Carritos (IDUsuario)
    WHERE Activo = 1 AND IDUsuario IS NOT NULL;
CREATE UNIQUE INDEX UQ_Carritos_Token ON dbo.Carritos (TokenInvitado) WHERE TokenInvitado IS NOT NULL;
GO

CREATE TABLE dbo.CarritoLineas (
    IDCarritoLinea  INT NOT NULL IDENTITY(1, 1),
    IDCarrito       INT NOT NULL,
    IDVariante      INT NOT NULL,
    Cantidad        INT NOT NULL,
    CONSTRAINT PK_CarritoLineas PRIMARY KEY (IDCarritoLinea),
    CONSTRAINT UQ_CarritoLineas_Carrito_Variante UNIQUE (IDCarrito, IDVariante),
    CONSTRAINT FK_CarritoLineas_Carritos FOREIGN KEY (IDCarrito) REFERENCES dbo.Carritos (IDCarrito),
    CONSTRAINT FK_CarritoLineas_Variantes FOREIGN KEY (IDVariante) REFERENCES dbo.ProductoVariantes (IDVariante),
    CONSTRAINT CK_CarritoLineas_Cantidad CHECK (Cantidad > 0)
);
CREATE INDEX IX_CarritoLineas_Variante ON dbo.CarritoLineas (IDVariante);
GO

CREATE TABLE dbo.MetodosEnvio (
    IDMetodoEnvio  INT            NOT NULL IDENTITY(1, 1),
    Nombre         NVARCHAR(50)   NOT NULL,
    Costo          DECIMAL(18, 2) NOT NULL,
    MontoMinimo    DECIMAL(18, 2) NULL,
    DiasEstimados  INT            NOT NULL,
    Activo         BIT            NOT NULL CONSTRAINT DF_MetodosEnvio_Activo DEFAULT 1,
    CONSTRAINT PK_MetodosEnvio PRIMARY KEY (IDMetodoEnvio),
    CONSTRAINT UQ_MetodosEnvio_Nombre UNIQUE (Nombre),
    CONSTRAINT CK_MetodosEnvio_Costo CHECK (Costo >= 0),
    CONSTRAINT CK_MetodosEnvio_MontoMinimo CHECK (MontoMinimo IS NULL OR MontoMinimo >= 0),
    CONSTRAINT CK_MetodosEnvio_Dias CHECK (DiasEstimados >= 0)
);
GO

/* ══ Inventario: existencias y reservas (el kardex va después de Pedidos) ═ */

CREATE TABLE dbo.InventarioExistencias (
    IDExistencia       INT NOT NULL IDENTITY(1, 1),
    IDVariante         INT NOT NULL,
    CantidadFisica     INT NOT NULL CONSTRAINT DF_InventarioExistencias_Fisica DEFAULT 0,
    CantidadReservada  INT NOT NULL CONSTRAINT DF_InventarioExistencias_Reservada DEFAULT 0,
    CONSTRAINT PK_InventarioExistencias PRIMARY KEY (IDExistencia),
    CONSTRAINT UQ_InventarioExistencias_Variante UNIQUE (IDVariante),
    CONSTRAINT FK_InventarioExistencias_Variantes FOREIGN KEY (IDVariante) REFERENCES dbo.ProductoVariantes (IDVariante),
    CONSTRAINT CK_InventarioExistencias_Cantidades CHECK (
        CantidadFisica >= 0 AND CantidadReservada >= 0 AND CantidadReservada <= CantidadFisica)
);
GO

CREATE TABLE dbo.InventarioReservas (
    IDReserva       INT            NOT NULL IDENTITY(1, 1),
    IDVariante      INT            NOT NULL,
    IDCarrito       INT            NOT NULL,
    Cantidad        INT            NOT NULL,
    PrecioUnitario  DECIMAL(18, 2) NOT NULL,
    Estado          NVARCHAR(10)   NOT NULL CONSTRAINT DF_InventarioReservas_Estado DEFAULT N'Activa',
    ExpiraEn        DATETIME2(3)   NOT NULL,
    FechaCreacion   DATETIME2(3)   NOT NULL CONSTRAINT DF_InventarioReservas_FechaCreacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_InventarioReservas PRIMARY KEY (IDReserva),
    CONSTRAINT FK_InventarioReservas_Variantes FOREIGN KEY (IDVariante) REFERENCES dbo.ProductoVariantes (IDVariante),
    CONSTRAINT FK_InventarioReservas_Carritos FOREIGN KEY (IDCarrito) REFERENCES dbo.Carritos (IDCarrito),
    CONSTRAINT CK_InventarioReservas_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_InventarioReservas_Precio CHECK (PrecioUnitario >= 0),
    CONSTRAINT CK_InventarioReservas_Estado CHECK (Estado IN (N'Activa', N'Consumida', N'Liberada', N'Expirada'))
);
CREATE INDEX IX_InventarioReservas_Estado_ExpiraEn ON dbo.InventarioReservas (Estado, ExpiraEn);
CREATE INDEX IX_InventarioReservas_Carrito_Estado ON dbo.InventarioReservas (IDCarrito, Estado);
CREATE INDEX IX_InventarioReservas_Variante ON dbo.InventarioReservas (IDVariante);
GO

/* ══ Pedidos ══════════════════════════════════════════════════════════════ */

CREATE TABLE dbo.PedidoEstados (
    IDEstado         INT          NOT NULL IDENTITY(1, 1),
    Codigo           NVARCHAR(20) NOT NULL,
    Nombre           NVARCHAR(50) NOT NULL,
    CuentaComoVenta  BIT          NOT NULL,
    Orden            INT          NOT NULL,
    CONSTRAINT PK_PedidoEstados PRIMARY KEY (IDEstado),
    CONSTRAINT UQ_PedidoEstados_Codigo UNIQUE (Codigo)
);
GO

CREATE TABLE dbo.PedidoTransiciones (
    IDTransicion    INT          NOT NULL IDENTITY(1, 1),
    IDEstadoOrigen  INT          NOT NULL,
    IDEstadoDestino INT          NOT NULL,
    Mecanismo       NVARCHAR(12) NOT NULL,
    PermiteCliente  BIT          NOT NULL CONSTRAINT DF_PedidoTransiciones_PermiteCliente DEFAULT 0,
    CONSTRAINT PK_PedidoTransiciones PRIMARY KEY (IDTransicion),
    CONSTRAINT UQ_PedidoTransiciones_Origen_Destino UNIQUE (IDEstadoOrigen, IDEstadoDestino),
    CONSTRAINT FK_PedidoTransiciones_Origen FOREIGN KEY (IDEstadoOrigen) REFERENCES dbo.PedidoEstados (IDEstado),
    CONSTRAINT FK_PedidoTransiciones_Destino FOREIGN KEY (IDEstadoDestino) REFERENCES dbo.PedidoEstados (IDEstado),
    CONSTRAINT CK_PedidoTransiciones_Mecanismo CHECK (Mecanismo IN (N'Manual', N'Cancelacion', N'Devolucion'))
);
CREATE INDEX IX_PedidoTransiciones_Destino ON dbo.PedidoTransiciones (IDEstadoDestino);
GO

CREATE SEQUENCE dbo.Seq_NumeroPedido AS INT START WITH 1 INCREMENT BY 1 NO CYCLE CACHE 50;
GO

CREATE TABLE dbo.Pedidos (
    IDPedido            INT              NOT NULL IDENTITY(1, 1),
    NumeroPedido        NVARCHAR(30)     NOT NULL,
    IDUsuario           INT              NOT NULL,
    IDEstado            INT              NOT NULL,
    IDDireccion         INT              NULL,
    DirDestinatario     NVARCHAR(100)    NOT NULL,
    DirLinea1           NVARCHAR(200)    NOT NULL,
    DirLinea2           NVARCHAR(200)    NULL,
    DirCiudad           NVARCHAR(100)    NOT NULL,
    DirDepartamento     NVARCHAR(30)     NOT NULL,
    DirCodigoPostal     NVARCHAR(10)     NULL,
    DirTelefono         NVARCHAR(20)     NOT NULL,
    IDMetodoEnvio       INT              NOT NULL,
    MetodoEnvioNombre   NVARCHAR(50)     NOT NULL,
    IDCupon             INT              NULL,
    CuponCodigo         NVARCHAR(30)     NULL,
    Subtotal            DECIMAL(18, 2)   NOT NULL,
    Descuento           DECIMAL(18, 2)   NOT NULL,
    CostoEnvio          DECIMAL(18, 2)   NOT NULL,
    Total               DECIMAL(18, 2)   NOT NULL,
    LlaveIdempotencia   UNIQUEIDENTIFIER NOT NULL,
    FechaCreacion       DATETIME2(3)     NOT NULL CONSTRAINT DF_Pedidos_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion  DATETIME2(3)     NOT NULL CONSTRAINT DF_Pedidos_FechaActualizacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Pedidos PRIMARY KEY (IDPedido),
    CONSTRAINT UQ_Pedidos_NumeroPedido UNIQUE (NumeroPedido),
    -- Idempotencia por usuario: la misma llave del mismo cliente devuelve el mismo pedido.
    CONSTRAINT UQ_Pedidos_Usuario_Llave UNIQUE (IDUsuario, LlaveIdempotencia),
    CONSTRAINT FK_Pedidos_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT FK_Pedidos_Estados FOREIGN KEY (IDEstado) REFERENCES dbo.PedidoEstados (IDEstado),
    CONSTRAINT FK_Pedidos_Direcciones FOREIGN KEY (IDDireccion) REFERENCES dbo.Direcciones (IDDireccion),
    CONSTRAINT FK_Pedidos_MetodosEnvio FOREIGN KEY (IDMetodoEnvio) REFERENCES dbo.MetodosEnvio (IDMetodoEnvio),
    CONSTRAINT FK_Pedidos_Cupones FOREIGN KEY (IDCupon) REFERENCES dbo.Cupones (IDCupon),
    CONSTRAINT CK_Pedidos_Montos CHECK (Subtotal >= 0 AND Descuento >= 0 AND CostoEnvio >= 0 AND Total >= 0),
    CONSTRAINT CK_Pedidos_DescuentoMaximo CHECK (Descuento <= Subtotal),
    CONSTRAINT CK_Pedidos_Total CHECK (Total = Subtotal - Descuento + CostoEnvio)
);
CREATE INDEX IX_Pedidos_Estado_Fecha ON dbo.Pedidos (IDEstado, FechaCreacion);
CREATE INDEX IX_Pedidos_Usuario_Fecha ON dbo.Pedidos (IDUsuario, FechaCreacion);
CREATE INDEX IX_Pedidos_Fecha ON dbo.Pedidos (FechaCreacion) INCLUDE (IDEstado, Total);
CREATE INDEX IX_Pedidos_Direccion ON dbo.Pedidos (IDDireccion);
CREATE INDEX IX_Pedidos_MetodoEnvio ON dbo.Pedidos (IDMetodoEnvio);
CREATE INDEX IX_Pedidos_Cupon ON dbo.Pedidos (IDCupon);
GO

CREATE TABLE dbo.PedidoLineas (
    IDPedidoLinea   INT            NOT NULL IDENTITY(1, 1),
    IDPedido        INT            NOT NULL,
    IDVariante      INT            NOT NULL,
    IDCategoria     INT            NOT NULL,
    SKU             NVARCHAR(50)   NOT NULL,
    NombreProducto  NVARCHAR(150)  NOT NULL,
    AtributosJson   NVARCHAR(1000) NOT NULL,
    Cantidad        INT            NOT NULL,
    PrecioUnitario  DECIMAL(18, 2) NOT NULL,
    DescuentoLinea  DECIMAL(18, 2) NOT NULL CONSTRAINT DF_PedidoLineas_Descuento DEFAULT 0,
    TotalLinea      DECIMAL(18, 2) NOT NULL,
    CONSTRAINT PK_PedidoLineas PRIMARY KEY (IDPedidoLinea),
    CONSTRAINT FK_PedidoLineas_Pedidos FOREIGN KEY (IDPedido) REFERENCES dbo.Pedidos (IDPedido),
    CONSTRAINT FK_PedidoLineas_Variantes FOREIGN KEY (IDVariante) REFERENCES dbo.ProductoVariantes (IDVariante),
    CONSTRAINT FK_PedidoLineas_Categorias FOREIGN KEY (IDCategoria) REFERENCES dbo.Categorias (IDCategoria),
    CONSTRAINT CK_PedidoLineas_Atributos CHECK (ISJSON(AtributosJson) = 1),
    CONSTRAINT CK_PedidoLineas_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_PedidoLineas_Precio CHECK (PrecioUnitario >= 0 AND DescuentoLinea >= 0),
    CONSTRAINT CK_PedidoLineas_Total CHECK (TotalLinea = Cantidad * PrecioUnitario - DescuentoLinea AND TotalLinea >= 0)
);
CREATE INDEX IX_PedidoLineas_Pedido ON dbo.PedidoLineas (IDPedido);
CREATE INDEX IX_PedidoLineas_Variante ON dbo.PedidoLineas (IDVariante);
CREATE INDEX IX_PedidoLineas_Categoria ON dbo.PedidoLineas (IDCategoria);
GO

CREATE TABLE dbo.PedidoEstadoHistorial (
    IDHistorial       INT           NOT NULL IDENTITY(1, 1),
    IDPedido          INT           NOT NULL,
    IDEstadoAnterior  INT           NULL,
    IDEstadoNuevo     INT           NOT NULL,
    IDUsuario         INT           NOT NULL,
    Nota              NVARCHAR(500) NULL,
    Fecha             DATETIME2(3)  NOT NULL CONSTRAINT DF_PedidoEstadoHistorial_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_PedidoEstadoHistorial PRIMARY KEY (IDHistorial),
    CONSTRAINT FK_PedidoEstadoHistorial_Pedidos FOREIGN KEY (IDPedido) REFERENCES dbo.Pedidos (IDPedido),
    CONSTRAINT FK_PedidoEstadoHistorial_Anterior FOREIGN KEY (IDEstadoAnterior) REFERENCES dbo.PedidoEstados (IDEstado),
    CONSTRAINT FK_PedidoEstadoHistorial_Nuevo FOREIGN KEY (IDEstadoNuevo) REFERENCES dbo.PedidoEstados (IDEstado),
    CONSTRAINT FK_PedidoEstadoHistorial_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario)
);
CREATE INDEX IX_PedidoEstadoHistorial_Pedido ON dbo.PedidoEstadoHistorial (IDPedido, Fecha);
CREATE INDEX IX_PedidoEstadoHistorial_Usuario ON dbo.PedidoEstadoHistorial (IDUsuario);
GO

CREATE TABLE dbo.Devoluciones (
    IDDevolucion  INT            NOT NULL IDENTITY(1, 1),
    IDPedido      INT            NOT NULL,
    IDUsuario     INT            NOT NULL,
    Motivo        NVARCHAR(500)  NOT NULL,
    MontoTotal    DECIMAL(18, 2) NOT NULL,
    Fecha         DATETIME2(3)   NOT NULL CONSTRAINT DF_Devoluciones_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Devoluciones PRIMARY KEY (IDDevolucion),
    CONSTRAINT FK_Devoluciones_Pedidos FOREIGN KEY (IDPedido) REFERENCES dbo.Pedidos (IDPedido),
    CONSTRAINT FK_Devoluciones_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT CK_Devoluciones_Monto CHECK (MontoTotal >= 0)
);
CREATE INDEX IX_Devoluciones_Pedido ON dbo.Devoluciones (IDPedido);
CREATE INDEX IX_Devoluciones_Usuario ON dbo.Devoluciones (IDUsuario);
GO

CREATE TABLE dbo.DevolucionLineas (
    IDDevolucionLinea  INT            NOT NULL IDENTITY(1, 1),
    IDDevolucion       INT            NOT NULL,
    IDPedidoLinea      INT            NOT NULL,
    Cantidad           INT            NOT NULL,
    MontoReembolso     DECIMAL(18, 2) NOT NULL,
    CONSTRAINT PK_DevolucionLineas PRIMARY KEY (IDDevolucionLinea),
    CONSTRAINT FK_DevolucionLineas_Devoluciones FOREIGN KEY (IDDevolucion) REFERENCES dbo.Devoluciones (IDDevolucion),
    CONSTRAINT FK_DevolucionLineas_PedidoLineas FOREIGN KEY (IDPedidoLinea) REFERENCES dbo.PedidoLineas (IDPedidoLinea),
    CONSTRAINT CK_DevolucionLineas_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_DevolucionLineas_Monto CHECK (MontoReembolso >= 0)
);
CREATE INDEX IX_DevolucionLineas_Devolucion ON dbo.DevolucionLineas (IDDevolucion);
CREATE INDEX IX_DevolucionLineas_PedidoLinea ON dbo.DevolucionLineas (IDPedidoLinea);
GO

CREATE TABLE dbo.CuponUsos (
    IDCuponUso  INT          NOT NULL IDENTITY(1, 1),
    IDCupon     INT          NOT NULL,
    IDUsuario   INT          NOT NULL,
    IDPedido    INT          NOT NULL,
    Fecha       DATETIME2(3) NOT NULL CONSTRAINT DF_CuponUsos_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_CuponUsos PRIMARY KEY (IDCuponUso),
    CONSTRAINT UQ_CuponUsos_Pedido UNIQUE (IDPedido),
    CONSTRAINT FK_CuponUsos_Cupones FOREIGN KEY (IDCupon) REFERENCES dbo.Cupones (IDCupon),
    CONSTRAINT FK_CuponUsos_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT FK_CuponUsos_Pedidos FOREIGN KEY (IDPedido) REFERENCES dbo.Pedidos (IDPedido)
);
CREATE INDEX IX_CuponUsos_Cupon_Usuario ON dbo.CuponUsos (IDCupon, IDUsuario);
CREATE INDEX IX_CuponUsos_Usuario ON dbo.CuponUsos (IDUsuario);
GO

/* ══ Inventario: kardex (depende de Pedidos y Devoluciones) ═══════════════ */

CREATE TABLE dbo.InventarioKardex (
    IDKardex            INT           NOT NULL IDENTITY(1, 1),
    IDVariante          INT           NOT NULL,
    TipoMovimiento      NVARCHAR(12)  NOT NULL,
    Cantidad            INT           NOT NULL,   -- con signo: Venta < 0
    CantidadResultante  INT           NOT NULL,   -- existencia física tras el movimiento
    Motivo              NVARCHAR(200) NOT NULL,
    IDUsuario           INT           NOT NULL,
    IDPedido            INT           NULL,
    IDDevolucion        INT           NULL,
    Fecha               DATETIME2(3)  NOT NULL CONSTRAINT DF_InventarioKardex_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_InventarioKardex PRIMARY KEY (IDKardex),
    CONSTRAINT FK_InventarioKardex_Variantes FOREIGN KEY (IDVariante) REFERENCES dbo.ProductoVariantes (IDVariante),
    CONSTRAINT FK_InventarioKardex_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT FK_InventarioKardex_Pedidos FOREIGN KEY (IDPedido) REFERENCES dbo.Pedidos (IDPedido),
    CONSTRAINT FK_InventarioKardex_Devoluciones FOREIGN KEY (IDDevolucion) REFERENCES dbo.Devoluciones (IDDevolucion),
    CONSTRAINT CK_InventarioKardex_Tipo CHECK (
        TipoMovimiento IN (N'Entrada', N'Venta', N'Ajuste', N'Devolucion', N'Cancelacion')),
    CONSTRAINT CK_InventarioKardex_Signo CHECK (
           (TipoMovimiento = N'Entrada' AND Cantidad > 0)
        OR (TipoMovimiento = N'Venta' AND Cantidad < 0)
        OR (TipoMovimiento = N'Ajuste' AND Cantidad <> 0)
        OR (TipoMovimiento IN (N'Devolucion', N'Cancelacion') AND Cantidad > 0)),
    CONSTRAINT CK_InventarioKardex_Resultante CHECK (CantidadResultante >= 0)
);
CREATE INDEX IX_InventarioKardex_Variante_Fecha ON dbo.InventarioKardex (IDVariante, Fecha);
CREATE INDEX IX_InventarioKardex_Usuario ON dbo.InventarioKardex (IDUsuario);
CREATE INDEX IX_InventarioKardex_Pedido ON dbo.InventarioKardex (IDPedido);
CREATE INDEX IX_InventarioKardex_Devolucion ON dbo.InventarioKardex (IDDevolucion);
GO

/* ══ Bitácora (solo INSERT; triggers de inmutabilidad en 009) ═════════════ */

CREATE TABLE dbo.Bitacora (
    IDBitacora     BIGINT        NOT NULL IDENTITY(1, 1),
    IDUsuario      INT           NULL,   -- NULL solo para acciones del sistema (job de reservas)
    Modulo         NVARCHAR(30)  NOT NULL,
    Entidad        NVARCHAR(50)  NOT NULL,
    IDEntidad      INT           NOT NULL,
    Accion         NVARCHAR(12)  NOT NULL,
    ValorAnterior  NVARCHAR(MAX) NULL,
    ValorNuevo     NVARCHAR(MAX) NULL,
    Fecha          DATETIME2(3)  NOT NULL CONSTRAINT DF_Bitacora_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Bitacora PRIMARY KEY (IDBitacora),
    CONSTRAINT FK_Bitacora_Usuarios FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuarios (IDUsuario),
    CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN (N'Alta', N'Cambio', N'Baja', N'Movimiento', N'Transicion')),
    CONSTRAINT CK_Bitacora_ValorAnterior CHECK (ValorAnterior IS NULL OR ISJSON(ValorAnterior) = 1),
    CONSTRAINT CK_Bitacora_ValorNuevo CHECK (ValorNuevo IS NULL OR ISJSON(ValorNuevo) = 1)
);
CREATE INDEX IX_Bitacora_Modulo_Fecha ON dbo.Bitacora (Modulo, Fecha);
CREATE INDEX IX_Bitacora_Usuario ON dbo.Bitacora (IDUsuario);
CREATE INDEX IX_Bitacora_Entidad ON dbo.Bitacora (Entidad, IDEntidad);
GO
