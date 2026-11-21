import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/* Build de la demo estática (sin API ni SQL Server): `npm run build:demo -w web`.
   Config aparte de vite.config.ts: el build de producción no la toca ni la importa.
   Ruta base: DEMO_BASE_PATH (por defecto /demos/shopcart/). */

const aqui = fileURLToPath(new URL('.', import.meta.url));
const normalizar = (p: string): string => `/${p.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const base = normalizar(process.env.DEMO_BASE_PATH ?? '/demos/shopcart/');

/** GitHub Pages sirve 404.html para rutas desconocidas: la misma SPA (el router usa hash, así que basta). */
const fallback404 = (): Plugin => ({
  name: 'demo-404-fallback',
  apply: 'build',
  closeBundle() {
    const out = resolve(aqui, 'dist-demo');
    if (existsSync(resolve(out, 'index.html'))) {
      copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'));
    }
  },
});

/** Dos rutas absolutas del front (/productos/… y "/" en el ErrorBoundary) asumen que el sitio vive en la raíz.
 *  Solo en este build se reescriben para respetar la ruta base; el código de producción no cambia. */
const rutasBase = (): Plugin => ({
  name: 'demo-base-paths',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/features/catalog/Hero.tsx')) {
      return code.replaceAll('src={`/productos/', 'src={`${import.meta.env.BASE_URL}productos/');
    }
    if (id.endsWith('/shared/ui/ErrorBoundary.tsx')) {
      return code.replaceAll(
        "window.location.assign('/')",
        'window.location.assign(import.meta.env.BASE_URL)',
      );
    }
    return null;
  },
});

export default defineConfig({
  root: resolve(aqui, 'demo'),
  base,
  publicDir: resolve(aqui, 'public'),
  plugins: [rutasBase(), react(), fallback404()],
  resolve: {
    alias: [
      // Solo App.tsx importa este specifier: la demo le inyecta los botones «Entrar como demo»
      // envolviendo la página de login original (sin editar el archivo de producción).
      {
        find: /^\.\/features\/auth\/AuthPages$/,
        replacement: resolve(aqui, 'src/demo/AuthPagesDemo.tsx'),
      },
    ],
  },
  css: { postcss: aqui },
  server: { fs: { allow: [resolve(aqui, '..')] } },
  build: { outDir: resolve(aqui, 'dist-demo'), emptyOutDir: true },
});
