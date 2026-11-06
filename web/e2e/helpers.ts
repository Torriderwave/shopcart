import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'ShopCart2026!';
export const unico = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function loginUI(page: Page, correo: string, contrasena = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
}

/** Inicia sesión por API: deja la cookie de refresh en el contexto y marca la sesión para el arranque. */
export async function loginRapido(page: Page, correo: string): Promise<void> {
  const res = await page.request.post('/api/v1/auth/login', {
    data: { correo, contrasena: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem('shopcart.hadSession', '1'));
}

export async function agregarPrimerProducto(page: Page): Promise<void> {
  await page.goto('/catalogo');
  await page.locator('a[href^="/producto/"]').first().click();
  await page.getByRole('button', { name: /Agregar al carrito/ }).click();
  await expect(page.getByText('se agregó al carrito')).toBeVisible();
}

export async function nuevaDireccion(page: Page): Promise<void> {
  await page.getByLabel('Alias').fill('Casa');
  await page.getByLabel('Destinatario').fill('Cliente Prueba');
  await page.getByLabel('Dirección', { exact: true }).fill('5a avenida 10-20 zona 1');
  await page.getByLabel('Ciudad').fill('Guatemala');
  await page.getByLabel('Teléfono').fill('5555-1234');
  await page.getByRole('textbox', { name: 'Departamento' }).click();
  await page.getByRole('option', { name: 'Guatemala', exact: true }).click();
}
