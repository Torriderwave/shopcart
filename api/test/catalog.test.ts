import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, closeAll, loginAs, saQuery, uid, USERS } from './helpers';

afterAll(closeAll);

let admin = '';
let cliente = '';
let idCategoria = 0;
let idProducto = 0;
const marca = uid();
const sku = `TEST-${marca}-M`.toUpperCase();

beforeAll(async () => {
  admin = await loginAs(USERS.admin);
  cliente = await loginAs(USERS.cliente);
});

describe('catálogo: administración (RF-02)', () => {
  it('solo el administrador escribe; cliente y anónimo no', async () => {
    const body = { nombre: `Cat ${marca}` };
    expect((await api().post('/api/v1/catalog/categorias').send(body)).status).toBe(401);
    expect(
      (await api().post('/api/v1/catalog/categorias').set(bearer(cliente)).send(body)).status,
    ).toBe(403);
  });

  it('crea categoría, producto, variante e imagen', async () => {
    const cat = await api()
      .post('/api/v1/catalog/categorias')
      .set(bearer(admin))
      .send({ nombre: `Cat ${marca}`, descripcion: 'Prueba' });
    expect(cat.status).toBe(201);
    idCategoria = cat.body.data.idCategoria;

    const prod = await api()
      .post('/api/v1/catalog/productos')
      .set(bearer(admin))
      .send({ idCategoria, nombre: `Camisa ${marca}`, descripcion: 'Camisa de algodón' });
    expect(prod.status).toBe(201);
    idProducto = prod.body.data.idProducto;
    expect(prod.body.data.variantes).toEqual([]);

    const variante = await api()
      .post(`/api/v1/catalog/productos/${idProducto}/variantes`)
      .set(bearer(admin))
      .send({ sku: sku.toLowerCase(), atributos: { Talla: 'M', Color: 'Rojo' }, precio: 149.9 });
    expect(variante.status).toBe(201);
    const v = variante.body.data.variantes[0];
    expect(v).toMatchObject({
      sku,
      atributos: { Talla: 'M', Color: 'Rojo' },
      precio: 149.9,
      disponible: 0,
      activo: true,
    });

    const img = await api()
      .post(`/api/v1/catalog/productos/${idProducto}/imagenes`)
      .set(bearer(admin))
      .send({ url: 'https://placehold.co/600x600?text=Camisa' });
    expect(img.status).toBe(201);
    expect(img.body.data.imagenes[0]).toMatchObject({ esPrincipal: true });
    expect(img.body.data.imagenPrincipal).toContain('placehold.co');
  });

  it('SKU duplicado → 409 DUPLICADO (campo sku); nombre de categoría duplicado → campo nombre', async () => {
    const dup = await api()
      .post(`/api/v1/catalog/productos/${idProducto}/variantes`)
      .set(bearer(admin))
      .send({ sku, atributos: {}, precio: 10 });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICADO', details: [{ campo: 'sku' }] });

    const dupCat = await api()
      .post('/api/v1/catalog/categorias')
      .set(bearer(admin))
      .send({ nombre: `Cat ${marca}` });
    expect(dupCat.body.error.details).toEqual([{ campo: 'nombre' }]);
  });

  it('valida precio negativo, SKU inválido y categoría inexistente', async () => {
    const mal = await api()
      .post(`/api/v1/catalog/productos/${idProducto}/variantes`)
      .set(bearer(admin))
      .send({ sku: 'sku con espacios', atributos: {}, precio: -5 });
    expect(mal.status).toBe(400);
    const sinCat = await api()
      .post('/api/v1/catalog/productos')
      .set(bearer(admin))
      .send({ idCategoria: 999999, nombre: 'Huérfano' });
    expect(sinCat.status).toBe(404);
  });
});

