import { expect, test } from '@playwright/test';
import { loginRapido, PASSWORD, unico } from './helpers';

test.describe('Panel de administración (RF-02, RF-03, RF-05, RF-08, RF-09)', () => {
  test.beforeEach(async ({ page }) => {
    await loginRapido(page, 'admin@shopcart.test');
  });

  test('dashboard: KPIs, gráficas y rango de fechas inválido', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.getByText('Ventas netas').first()).toBeVisible();
    await expect(page.getByText('Ventas en el tiempo')).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await page.getByRole('button', { name: '6 meses' }).click();
    await page.getByText('Por semana').click();
    await expect(page.locator('.recharts-line').first()).toBeVisible();
    await page.getByLabel('Desde').fill('2099-01-01');
    await expect(page.getByText('Debe ser posterior a "Desde"')).toBeVisible();
  });

  test('categorías y productos: alta con validación, variante con atributos y SKU duplicado', async ({
    page,
  }) => {
    const id = unico();
    await page.goto('/admin/categorias');
    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Mínimo 2 caracteres')).toBeVisible();
    await page.getByLabel('Nombre').fill(`Hogar ${id}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(`Hogar ${id}`)).toBeVisible();

    await page.goto('/admin/catalogo/nuevo');
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page.getByText('Mínimo 2 caracteres')).toBeVisible();
    await page.getByLabel('Nombre').fill(`Lámpara ${id}`);
    await page.getByRole('textbox', { name: 'Categoría' }).click();
    await page.getByRole('option', { name: `Hogar ${id}` }).click();
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page).toHaveURL(/\/admin\/catalogo\/\d+$/);

    const sku = `LAMP-${id}`.toUpperCase();
    const agregarVariante = async () => {
      await page.getByRole('button', { name: 'Agregar variante' }).click();
      const dlg = page.getByRole('dialog');
      await dlg.getByLabel('SKU').fill(sku);
      await dlg.getByLabel(/Precio/).fill('150');
      await dlg.getByLabel('Atributo', { exact: true }).first().fill('Color');
      await dlg.getByLabel('Valor', { exact: true }).first().fill('Blanco');
      await dlg.getByRole('button', { name: 'Guardar' }).click();
      return dlg;
    };
    await agregarVariante();
    await expect(page.getByRole('cell', { name: sku })).toBeVisible();
    const dlg = await agregarVariante();
    await expect(dlg.getByText('Ya existe una variante con ese SKU')).toBeVisible();
  });

  test('cupones: validación del formulario', async ({ page }) => {
    await page.goto('/admin/cupones');
    await page.getByRole('button', { name: 'Nuevo cupón' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Indica la fecha de inicio')).toBeVisible();
    await expect(page.getByText('Indica la fecha de fin')).toBeVisible();
  });

  test('usuarios: crear operador, desactivarlo y verificar que ya no puede entrar', async ({
    page,
  }) => {
    const correo = `op-${unico()}@correo.test`;
    await page.goto('/admin/usuarios');
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nombre').fill('Operador Nuevo');
    await dlg.getByLabel('Correo').fill(correo);
    await dlg.getByLabel('Contraseña inicial').fill(PASSWORD);
    await dlg.getByRole('textbox', { name: 'Rol' }).click();
    await page.getByRole('option', { name: 'Operador' }).click();
    await dlg.getByRole('button', { name: 'Guardar' }).click();

    await page.getByPlaceholder('Nombre o correo').fill(correo);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByText('Cuenta activa').click();
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Desactivado', { exact: true })).toBeVisible();

    const res = await page.request.post('/api/v1/auth/login', {
      data: { correo, contrasena: PASSWORD },
    });
    expect(res.status()).toBe(401);
  });

  test('bitácora: lista con filtro por módulo y detalle de valor anterior/nuevo', async ({
    page,
  }) => {
    await page.goto('/admin/bitacora?modulo=Catalogo');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Valor anterior', { exact: true })).toBeVisible();
    await expect(page.getByText('Valor nuevo', { exact: true })).toBeVisible();
  });

  test('inventario: un ajuste que dejaría existencia negativa se rechaza y uno válido queda en el kardex', async ({
    page,
  }) => {
    await page.goto('/operador/inventario');
    await page.getByRole('button', { name: 'Ajuste' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Registrar' }).click();
    await expect(dlg.getByText('Este campo es obligatorio').first()).toBeVisible();
    await dlg.getByLabel(/Cantidad/).fill('-999999');
    await dlg.getByLabel('Motivo').fill('Conteo físico');
    await dlg.getByRole('button', { name: 'Registrar' }).click();
    await expect(dlg.getByText(/negativo|reservado/)).toBeVisible();
    await dlg.getByLabel(/Cantidad/).fill('1');
    await dlg.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Ajuste registrado')).toBeVisible();
  });
});
