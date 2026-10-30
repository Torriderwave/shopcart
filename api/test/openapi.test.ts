import SwaggerParser from '@apidevtools/swagger-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { documentedRoutes, buildOpenApi } from '../src/openapi';
import { api, app, closeAll } from './helpers';

afterAll(closeAll);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Rutas realmente registradas en Express bajo /api/v1 (método + ruta). */
function registeredRoutes(): string[] {
  const out: string[] = [];
  const walk = (stack: Layer[]): void => {
    for (const l of stack) {
      if (l.route) {
        for (const m of Object.keys(l.route.methods)) {
          out.push(`${m.toUpperCase()} /api/v1${l.route.path}`);
        }
      } else if (l.handle?.stack) walk(l.handle.stack);
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
  return out.sort();
}

describe('OpenAPI', () => {
  it('el documento es OpenAPI válido y todas las referencias resuelven', async () => {
    const spec = JSON.parse(JSON.stringify(buildOpenApi()));
    await expect(SwaggerParser.validate(spec)).resolves.toBeTruthy();
  });

  it('documenta exactamente las rutas que Express registra (sin faltantes ni sobrantes)', () => {
    const reales = registeredRoutes().filter((r) => !r.includes('/openapi.json'));
    expect(reales.length).toBeGreaterThan(50);
    expect(documentedRoutes()).toEqual(reales);
  });

  it('se sirve en /api/openapi.json y la UI en /api/docs', async () => {
    const json = await api().get('/api/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.info.title).toBe('ShopCart API');
    expect(Object.keys(json.body.paths).length).toBeGreaterThan(40);
    const ui = await api().get('/api/docs/').redirects(1);
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });

  it('los contratos clave quedan reflejados (idempotencia, token de carrito, rol)', () => {
    const spec = buildOpenApi() as {
      paths: Record<
        string,
        Record<string, { parameters?: { name: string }[]; description: string }>
      >;
    };
    expect(spec.paths['/orders']!.post!.parameters!.map((p) => p.name)).toContain(
      'Idempotency-Key',
    );
    expect(spec.paths['/cart/items']!.post!.parameters!.map((p) => p.name)).toContain(
      'X-Cart-Token',
    );
    expect(spec.paths['/reports/kpis']!.get!.description).toContain('Administrador');
  });
});
