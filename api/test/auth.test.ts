import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { api, app, bearer, closeAll, loginAs, PASSWORD, uid, USERS } from './helpers';

afterAll(closeAll);

const DIRECCION = {
  alias: 'Casa',
  destinatario: 'Carla Cliente',
  linea1: '5a avenida 10-20 zona 10',
  ciudad: 'Guatemala',
  departamento: 'Guatemala',
  telefono: '5555-1234',
};

describe('registro y login', () => {
  it('registra un cliente, abre sesión y deja el refresh en cookie httpOnly', async () => {
    const correo = `nuevo-${uid()}@shopcart.test`;
    const res = await api().post('/api/v1/auth/register').send({
      nombre: 'Nuevo Cliente',
      correo: correo.toUpperCase(),
      contrasena: PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.usuario).toMatchObject({ correo, rol: 'Cliente' });
    expect(res.body.data.accessToken).toBeTruthy();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toMatch(/sc_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('correo duplicado → 409 DUPLICADO indicando el campo', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ nombre: 'Otra Carla', correo: USERS.cliente, contrasena: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'DUPLICADO', details: [{ campo: 'correo' }] });
  });

  it('valida el cuerpo con zod → 400 VALIDACION con detalle por campo', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ nombre: 'x', correo: 'no-es-correo', contrasena: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['nombre', 'correo', 'contrasena']));
  });

  it('login incorrecto → 401 genérico (no revela si el correo existe)', async () => {
    const mala = await api()
      .post('/api/v1/auth/login')
      .send({ correo: USERS.cliente, contrasena: 'incorrecta1' });
    const noExiste = await api()
      .post('/api/v1/auth/login')
      .send({ correo: 'nadie@shopcart.test', contrasena: 'incorrecta1' });
    expect(mala.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(mala.body.error).toEqual(noExiste.body.error);
    expect(mala.body.error.code).toBe('CREDENCIALES_INVALIDAS');
  });
});

describe('tokens', () => {
  it('sin token → 401 NO_AUTENTICADO; token basura → 401', async () => {
    expect((await api().get('/api/v1/auth/me')).body.error.code).toBe('NO_AUTENTICADO');
    const res = await api().get('/api/v1/auth/me').set(bearer('basura'));
    expect(res.status).toBe(401);
  });

  it('GET /auth/me devuelve la sesión', async () => {
    const token = await loginAs(USERS.operador);
    const res = await api().get('/api/v1/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ correo: USERS.operador, rol: 'Operador' });
  });

  it('refresh rota el token; reusar el viejo revoca toda la familia', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ correo: USERS.cliente2, contrasena: PASSWORD });
    expect(login.status).toBe(200);
    const original = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    const r1 = await agent.post('/api/v1/auth/refresh');
    expect(r1.status).toBe(200);
    expect(r1.body.data.usuario.correo).toBe(USERS.cliente2);
    const rotada = (r1.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(rotada).not.toBe(original);

    // Un atacante (o una pestaña vieja) presenta el token ya usado.
    const reuso = await request(app).post('/api/v1/auth/refresh').set('Cookie', original);
    expect(reuso.status).toBe(401);
    expect(reuso.body.error.code).toBe('REFRESH_INVALIDO');

    // La familia quedó revocada: ni siquiera el token "bueno" más reciente sirve.
    const hijo = await request(app).post('/api/v1/auth/refresh').set('Cookie', rotada);
    expect(hijo.status).toBe(401);
  });

  it('refresh sin cookie → 401; logout revoca y limpia la cookie', async () => {
    expect((await api().post('/api/v1/auth/refresh')).status).toBe(401);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ correo: USERS.cliente2, contrasena: PASSWORD });
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(401);
  });
});

describe('permisos por rol (403)', () => {
  it('un cliente no entra a rutas de administración ni de operador', async () => {
    const token = await loginAs(USERS.cliente);
    expect((await api().get('/api/v1/admin/usuarios').set(bearer(token))).status).toBe(403);
    expect((await api().get('/api/v1/inventory/existencias').set(bearer(token))).status).toBe(403);
  });

  it('el operador tampoco administra usuarios', async () => {
    const token = await loginAs(USERS.operador);
    const res = await api().get('/api/v1/admin/usuarios').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROHIBIDO');
  });
});

