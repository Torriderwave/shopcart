# ShopCart

Tech Challenge 360 · Grupo Pentandra. Diseño completo y decisiones en [ARQUITECTURA.md](ARQUITECTURA.md).

## Estructura

- `contracts/` — esquemas zod, tipos y códigos de error compartidos por API y web
- `db/` — scripts SQL numerados (migraciones) + `run.mjs`
- `api/` — Node + Express + TypeScript (`strict`)
- `web/` — React + Vite (Fase 2)

## Arranque (máquina limpia)

Requisitos: Node ≥ 24, Docker con Compose.

```bash
cp .env.example .env        # ajusta las contraseñas
docker compose up -d --wait # SQL Server 2022 Express; espera al healthcheck
npm install
npm run db:setup            # recrea la BD y aplica los scripts de db/scripts
npm run dev                 # API en http://localhost:3000/api/v1
```

Comprobación: `curl localhost:3000/api/v1/health` → `{"success":true,"data":{"status":"ok","db":"up"}}`

## Comandos

| Comando              | Qué hace                                                |
| -------------------- | ------------------------------------------------------- |
| `npm run db:setup`   | `DROP DATABASE` + aplica todos los scripts (desarrollo) |
| `npm run db:migrate` | Aplica solo los scripts pendientes (verifica checksums) |
| `npm test`           | Reconstruye la BD y corre las pruebas de la API         |
| `npm run lint`       | ESLint (incluye reglas de dependencias) + Prettier      |
| `npm run typecheck`  | `tsc --noEmit` en todos los workspaces                  |

> En construcción: credenciales de prueba, ERD, diagrama de estados y decisiones se documentan aquí al cerrar la Fase 1.
