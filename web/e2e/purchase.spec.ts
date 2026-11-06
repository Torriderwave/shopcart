import { expect, test } from '@playwright/test';
import { agregarPrimerProducto, loginRapido, nuevaDireccion, PASSWORD, unico } from './helpers';

test.describe.configure({ mode: 'serial' });

const correo = `compra-${unico()}@correo.test`;
let numeroPedido = '';

test.describe('Compra completa (RF-04, RF-05, RF-06)', () => {
  test('invitado agrega al carrito y al registrarse conserva su carrito (fusión)', async ({
    page,
  }) => {
    await agregarPrimerProducto(page);
    await page.goto('/carrito');
    await expect(page.getByRole('button', { name: 'Inicia sesión para pagar' })).toBeVisible();
    await page.getByRole('link', { name: 'Regístrate' }).click();

    await page.getByLabel('Nombre completo').fill('Cliente Compra');
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    // Vuelve al flujo de pago con el carrito ya fusionado.
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByText('Reserva:')).toBeVisible();
  });

  test('checkout: dirección, cupón inválido/válido, doble clic en pagar crea un solo pedido', async ({
    page,
  }) => {
    await loginRapido(page, correo);
    await page.goto('/checkout');
    await expect(page.getByText('Aún no tienes direcciones')).toBeVisible();

    // Validación del formulario de dirección
    await page.getByRole('button', { name: 'Guardar y usar esta dirección' }).click();
    await expect(page.getByText('Teléfono inválido')).toBeVisible();
    await nuevaDireccion(page);
    await page.getByRole('button', { name: 'Guardar y usar esta dirección' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Cupones
    await page.getByPlaceholder('Código de cupón').fill('NAVIDAD25');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/vigente|vigencia/i).first()).toBeVisible();
    await page.getByPlaceholder('Código de cupón').fill('BIENVENIDA10');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText('BIENVENIDA10')).toBeVisible();
    await expect(page.getByText(/− Q/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();

    let posts = 0;
    page.on(
      'request',
      (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/orders') && posts++,
    );
    await page.getByRole('button', { name: /^Pagar Q/ }).dblclick();
    await expect(page).toHaveURL(/\/mis-pedidos\/\d+$/);
    expect(posts).toBe(1);
    await expect(page.getByText('¡Gracias por tu compra!')).toBeVisible();
    numeroPedido = (await page.getByRole('heading', { level: 2 }).first().innerText()).replace(
      'Pedido ',
      '',
    );
    expect(numeroPedido).toMatch(/^SC-/);
  });

  test('el cliente ve su pedido en "Mis pedidos" y no puede cancelar sin motivo', async ({
    page,
  }) => {
    await loginRapido(page, correo);
    await page.goto('/mis-pedidos');
    await expect(page.getByText(numeroPedido)).toBeVisible();
    await page.getByText(numeroPedido).click();
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();
    await expect(page.getByText('Indica el motivo')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('el operador avanza el pedido hasta Entregado y registra una devolución total', async ({
    page,
  }) => {
    await loginRapido(page, 'operador@shopcart.test');
    await page.goto(`/operador/pedidos?numero=${numeroPedido}`);
    await page.locator('tbody tr').first().click();
    for (const estado of ['Preparando', 'Despachado', 'Entregado']) {
      await page.getByRole('button', { name: `Marcar como ${estado}` }).click();
      await expect(page.getByText(`Pedido marcado como ${estado}`)).toBeVisible();
    }
    // Ya no se puede cancelar un pedido entregado.
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Registrar devolución' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Registrar devolución' }).click();
    await expect(dlg.getByText('Indica la cantidad a devolver')).toBeVisible();
    await dlg
      .getByRole('textbox', { name: /Cantidad a devolver/ })
      .first()
      .fill('1');
    await dlg.getByLabel('Motivo').fill('Producto defectuoso');
    await dlg.getByRole('button', { name: 'Registrar devolución' }).click();
    await expect(page.getByText('Devolución registrada')).toBeVisible();
    await expect(page.getByText('Devuelto total').first()).toBeVisible();
  });

  test('el cliente cancela un pedido nuevo (Pagado) con motivo y confirmación', async ({
    page,
  }) => {
    await loginRapido(page, correo);
    await agregarPrimerProducto(page);
    await page.goto('/checkout');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: /^Pagar Q/ }).click();
    await expect(page).toHaveURL(/\/mis-pedidos\/\d+$/);
    await page.getByLabel('Motivo de la cancelación').fill('Ya no lo necesito');
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar pedido' }).click();
    await expect(page.getByText('Pedido cancelado')).toBeVisible();
    await expect(page.getByText('Cancelado').first()).toBeVisible();
  });
});