describe('catálogo: búsqueda pública con filtros, orden y paginación', () => {
  it('el producto con precio aparece en la tienda; q busca por nombre y por SKU', async () => {
    const porNombre = await api()
      .get('/api/v1/catalog/productos')
      .query({ q: `Camisa ${marca}` });
    expect(porNombre.status).toBe(200);
    expect(porNombre.body.data).toHaveLength(1);
    expect(porNombre.body.data[0]).toMatchObject({
      idProducto,
      precioDesde: 149.9,
      precioHasta: 149.9,
      hayStock: false,
    });

    const porSku = await api().get('/api/v1/catalog/productos').query({ q: sku });
    expect(porSku.body.data.map((p: { idProducto: number }) => p.idProducto)).toContain(idProducto);
  });

  it('filtra por categoría, rango de precio y disponibilidad', async () => {
    const base = { idCategoria };
    expect(
      (
        await api()
          .get('/api/v1/catalog/productos')
          .query({ ...base, precioMin: 100, precioMax: 200 })
      ).body.data,
    ).toHaveLength(1);
    expect(
      (
        await api()
          .get('/api/v1/catalog/productos')
          .query({ ...base, precioMin: 200 })
      ).body.data,
    ).toHaveLength(0);
    expect(
      (
        await api()
          .get('/api/v1/catalog/productos')
          .query({ ...base, soloDisponibles: 'true' })
      ).body.data,
    ).toHaveLength(0);
    expect(
      (await api().get('/api/v1/catalog/productos').query({ precioMin: 50, precioMax: 10 })).status,
    ).toBe(400);
  });

  it('pagina y ordena en el servidor; el comodín % del usuario se trata como texto', async () => {
    const p1 = await api()
      .get('/api/v1/catalog/productos')
      .query({ page: 1, pageSize: 1, sort: 'precio:desc' });
    expect(p1.body.meta).toMatchObject({ page: 1, pageSize: 1 });
    expect(p1.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(p1.body.data).toHaveLength(1);

    const literal = await api().get('/api/v1/catalog/productos').query({ q: '%' });
    expect(literal.body.data).toHaveLength(0);
    expect((await api().get('/api/v1/catalog/productos').query({ pageSize: 101 })).status).toBe(
      400,
    );
  });
});

describe('soft-delete: lo desactivado deja de mostrarse (RF-02)', () => {
  it('no se puede desactivar una categoría con productos activos (409 EN_USO)', async () => {
    const res = await api().delete(`/api/v1/catalog/categorias/${idCategoria}`).set(bearer(admin));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EN_USO');
  });

  it('desactivar el producto lo oculta al público pero el admin lo sigue viendo', async () => {
    expect(
      (await api().delete(`/api/v1/catalog/productos/${idProducto}`).set(bearer(admin))).status,
    ).toBe(204);

    expect((await api().get(`/api/v1/catalog/productos/${idProducto}`)).status).toBe(404);
    const lista = await api()
      .get('/api/v1/catalog/productos')
      .query({ q: `Camisa ${marca}` });
    expect(lista.body.data).toHaveLength(0);

    const adminVe = await api()
      .get(`/api/v1/catalog/productos/${idProducto}`)
      .query({ incluirInactivos: 'true' })
      .set(bearer(admin));
    expect(adminVe.status).toBe(200);
    expect(adminVe.body.data.activo).toBe(false);

    // Pedir inactivos exige sesión (401) y rol de administrador (403).
    expect(
      (await api().get('/api/v1/catalog/productos').query({ incluirInactivos: 'true' })).status,
    ).toBe(401);
    expect(
      (
        await api()
          .get('/api/v1/catalog/productos')
          .query({ incluirInactivos: 'true' })
          .set(bearer(cliente))
      ).status,
    ).toBe(403);
  });

  it('con el producto inactivo ya se puede desactivar la categoría', async () => {
    expect(
      (await api().delete(`/api/v1/catalog/categorias/${idCategoria}`).set(bearer(admin))).status,
    ).toBe(204);
    const publicas = await api().get('/api/v1/catalog/categorias');
    expect(
      (publicas.body.data as { idCategoria: number }[]).some((c) => c.idCategoria === idCategoria),
    ).toBe(false);
  });
});

describe('bitácora de cambios de catálogo (RF-09)', () => {
  it('un cambio de precio queda con valor anterior y nuevo', async () => {
    const cat = await api()
      .post('/api/v1/catalog/categorias')
      .set(bearer(admin))
      .send({ nombre: `Bit ${marca}` });
    const prod = await api()
      .post('/api/v1/catalog/productos')
      .set(bearer(admin))
      .send({ idCategoria: cat.body.data.idCategoria, nombre: `Bit ${marca}` });
    const v = await api()
      .post(`/api/v1/catalog/productos/${prod.body.data.idProducto}/variantes`)
      .set(bearer(admin))
      .send({ sku: `BIT-${marca}`, atributos: {}, precio: 100 });
    const id = v.body.data.variantes[0].idVariante;

    const upd = await api()
      .put(`/api/v1/catalog/variantes/${id}`)
      .set(bearer(admin))
      .send({ sku: `BIT-${marca}`, atributos: {}, precio: 120, activo: true });
    expect(upd.status).toBe(200);

    const filas = await saQuery<{ Accion: string; ValorAnterior: string; ValorNuevo: string }>(
      `SELECT Accion, ValorAnterior, ValorNuevo FROM dbo.Bitacora
        WHERE Entidad = N'Variante' AND IDEntidad = ${id} ORDER BY IDBitacora`,
    );
    expect(filas.map((f) => f.Accion)).toEqual(['Alta', 'Cambio']);
    expect(JSON.parse(filas[1]!.ValorAnterior).precio).toBe(100);
    expect(JSON.parse(filas[1]!.ValorNuevo).precio).toBe(120);
  });
});
