/* =============================================================================
   010_seed.sql — Datos semilla reproducibles.
   Contraseña de TODOS los usuarios de prueba:  ShopCart2026!
   (hash argon2id precalculado; en producción nunca se versiona un seed así).
   ========================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ── Estados del pedido y máquina de estados (ARQUITECTURA §8.2) ─────────── */
INSERT INTO dbo.PedidoEstados (Codigo, Nombre, CuentaComoVenta, Orden) VALUES
    (N'Pagado',          N'Pagado',            1, 1),
    (N'Preparando',      N'En preparación',    1, 2),
    (N'Despachado',      N'Despachado',        1, 3),
    (N'Entregado',       N'Entregado',         1, 4),
    (N'Cancelado',       N'Cancelado',         0, 5),
    (N'DevueltoParcial', N'Devuelto parcial',  1, 6),
    (N'DevueltoTotal',   N'Devuelto total',    1, 7);
GO

INSERT INTO dbo.PedidoTransiciones (IDEstadoOrigen, IDEstadoDestino, Mecanismo, PermiteCliente)
SELECT o.IDEstado, d.IDEstado, t.Mecanismo, t.PermiteCliente
FROM (VALUES
    (N'Pagado',          N'Preparando',      N'Manual',      0),
    (N'Preparando',      N'Despachado',      N'Manual',      0),
    (N'Despachado',      N'Entregado',       N'Manual',      0),
    (N'Pagado',          N'Cancelado',       N'Cancelacion', 1),
    (N'Preparando',      N'Cancelado',       N'Cancelacion', 1),
    (N'Entregado',       N'DevueltoParcial', N'Devolucion',  0),
    (N'Entregado',       N'DevueltoTotal',   N'Devolucion',  0),
    (N'DevueltoParcial', N'DevueltoParcial', N'Devolucion',  0),
    (N'DevueltoParcial', N'DevueltoTotal',   N'Devolucion',  0)
) AS t (Origen, Destino, Mecanismo, PermiteCliente)
JOIN dbo.PedidoEstados AS o ON o.Codigo = t.Origen
JOIN dbo.PedidoEstados AS d ON d.Codigo = t.Destino;
GO

/* ── Métodos de envío ────────────────────────────────────────────────────── */
INSERT INTO dbo.MetodosEnvio (Nombre, Costo, MontoMinimo, DiasEstimados) VALUES
    (N'Envío gratis', 0.00,  200.00, 5),   -- aplica desde Q200 (tras descuento)
    (N'Estándar',     25.00, NULL,   5),
    (N'Express',      45.00, NULL,   2);
GO

/* ── Usuarios de prueba (contraseña: ShopCart2026!) ──────────────────────── */
INSERT INTO dbo.Usuarios (Correo, HashContrasena, Nombre, Rol) VALUES
    (N'admin@shopcart.test',     N'$argon2id$v=19$m=65536,t=3,p=4$f0W7j75WaXNcuzi7C5eNqQ$C6BkjZunWTvSRX9STviNvQqmgmKDGUznjrn9XQ6SDK8', N'Ana Administradora', N'Administrador'),
    (N'operador@shopcart.test',  N'$argon2id$v=19$m=65536,t=3,p=4$f0W7j75WaXNcuzi7C5eNqQ$C6BkjZunWTvSRX9STviNvQqmgmKDGUznjrn9XQ6SDK8', N'Omar Operador',      N'Operador'),
    (N'cliente@shopcart.test',   N'$argon2id$v=19$m=65536,t=3,p=4$f0W7j75WaXNcuzi7C5eNqQ$C6BkjZunWTvSRX9STviNvQqmgmKDGUznjrn9XQ6SDK8', N'Carla Cliente',       N'Cliente'),
    (N'cliente2@shopcart.test',  N'$argon2id$v=19$m=65536,t=3,p=4$f0W7j75WaXNcuzi7C5eNqQ$C6BkjZunWTvSRX9STviNvQqmgmKDGUznjrn9XQ6SDK8', N'Carlos Cliente',      N'Cliente');
GO
