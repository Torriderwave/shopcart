/* =============================================================================
   004_sp_auth.sql — Bitácora (registro), roles, auth, usuarios y direcciones.
   (i) = SP interno: solo lo llaman otros SPs; no abre transacción.
   Errores: 50040 refresh inválido · 50043 prohibido · 50044 no encontrado ·
            50099 regla de negocio genérica (HTTP 400).
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ── (i) Bitácora: registro. Debe correr dentro de la transacción del cambio. ── */
CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Registrar
    @IDUsuario      INT,
    @Modulo         NVARCHAR(30),
    @Entidad        NVARCHAR(50),
    @IDEntidad      INT,
    @Accion         NVARCHAR(12),
    @ValorAnterior  NVARCHAR(MAX) = NULL,
    @ValorNuevo     NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0
        THROW 50098, N'SP_Bitacora_Registrar debe ejecutarse dentro de una transacción.', 1;

    INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
    VALUES (@IDUsuario, @Modulo, @Entidad, @IDEntidad, @Accion, @ValorAnterior, @ValorNuevo);
END
GO

/* ── (i) Exige que el usuario de sesión exista, esté activo y tenga uno de los roles ── */
CREATE OR ALTER PROCEDURE dbo.SP_Auth_ExigirRol
    @IDUsuarioSesion INT,
    @Roles           NVARCHAR(100),     -- lista separada por comas
    @Rol             NVARCHAR(20) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @Rol = Rol FROM dbo.Usuarios WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1;

    IF @Rol IS NULL
       OR NOT EXISTS (SELECT 1 FROM STRING_SPLIT(@Roles, N',') WHERE LTRIM(RTRIM(value)) = @Rol)
        THROW 50043, N'No tienes permiso para realizar esta acción.', 1;
END
GO

/* ══ Auth ═══════════════════════════════════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Auth_RegistrarCliente
    @Correo          NVARCHAR(254),
    @HashContrasena  NVARCHAR(255),
    @Nombre          NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @ID INT;
        BEGIN TRAN;
            INSERT INTO dbo.Usuarios (Correo, HashContrasena, Nombre, Rol)
            VALUES (LOWER(LTRIM(RTRIM(@Correo))), @HashContrasena, LTRIM(RTRIM(@Nombre)), N'Cliente');
            SET @ID = SCOPE_IDENTITY();

            DECLARE @Nuevo NVARCHAR(MAX) = (
                SELECT Correo, Nombre, Rol, Activo FROM dbo.Usuarios WHERE IDUsuario = @ID
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @ID, N'Usuarios', N'Usuario', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;

        SELECT IDUsuario, Correo, Nombre, Rol, Activo FROM dbo.Usuarios WHERE IDUsuario = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Auth_ObtenerUsuarioPorCorreo
    @Correo NVARCHAR(254)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IDUsuario, Correo, HashContrasena, Nombre, Rol, Activo
    FROM dbo.Usuarios
    WHERE Correo = LOWER(LTRIM(RTRIM(@Correo)));
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Auth_ObtenerUsuarioPorId
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IDUsuario, Correo, Nombre, Rol, Activo, FechaCreacion
    FROM dbo.Usuarios
    WHERE IDUsuario = @IDUsuario;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Auth_GuardarRefreshToken
    @IDUsuario  INT,
    @TokenHash  CHAR(64),
    @Familia    UNIQUEIDENTIFIER = NULL,
    @ExpiraEn   DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    SET @Familia = ISNULL(@Familia, NEWID());
    INSERT INTO dbo.RefreshTokens (IDUsuario, TokenHash, Familia, ExpiraEn)
    VALUES (@IDUsuario, @TokenHash, @Familia, @ExpiraEn);
    SELECT @Familia AS Familia;
END
GO

/* Rota el refresh token. Si el token ya fue usado (reuso), está vencido o el usuario fue
   desactivado, revoca TODA la familia y responde 50040. La revocación se confirma (COMMIT)
   antes del THROW para que no se deshaga. */
