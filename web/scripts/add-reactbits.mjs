/* global fetch */
/* Descarga componentes de React Bits (https://reactbits.dev, variante TS + CSS) a src/components/reactbits.
   Uso: node web/scripts/add-reactbits.mjs Aurora BlurText ...
   El código copiado es de terceros: se marca con @ts-nocheck y se excluye de ESLint/Prettier. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const OUT = fileURLToPath(new URL('../src/components/reactbits/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const deps = new Set();
for (const n of process.argv.slice(2)) {
  const j = await (await fetch(`https://reactbits.dev/r/${n}-TS-CSS.json`)).json();
  for (const f of j.files) {
    const base = f.path.split('/').pop();
    // Parche: con React StrictMode el efecto se monta dos veces y loseContext() dejaría el canvas inservible.
    const sinLose = f.content.replace(
      /^\s*gl\.getExtension\('WEBGL_lose_context'\)\?\.loseContext\(\);\n/m,
      '',
    );
    const body = base.endsWith('.tsx')
      ? `// @ts-nocheck — código de React Bits (reactbits.dev)\n${sinLose}`
      : f.content;
    writeFileSync(OUT + base, body);
  }
  (j.dependencies ?? []).forEach((d) => deps.add(d));
}
console.log('Instala si hace falta:', [...deps].join(' ') || '(sin dependencias)');
