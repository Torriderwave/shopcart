/* =============================================================================
   009_triggers.sql — Bitácora inmutable (RF-09).
   Los triggers INSTEAD OF aplican a cualquier login (incluido sa) para UPDATE/DELETE;
   además la app no tiene permisos de tabla. Un sysadmin podría deshabilitar los
   triggers o hacer TRUNCATE: la aplicación, no.
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER TRIGGER dbo.TR_Bitacora_NoUpdate ON dbo.Bitacora
INSTEAD OF UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50070, N'La bitácora es inmutable: no puede modificarse.', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.TR_Bitacora_NoDelete ON dbo.Bitacora
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50070, N'La bitácora es inmutable: no puede eliminarse.', 1;
END
GO

DENY UPDATE, DELETE ON dbo.Bitacora TO [$(DB_APP_USER)];
GO
