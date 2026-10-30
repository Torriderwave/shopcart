/* =============================================================================
   001_database.sql — Base de datos, login de aplicación, permisos y control de
   migraciones. Variables $(…) las sustituye db/run.mjs desde el entorno.
   ========================================================================== */

IF DB_ID(N'$(DB_NAME)') IS NULL
    CREATE DATABASE [$(DB_NAME)] COLLATE Latin1_General_100_CI_AI;
GO

ALTER DATABASE [$(DB_NAME)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO

USE [$(DB_NAME)];
GO

/* ── Login de la aplicación: solo EXECUTE (ARQUITECTURA §7.3) ─────────────── */
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(DB_APP_USER)')
    CREATE LOGIN [$(DB_APP_USER)] WITH PASSWORD = N'$(DB_APP_PASSWORD)', CHECK_POLICY = OFF;
ELSE
    ALTER LOGIN [$(DB_APP_USER)] WITH PASSWORD = N'$(DB_APP_PASSWORD)';
GO

CREATE USER [$(DB_APP_USER)] FOR LOGIN [$(DB_APP_USER)];
GO

-- Sin permisos sobre tablas, vistas ni funciones: todo acceso a datos pasa por SPs.
GRANT EXECUTE ON SCHEMA::dbo TO [$(DB_APP_USER)];
GO

/* ── Control de migraciones (solo la usa db/run.mjs) ──────────────────────── */
CREATE TABLE dbo.VersionesEsquema (
    IDVersionEsquema INT           NOT NULL IDENTITY(1, 1),
    Script           NVARCHAR(200) NOT NULL,
    Checksum         CHAR(64)      NOT NULL,
    FechaAplicacion  DATETIME2(3)  NOT NULL CONSTRAINT DF_VersionesEsquema_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_VersionesEsquema PRIMARY KEY (IDVersionEsquema),
    CONSTRAINT UQ_VersionesEsquema_Script UNIQUE (Script)
);
GO

/* ── Sistema ──────────────────────────────────────────────────────────────── */
-- Health check de la API: confirma que el pool llega a la BD sin escribir SQL en TypeScript.
CREATE OR ALTER PROCEDURE dbo.SP_Sistema_Salud
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(1 AS BIT) AS Disponible;
END
GO