describe('administración de usuarios', () => {
  it('el administrador crea, lista, cambia rol y desactiva; el desactivado no entra', async () => {
    const admin = await loginAs(USERS.admin);
    const correo = `op-${uid()}@shopcart.test`;

    const creado = await api()
      .post('/api/v1/admin/usuarios')
      .set(bearer(admin))
      .send({ nombre: 'Operador Nuevo', correo, contrasena: PASSWORD, rol: 'Operador' });
    expect(creado.status).toBe(201);
    const id = creado.body.data.idUsuario as number;

    const lista = await api()
      .get('/api/v1/admin/usuarios')
      .query({ q: correo, rol: 'Operador' })
      .set(bearer(admin));
    expect(lista.status).toBe(200);
    expect(lista.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(lista.body.data[0].correo).toBe(correo);

    const cambio = await api()
      .patch(`/api/v1/admin/usuarios/${id}`)
      .set(bearer(admin))
      .send({ activo: false });
    expect(cambio.status).toBe(200);
    expect(cambio.body.data.activo).toBe(false);

    const login = await api().post('/api/v1/auth/login').send({ correo, contrasena: PASSWORD });
    expect(login.status).toBe(401);
  });

  it('un administrador no puede desactivarse a sí mismo', async () => {
    const admin = await loginAs(USERS.admin);
    const me = await api().get('/api/v1/auth/me').set(bearer(admin));
    const res = await api()
      .patch(`/api/v1/admin/usuarios/${me.body.data.idUsuario}`)
      .set(bearer(admin))
      .send({ activo: false });
    expect(res.status).toBe(400);
  });

  it('el orden solo admite campos de la lista blanca', async () => {
    const admin = await loginAs(USERS.admin);
    const res = await api()
      .get('/api/v1/admin/usuarios')
      .query({ sort: 'hashContrasena:asc' })
      .set(bearer(admin));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
  });
});

describe('direcciones: ownership (RF-01)', () => {
  it('cada cliente ve y modifica solo lo suyo; lo ajeno es 403, lo inexistente 404', async () => {
    const a = await loginAs(USERS.cliente);
    const b = await loginAs(USERS.cliente2);

    const creada = await api().post('/api/v1/me/direcciones').set(bearer(a)).send(DIRECCION);
    expect(creada.status).toBe(201);
    const id = creada.body.data.idDireccion as number;

    // B no la ve en su lista…
    const listaB = await api().get('/api/v1/me/direcciones').set(bearer(b));
    expect((listaB.body.data as { idDireccion: number }[]).some((d) => d.idDireccion === id)).toBe(
      false,
    );

    // …ni puede modificarla ni borrarla.
    const put = await api().put(`/api/v1/me/direcciones/${id}`).set(bearer(b)).send(DIRECCION);
    expect(put.status).toBe(403);
    expect(put.body.error.code).toBe('PROHIBIDO');
    expect((await api().delete(`/api/v1/me/direcciones/${id}`).set(bearer(b))).status).toBe(403);

    expect(
      (await api().put('/api/v1/me/direcciones/999999').set(bearer(b)).send(DIRECCION)).status,
    ).toBe(404);

    // A sí puede.
    const upd = await api()
      .put(`/api/v1/me/direcciones/${id}`)
      .set(bearer(a))
      .send({ ...DIRECCION, alias: 'Oficina' });
    expect(upd.body.data.alias).toBe('Oficina');
  });

  it('la primera dirección es principal y solo una puede serlo', async () => {
    const token = await loginAs(USERS.cliente2);
    const primera = await api()
      .post('/api/v1/me/direcciones')
      .set(bearer(token))
      .send({ ...DIRECCION, alias: 'P1' });
    const segunda = await api()
      .post('/api/v1/me/direcciones')
      .set(bearer(token))
      .send({ ...DIRECCION, alias: 'P2', esPrincipal: true });
    expect(primera.status).toBe(201);
    expect(segunda.body.data.esPrincipal).toBe(true);

    const lista = await api().get('/api/v1/me/direcciones').set(bearer(token));
    const principales = (lista.body.data as { esPrincipal: boolean }[]).filter(
      (d) => d.esPrincipal,
    );
    expect(principales).toHaveLength(1);
  });

  it('valida departamento y teléfono', async () => {
    const token = await loginAs(USERS.cliente);
    const res = await api()
      .post('/api/v1/me/direcciones')
      .set(bearer(token))
      .send({ ...DIRECCION, departamento: 'Narnia', telefono: 'abc' });
    expect(res.status).toBe(400);
  });
});
