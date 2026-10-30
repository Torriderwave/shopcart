// Genera docs/ERD.md (Mermaid) leyendo el catálogo real de SQL Server: nunca se desfasa del esquema.
//   node db/erd.mjs        (o: npm run docs:erd)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // Sin .env: se usan las variables del entorno.
}

const DOMINIOS = [
  [
    'Seguridad y direcciones',
    'Usuarios, sesiones (refresh tokens) y direcciones de entrega.',
    ['Usuarios', 'RefreshTokens', 'Direcciones'],
  ],
  [
    'Catálogo e inventario',
    'Productos con variantes, existencias, reservas temporales y kardex.',
    [
      'Categorias',
      'Productos',
      'ProductoVariantes',
      'ProductoImagenes',
      'InventarioExistencias',
      'InventarioReservas',
      'InventarioKardex',
    ],
  ],
  [
    'Carrito, cupones y envío',
    'Carrito de cliente o invitado, cupones con sus usos y métodos de envío.',
    [
      'Carritos',
      'CarritoLineas',
      'Cupones',
      'CuponUsos',
      'MetodosEnvio',
      'Usuarios',
      'ProductoVariantes',
      'Pedidos',
    ],
  ],
  [
    'Pedidos y devoluciones',
    'Pedido con precios congelados, ciclo de vida (estados y transiciones) y devoluciones por línea.',
    [
      'Pedidos',
      'PedidoLineas',
      'PedidoEstados',
      'PedidoTransiciones',
      'PedidoEstadoHistorial',
      'Devoluciones',
      'DevolucionLineas',
      'Usuarios',
      'Direcciones',
      'MetodosEnvio',
      'Cupones',
      'ProductoVariantes',
    ],
  ],
  [
    'Auditoría',
    'Bitácora inmutable (triggers INSTEAD OF) y control de migraciones.',
    ['Bitacora', 'Usuarios'],
  ],
];

const pool = await new sql.ConnectionPool({
  server: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 1433),
  user: 'sa',
  password: process.env.MSSQL_SA_PASSWORD,
  database: process.env.DB_NAME ?? 'ShopCart',
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const cols = (
  await pool.request().query(`
  SELECT t.name AS tabla, c.name AS col, ty.name AS tipo, c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
         CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS es_pk,
         CASE WHEN EXISTS (SELECT 1 FROM sys.foreign_key_columns fc WHERE fc.parent_object_id = t.object_id AND fc.parent_column_id = c.column_id) THEN 1 ELSE 0 END AS es_fk,
         CASE WHEN EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                            WHERE i.object_id = t.object_id AND i.is_unique = 1 AND i.is_primary_key = 0 AND ic.column_id = c.column_id
                              AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = i.object_id AND x.index_id = i.index_id) = 1) THEN 1 ELSE 0 END AS es_uq
  FROM sys.tables t
  JOIN sys.columns c ON c.object_id = t.object_id
  JOIN sys.types ty ON ty.user_type_id = c.user_type_id
  LEFT JOIN (SELECT ic.object_id, ic.column_id FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id WHERE i.is_primary_key = 1) pk
         ON pk.object_id = t.object_id AND pk.column_id = c.column_id
  ORDER BY t.name, c.column_id`)
).recordset;

const fks = (
  await pool.request().query(`
  SELECT pt.name AS hijo, rt.name AS padre, pc.name AS col, pc.is_nullable AS nullable, f.name AS fk
  FROM sys.foreign_keys f
  JOIN sys.tables pt ON pt.object_id = f.parent_object_id
  JOIN sys.tables rt ON rt.object_id = f.referenced_object_id
  JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = f.object_id
  JOIN sys.columns pc ON pc.object_id = fc.parent_object_id AND pc.column_id = fc.parent_column_id
  ORDER BY pt.name, f.name`)
).recordset;
await pool.close();

const tipo = (c) => {
  const t = c.tipo;
  if (t === 'nvarchar' || t === 'varchar')
    return `${t}(${c.max_length === -1 ? 'max' : t === 'nvarchar' ? c.max_length / 2 : c.max_length})`;
  if (t === 'decimal') return `decimal(${c.precision}_${c.scale})`;
  if (t === 'datetime2') return `datetime2(${c.scale})`;
  if (t === 'char') return `char(${c.max_length})`;
  return t;
};

function entidad(nombre) {
  const filas = cols
    .filter((c) => c.tabla === nombre)
    .map((c) => {
      const marcas = [c.es_pk ? 'PK' : '', c.es_fk ? 'FK' : '', c.es_uq ? 'UK' : '']
        .filter(Boolean)
        .join(',');
      return `    ${tipo(c)} ${c.col}${marcas ? ' ' + marcas : ''}${c.is_nullable ? ' "null"' : ''}`;
    });
  return `  ${nombre} {\n${filas.join('\n')}\n  }`;
}

function diagrama(tablas) {
  const set = new Set(tablas);
  const rel = fks.filter((f) => set.has(f.hijo) && set.has(f.padre));
  // Auto-referencias o múltiples FK al mismo padre: una línea por columna.
  const lineas = rel.map(
    (f) => `  ${f.padre} ${f.nullable ? '|o' : '||'}--o{ ${f.hijo} : "${f.col}"`,
  );
  return ['```mermaid', 'erDiagram', ...tablas.map(entidad), ...lineas, '```'].join('\n');
}

const todas = [...new Set(cols.map((c) => c.tabla))].filter((t) => t !== 'VersionesEsquema');
let md = `# Diagrama entidad-relación

> Generado desde el catálogo de SQL Server por \`db/erd.mjs\` (\`npm run docs:erd\`): refleja el esquema real, no un dibujo manual.
> ${todas.length} tablas de dominio (más \`VersionesEsquema\`, que solo usa el runner de migraciones).
> Notación: \`PK\` llave primaria · \`FK\` llave foránea · \`UK\` única · \`"null"\` admite NULL. Relaciones: \`||--o{\` uno a muchos obligatorio, \`|o--o{\` opcional.

## Vista general

${diagrama(todas)}
`;
for (const [titulo, desc, tablas] of DOMINIOS) {
  md += `\n## ${titulo}\n\n${desc}\n\n${diagrama(tablas)}\n`;
}
const out = path.join(__dirname, '..', 'docs', 'ERD.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`✔ ${todas.length} tablas, ${fks.length} relaciones → docs/ERD.md`);