CREATE OR ALTER PROCEDURE dbo.SP_Auth_RotarRefreshToken
    @TokenHash       CHAR(64),
    @NuevoTokenHash  CHAR(64),
    @ExpiraEn        DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Invalido BIT = 0, @IDUsuario INT;
    BEGIN TRY
        BEGIN TRAN;
            DECLARE @IDToken INT, @Familia UNIQUEIDENTIFIER, @Revocado BIT, @Expira DATETIME2(3), @Activo BIT;

            SELECT @IDToken = t.IDRefreshToken, @IDUsuario = t.IDUsuario, @Familia = t.Familia,
                   @Revocado = t.Revocado, @Expira = t.ExpiraEn, @Activo = u.Activo
            FROM dbo.RefreshTokens AS t WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.Usuarios AS u ON u.IDUsuario = t.IDUsuario
            WHERE t.TokenHash = @TokenHash;

            IF @IDToken IS NULL
                SET @Invalido = 1;
            ELSE IF @Revocado = 1 OR @Expira <= SYSUTCDATETIME() OR @Activo = 0
            BEGIN
                UPDATE dbo.RefreshTokens SET Revocado = 1 WHERE Familia = @Familia AND Revocado = 0;
                SET @Invalido = 1;
            END
            ELSE
            BEGIN
                INSERT INTO dbo.RefreshTokens (IDUsuario, TokenHash, Familia, ExpiraEn)
                VALUES (@IDUsuario, @NuevoTokenHash, @Familia, @ExpiraEn);
                UPDATE dbo.RefreshTokens
                   SET Revocado = 1, ReemplazadoPor = SCOPE_IDENTITY()
                 WHERE IDRefreshToken = @IDToken;
            END
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH

    IF @Invalido = 1
        THROW 50040, N'La sesión no es válida. Inicia sesión de nuevo.', 1;

    SELECT @IDUsuario AS IDUsuario;
END
GO

-- Logout: revoca la familia del token presentado (idempotente; un token desconocido no es error).
CREATE OR ALTER PROCEDURE dbo.SP_Auth_RevocarRefreshToken
    @TokenHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t SET Revocado = 1
    FROM dbo.RefreshTokens AS t
    WHERE t.Revocado = 0
      AND t.Familia = (SELECT Familia FROM dbo.RefreshTokens WHERE TokenHash = @TokenHash);
END
GO

