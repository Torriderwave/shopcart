// Runner de migraciones de ShopCart.
//   node db/run.mjs           aplica solo los scripts pendientes
//   node db/run.mjs --reset   DROP DATABASE y aplica todo desde cero
//
// - Se conecta como sa (única pieza que lo hace; la API usa shopcart_app).
// - Divide cada script en lotes por líneas `GO`.
// - Sustituye $(VARIABLE) con variables de entorno (como sqlcmd).
// - Registra cada script aplicado con su checksum en dbo.VersionesEsquema.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // Sin .env: se usan las variables ya presentes en el entorno.
}

const env = process.env;
const reset = process.argv.includes('--reset');
const dbName = env.DB_NAME ?? 'ShopCart';

if (!/^\w+$/.test(dbName)) fail(`DB_NAME inválido: ${dbName}`);
if (!env.MSSQL_SA_PASSWORD) fail('Falta MSSQL_SA_PASSWORD (copia .env.example a .env).');

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Sustituye $(VAR); duplica comillas simples para que el valor sea seguro dentro de '...'. */
function substitute(text, file) {
  return text.replace(/\$\((\w+)\)/g, (_, name) => {
    const value = name === 'DB_NAME' ? dbName : env[name];
    if (value === undefined) fail(`${file}: variable $(${name}) no definida en el entorno.`);
    return value.replaceAll("'", "''");
  });
}

/** Lotes separados por una línea que contiene solo GO. */
function splitBatches(text) {
  const batches = [];
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*GO\s*(--.*)?$/i.test(line)) {
      batches.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  batches.push(current.join('\n'));
  return batches.filter((b) => b.trim().length > 0);
}

async function connect() {
  // max 1: el contexto de base de datos (USE) debe persistir entre lotes.
  const pool = new sql.ConnectionPool({
    server: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 1433),
    user: 'sa',
    password: env.MSSQL_SA_PASSWORD,
    database: 'master',
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 1, min: 1 },
    requestTimeout: 120_000,
  });
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await pool.connect();
      return pool;
    } catch (err) {
      if (Date.now() > deadline) fail(`No se pudo conectar a SQL Server en 60 s: ${err.message}`);
      process.stdout.write('… esperando a SQL Server\n');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function dbExists(pool) {
  const r = await pool.request().input('n', sql.NVarChar, dbName).query('SELECT DB_ID(@n) AS id');
  return r.recordset[0].id !== null;
}

async function main() {
  const files = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  if (files.length === 0) fail(`No hay scripts en ${SCRIPTS_DIR}`);

  const pool = await connect();

  if (reset && (await dbExists(pool))) {
    console.log(`↺ --reset: eliminando base de datos ${dbName}`);
    await pool.request().batch(`
      ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${dbName}];`);
  }

  const applied = new Map();
  if (await dbExists(pool)) {
    await pool.request().batch(`USE [${dbName}]`);
    const t = await pool.request().query(`SELECT OBJECT_ID(N'dbo.VersionesEsquema') AS id`);
    if (t.recordset[0].id !== null) {
      const rows = await pool.request().query('SELECT Script, Checksum FROM dbo.VersionesEsquema');
      for (const row of rows.recordset) applied.set(row.Script, row.Checksum);
    }
  }

  let ran = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
    const checksum = sha256(raw);
    const previous = applied.get(file);
    if (previous !== undefined) {
      if (previous !== checksum) {
        fail(
          `${file} ya fue aplicado y su contenido cambió. Los cambios de esquema van en un script ` +
            `nuevo (o usa "npm run db:setup" para reconstruir en desarrollo).`,
        );
      }
      console.log(`· ${file} (ya aplicado)`);
      continue;
    }

    const batches = splitBatches(substitute(raw, file));
    console.log(`▶ ${file} (${batches.length} lotes)`);
    for (const [i, batch] of batches.entries()) {
      try {
        await pool.request().batch(batch);
      } catch (err) {
        fail(`${file}, lote ${i + 1}: ${err.message}`);
      }
    }
    // Tras 001 existe la BD: el resto de scripts corre dentro de ella.
    await pool.request().batch(`USE [${dbName}]`);
    await pool
      .request()
      .input('s', sql.NVarChar(200), file)
      .input('c', sql.Char(64), checksum)
      .query('INSERT INTO dbo.VersionesEsquema (Script, Checksum) VALUES (@s, @c)');
    ran++;
  }

  await pool.close();
  console.log(ran === 0 ? '✔ Base de datos al día.' : `✔ ${ran} script(s) aplicado(s).`);
}

main().catch((err) => fail(err.message));
