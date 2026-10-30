import sql from 'mssql';
import { config } from './config';
import { AppError, mapSqlError } from './errors';
import { logger } from './logger';

/**
 * Único punto de acceso a la BD: invoca stored procedures con parámetros tipados.
 * Aquí no hay SQL (solo nombres de SP); la API conecta como `shopcart_app` (solo EXECUTE).
 */

export type SqlType = sql.ISqlType | sql.ISqlTypeFactoryWithNoParams;

export interface SpParam {
  type: SqlType;
  value: unknown;
}
export type SpParams = Record<string, SpParam>;
export type Row = Record<string, unknown>;

export interface SpResult {
  recordsets: Row[][];
  returnValue: number;
}

// Atajos de tipos para los repositories: p(T.Int, 5)
export const T = sql;
export const p = (type: SqlType, value: unknown): SpParam => ({ type, value });

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getPool(): Promise<sql.ConnectionPool> {
  poolPromise ??= new sql.ConnectionPool({
    server: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_APP_USER,
    password: config.DB_APP_PASSWORD,
    options: { encrypt: true, trustServerCertificate: config.NODE_ENV !== 'production' },
    pool: { max: 20, min: 2, idleTimeoutMillis: 30_000 },
    requestTimeout: 15_000,
  })
    .connect()
    .catch((err: unknown) => {
      poolPromise = undefined; // permite reintentar en la siguiente petición
      throw err;
    });
  return poolPromise;
}

export async function closePool(): Promise<void> {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = undefined;
  await pool.close();
}

/** `IDProducto` → `idProducto`, `SKU` → `sku`, `TotalFilas` → `totalFilas`. */
export function camelKey(key: string): string {
  const run = /^[A-Z]+/.exec(key)?.[0];
  if (!run) return key;
  if (run.length === key.length) return key.toLowerCase();
  if (run.length === 1) return key[0]!.toLowerCase() + key.slice(1);
  const next = key[run.length]!;
  if (/[a-z]/.test(next))
    return run.slice(0, -1).toLowerCase() + run.slice(-1) + key.slice(run.length);
  return run.toLowerCase() + key.slice(run.length);
}

function camelRow(row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camelKey(k)] = v;
  return out;
}

const MAX_DEADLOCK_RETRIES = 2;

/**
 * Ejecuta `SP_Modulo_Proceso`. Los parámetros se pasan por nombre (sin `@`).
 * Los recordsets se devuelven con claves en camelCase. Ante un deadlock (1205) la transacción
 * ya hizo rollback, así que se reintenta hasta 2 veces; los demás errores se traducen a AppError.
 */
export async function executeSp(name: string, params: SpParams = {}): Promise<SpResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const pool = await getPool();
      const request = pool.request();
      for (const [key, { type, value }] of Object.entries(params)) {
        request.input(key, type as sql.ISqlType, value);
      }
      const result = await request.execute(name);
      return {
        recordsets: (result.recordsets as unknown as Record<string, unknown>[][]).map((rs) =>
          rs.map(camelRow),
        ),
        returnValue: result.returnValue as number,
      };
    } catch (err) {
      const mapped = mapSqlError(err);
      if (mapped?.code === 'CONCURRENCIA' && attempt < MAX_DEADLOCK_RETRIES) {
        logger.warn({ sp: name, attempt: attempt + 1 }, 'Deadlock; reintentando');
        continue;
      }
      if (mapped) throw mapped;
      if (err instanceof AppError) throw err;
      throw err;
    }
  }
}

/** Fecha de SQL Server → ISO 8601 UTC (`2026-10-29T18:00:00.000Z`). */
export const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/** Separa `totalFilas` (COUNT(*) OVER ()) de las filas de un listado paginado. */
export function pageRows(rows: Row[]): { items: Row[]; total: number } {
  const total = Number(rows[0]?.totalFilas ?? 0);
  return { items: rows.map(({ totalFilas: _t, ...rest }) => rest), total };
}

/** Primera fila del primer recordset (o undefined). */
export function firstRow(result: SpResult): Row | undefined {
  return result.recordsets[0]?.[0];
}
