import { expect, test } from '@playwright/test';
import { loginRapido } from './helpers';

test.describe('Sesión y renovación del token', () => {
  test('recargar la página conserva la sesión (refresh por cookie httpOnly)', async ({ page }) => {
    await loginRapido(page, 'cliente@shopcart.test');
    await page.goto('/mis-pedidos');
    await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible();
  });

  test('token expirado (401): se renueva solo y la petición se reintenta sin cerrar sesión', async ({
    page,
  }) => {
    await loginRapido(page, 'cliente@shopcart.test');
    await page.goto('/');
    let falsos = 0;
    let refrescos = 0;
    page.on('request', (r) => r.url().endsWith('/auth/refresh') && refrescos++);
    await page.route('**/api/v1/orders/mine*', (route) => {
      if (falsos++ === 0) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'TOKEN_EXPIRADO', message: 'La sesión expiró.', details: [] },
          }),
        });
      }
      return route.continue();
    });
    await page.getByRole('banner').getByRole('link', { name: 'Mis pedidos' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect(refrescos).toBe(1);
    await expect(page).toHaveURL(/\/mis-pedidos/);
  });

  test('un fallo transitorio del refresh (429) NO cierra la sesión', async ({ page }) => {
    await loginRapido(page, 'cliente@shopcart.test');
    let limitado = true;
    await page.route('**/api/v1/auth/refresh', (route) =>
      limitado
        ? route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: {
                code: 'DEMASIADAS_SOLICITUDES',
                message: 'Demasiados intentos. Espera un minuto.',
                details: [],
              },
            }),
          })
        : route.continue(),
    );
    await page.goto('/mis-pedidos');
    // No redirige al login: ofrece reintentar.
    await expect(page.getByText('Demasiados intentos')).toBeVisible();
    await expect(page).toHaveURL(/\/mis-pedidos/);
    limitado = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible();
  });
});
