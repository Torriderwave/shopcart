import { expect, test } from '@playwright/test';
import { loginUI, PASSWORD, unico } from './helpers';

test.describe('Autenticación y control de acceso (RF-01)', () => {
  test('registro: errores de validación en español, correo duplicado y alta correcta', async ({
    page,
  }) => {
    await page.goto('/registro');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Mínimo 2 caracteres')).toBeVisible();
    await expect(page.getByText('Correo electrónico no válido')).toBeVisible();
    await expect(page.getByText('La contraseña debe tener al menos 8 caracteres')).toBeVisible();
    // Nunca mensajes de zod en inglés.
    await expect(page.getByText(/Too small|Invalid|expected/)).toHaveCount(0);

    await page.getByLabel('Nombre completo').fill('Ana Prueba');
    await page.getByLabel('Correo electrónico').fill('cliente@shopcart.test');
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirmar contraseña').fill('otra-distinta');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();

    await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Ya existe una cuenta con este correo')).toBeVisible();

    await page.getByLabel('Correo electrónico').fill(`qa-${unico()}@correo.test`);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Mis pedidos' })).toBeVisible();
  });

  test('login: credenciales incorrectas muestran un mensaje y no inician sesión', async ({
    page,
  }) => {
    await loginUI(page, 'cliente@shopcart.test', 'incorrecta1');
    await expect(page.getByRole('alert')).toContainText('incorrectos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('un usuario desactivado no puede iniciar sesión', async ({ page }) => {
    await loginUI(page, 'hector.tzoc@correo.test');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('rutas protegidas: sin sesión → login; cliente no entra a /admin; operador no entra a /admin', async ({
    page,
  }) => {
    await page.goto('/mis-pedidos');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/admin/usuarios');
    await expect(page).toHaveURL(/\/login$/);

    await loginUI(page, 'cliente@shopcart.test');
    await expect(page).toHaveURL('/');
    await page.goto('/admin/usuarios');
    await expect(page).toHaveURL('/');
    await page.goto('/operador/pedidos');
    await expect(page).toHaveURL('/');
  });

  test('cada rol aterriza en su propio inicio y ve su menú', async ({ page }) => {
    await loginUI(page, 'operador@shopcart.test');
    await expect(page).toHaveURL(/\/operador\/pedidos/);
    await expect(page.getByRole('link', { name: 'Inventario' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/operador\/pedidos/);
  });

  test('cerrar sesión devuelve al login y vuelve a proteger las rutas', async ({ page }) => {
    await loginUI(page, 'cliente@shopcart.test');
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/mis-pedidos');
    await expect(page).toHaveURL(/\/login$/);
  });
});