/* ══ Usuarios (Administrador) ═══════════════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Auth_CrearUsuario
    @IDUsuarioSesion INT,
    @Correo          NVARCHAR(254),
    @HashContrasena  NVARCHAR(255),
    @Nombre          NVARCHAR(100),
    @Rol             NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';
        DECLARE @ID INT;
        BEGIN TRAN;
            INSERT INTO dbo.Usuarios (Correo, HashContrasena, Nombre, Rol)
            VALUES (LOWER(LTRIM(RTRIM(@Correo))), @HashContrasena, LTRIM(RTRIM(@Nombre)), @Rol);
            SET @ID = SCOPE_IDENTITY();

            DECLARE @Nuevo NVARCHAR(MAX) = (
                SELECT Correo, Nombre, Rol, Activo FROM dbo.Usuarios WHERE IDUsuario = @ID
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Usuarios', N'Usuario', @ID, N'Alta', NULL, @Nuevo;
        COMMIT;

        SELECT IDUsuario, Correo, Nombre, Rol, Activo, FechaCreacion FROM dbo.Usuarios WHERE IDUsuario = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Cambia nombre, rol y/o estado. Desactivar revoca todas las sesiones del usuario.
CREATE OR ALTER PROCEDURE dbo.SP_Auth_ActualizarUsuario
    @IDUsuarioSesion INT,
    @IDUsuario       INT,
    @Nombre          NVARCHAR(100) = NULL,
    @Rol             NVARCHAR(20)  = NULL,
    @Activo          BIT           = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

        BEGIN TRAN;
            DECLARE @Anterior NVARCHAR(MAX), @Existe INT;
            SELECT @Existe = IDUsuario,
                   @Anterior = (SELECT u.Correo, u.Nombre, u.Rol, u.Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM dbo.Usuarios AS u WITH (UPDLOCK)
            WHERE u.IDUsuario = @IDUsuario;

            IF @Existe IS NULL THROW 50044, N'El usuario no existe.', 1;

            IF @IDUsuario = @IDUsuarioSesion AND (@Activo = 0 OR (@Rol IS NOT NULL AND @Rol <> N'Administrador'))
                THROW 50099, N'No puedes desactivar tu cuenta ni quitarte el rol de Administrador.', 1;

            UPDATE dbo.Usuarios
               SET Nombre = ISNULL(LTRIM(RTRIM(@Nombre)), Nombre),
                   Rol    = ISNULL(@Rol, Rol),
                   Activo = ISNULL(@Activo, Activo)
             WHERE IDUsuario = @IDUsuario;

            IF @Activo = 0
                UPDATE dbo.RefreshTokens SET Revocado = 1 WHERE IDUsuario = @IDUsuario AND Revocado = 0;

            DECLARE @Nuevo NVARCHAR(MAX) = (
                SELECT Correo, Nombre, Rol, Activo FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            EXEC dbo.SP_Bitacora_Registrar @IDUsuarioSesion, N'Usuarios', N'Usuario', @IDUsuario,
                 N'Cambio', @Anterior, @Nuevo;
        COMMIT;

        SELECT IDUsuario, Correo, Nombre, Rol, Activo, FechaCreacion FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Auth_ListarUsuarios
    @IDUsuarioSesion INT,
    @Q               NVARCHAR(100) = NULL,
    @Rol             NVARCHAR(20)  = NULL,
    @Activo          BIT           = NULL,
    @OrdenarPor      NVARCHAR(20)  = N'nombre',     -- nombre | correo | rol | fecha
    @Direccion       NVARCHAR(4)   = N'asc',
    @Pagina          INT           = 1,
    @TamanoPagina    INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Administrador';

    DECLARE @Patron NVARCHAR(210) = CASE WHEN @Q IS NULL OR LTRIM(RTRIM(@Q)) = N'' THEN NULL
        ELSE N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Q)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%' END;

    SELECT IDUsuario, Correo, Nombre, Rol, Activo, FechaCreacion,
           COUNT(*) OVER () AS TotalFilas
    FROM dbo.Usuarios
    WHERE (@Patron IS NULL OR Nombre LIKE @Patron OR Correo LIKE @Patron)
      AND (@Rol IS NULL OR Rol = @Rol)
      AND (@Activo IS NULL OR Activo = @Activo)
    ORDER BY
        CASE WHEN @OrdenarPor = N'nombre' AND @Direccion = N'asc'  THEN Nombre END ASC,
        CASE WHEN @OrdenarPor = N'nombre' AND @Direccion = N'desc' THEN Nombre END DESC,
        CASE WHEN @OrdenarPor = N'correo' AND @Direccion = N'asc'  THEN Correo END ASC,
        CASE WHEN @OrdenarPor = N'correo' AND @Direccion = N'desc' THEN Correo END DESC,
        CASE WHEN @OrdenarPor = N'rol'    AND @Direccion = N'asc'  THEN Rol END ASC,
        CASE WHEN @OrdenarPor = N'rol'    AND @Direccion = N'desc' THEN Rol END DESC,
        CASE WHEN @OrdenarPor = N'fecha'  AND @Direccion = N'asc'  THEN FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = N'fecha'  AND @Direccion = N'desc' THEN FechaCreacion END DESC,
        IDUsuario
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END
GO

/* ══ Direcciones (Cliente; ownership = @IDUsuarioSesion) ════════════════════ */

CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ListarPorUsuario
    @IDUsuarioSesion INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IDDireccion, Alias, Destinatario, Linea1, Linea2, Ciudad, Departamento, CodigoPostal,
           Telefono, EsPrincipal
    FROM dbo.Direcciones
    WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1
    ORDER BY EsPrincipal DESC, IDDireccion;
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Crear
    @IDUsuarioSesion INT,
    @Alias           NVARCHAR(50),
    @Destinatario    NVARCHAR(100),
    @Linea1          NVARCHAR(200),
    @Linea2          NVARCHAR(200) = NULL,
    @Ciudad          NVARCHAR(100),
    @Departamento    NVARCHAR(30),
    @CodigoPostal    NVARCHAR(10)  = NULL,
    @Telefono        NVARCHAR(20),
    @EsPrincipal     BIT           = 0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        EXEC dbo.SP_Auth_ExigirRol @IDUsuarioSesion, N'Cliente';
        DECLARE @ID INT;
        BEGIN TRAN;
            -- La primera dirección activa siempre es la principal.
            IF NOT EXISTS (SELECT 1 FROM dbo.Direcciones WITH (UPDLOCK, HOLDLOCK)
                            WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1)
                SET @EsPrincipal = 1;

            IF @EsPrincipal = 1
                UPDATE dbo.Direcciones SET EsPrincipal = 0
                 WHERE IDUsuario = @IDUsuarioSesion AND EsPrincipal = 1;

            INSERT INTO dbo.Direcciones (IDUsuario, Alias, Destinatario, Linea1, Linea2, Ciudad,
                                         Departamento, CodigoPostal, Telefono, EsPrincipal)
            VALUES (@IDUsuarioSesion, @Alias, @Destinatario, @Linea1, @Linea2, @Ciudad,
                    @Departamento, @CodigoPostal, @Telefono, @EsPrincipal);
            SET @ID = SCOPE_IDENTITY();
        COMMIT;

        SELECT IDDireccion, Alias, Destinatario, Linea1, Linea2, Ciudad, Departamento, CodigoPostal,
               Telefono, EsPrincipal
        FROM dbo.Direcciones WHERE IDDireccion = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Actualizar
    @IDUsuarioSesion INT,
    @IDDireccion     INT,
    @Alias           NVARCHAR(50),
    @Destinatario    NVARCHAR(100),
    @Linea1          NVARCHAR(200),
    @Linea2          NVARCHAR(200) = NULL,
    @Ciudad          NVARCHAR(100),
    @Departamento    NVARCHAR(30),
    @CodigoPostal    NVARCHAR(10)  = NULL,
    @Telefono        NVARCHAR(20),
    @EsPrincipal     BIT           = 0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
            DECLARE @Dueno INT, @EraPrincipal BIT;
            SELECT @Dueno = IDUsuario, @EraPrincipal = EsPrincipal
            FROM dbo.Direcciones WITH (UPDLOCK) WHERE IDDireccion = @IDDireccion AND Activo = 1;

            IF @Dueno IS NULL THROW 50044, N'La dirección no existe.', 1;
            IF @Dueno <> @IDUsuarioSesion THROW 50043, N'La dirección no te pertenece.', 1;

            -- No se puede dejar al usuario sin dirección principal.
            IF @EraPrincipal = 1 SET @EsPrincipal = 1;
            IF @EsPrincipal = 1
                UPDATE dbo.Direcciones SET EsPrincipal = 0
                 WHERE IDUsuario = @IDUsuarioSesion AND EsPrincipal = 1 AND IDDireccion <> @IDDireccion;

            UPDATE dbo.Direcciones
               SET Alias = @Alias, Destinatario = @Destinatario, Linea1 = @Linea1, Linea2 = @Linea2,
                   Ciudad = @Ciudad, Departamento = @Departamento, CodigoPostal = @CodigoPostal,
                   Telefono = @Telefono, EsPrincipal = @EsPrincipal
             WHERE IDDireccion = @IDDireccion;
        COMMIT;

        SELECT IDDireccion, Alias, Destinatario, Linea1, Linea2, Ciudad, Departamento, CodigoPostal,
               Telefono, EsPrincipal
        FROM dbo.Direcciones WHERE IDDireccion = @IDDireccion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Soft-delete: los pedidos conservan su dirección congelada. Si era la principal, se promueve otra.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Desactivar
    @IDUsuarioSesion INT,
    @IDDireccion     INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
            DECLARE @Dueno INT, @EraPrincipal BIT;
            SELECT @Dueno = IDUsuario, @EraPrincipal = EsPrincipal
            FROM dbo.Direcciones WITH (UPDLOCK) WHERE IDDireccion = @IDDireccion AND Activo = 1;

            IF @Dueno IS NULL THROW 50044, N'La dirección no existe.', 1;
            IF @Dueno <> @IDUsuarioSesion THROW 50043, N'La dirección no te pertenece.', 1;

            UPDATE dbo.Direcciones SET Activo = 0, EsPrincipal = 0 WHERE IDDireccion = @IDDireccion;

            IF @EraPrincipal = 1
                UPDATE dbo.Direcciones SET EsPrincipal = 1
                 WHERE IDDireccion = (SELECT TOP (1) IDDireccion FROM dbo.Direcciones
                                       WHERE IDUsuario = @IDUsuarioSesion AND Activo = 1
                                       ORDER BY IDDireccion DESC);
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
