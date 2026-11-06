import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Indicator,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight, IconShoppingBag, IconShoppingCart } from '@tabler/icons-react';
import { useCart } from '../../features/cart/api';
import { useSession } from '../auth/session';
import { fmtAtributos, fmtMoney } from '../format';
import { ProductImage } from './Misc';

/** Botón del carrito con contador animado y un panel lateral con el resumen (sin salir de la página). */
export function CartButton() {
  const cart = useCart();
  const { usuario } = useSession();
  const [abierto, { open, close }] = useDisclosure(false);
  const n = cart.data?.cantidadItems ?? 0;
  const lineas = cart.data?.lineas ?? [];

  return (
    <>
      <Indicator label={n} size={18} disabled={n === 0} color="red" offset={4}>
        <ActionIcon
          variant="light"
          size="lg"
          radius="xl"
          onClick={open}
          aria-label={`Carrito (${n} ${n === 1 ? 'artículo' : 'artículos'})`}
          // key = n: al cambiar la cantidad se vuelve a montar y dispara la animación «rebote».
          key={n}
          className="cart-bump"
        >
          <IconShoppingCart size={22} />
        </ActionIcon>
      </Indicator>

      <Drawer
        opened={abierto}
        onClose={close}
        position="right"
        size={420}
        padding="lg"
        title={
          <Group gap="xs">
            <IconShoppingBag size={20} />
            <Text fw={800} fz="lg">
              Tu carrito
            </Text>
            {n > 0 && <Badge variant="light">{n}</Badge>}
          </Group>
        }
      >
        {lineas.length === 0 ? (
          <Stack align="center" gap="sm" py={60} ta="center">
            <div className="vacio-icono">
              <IconShoppingCart size={44} stroke={1.3} color="var(--mantine-color-brand-6)" />
            </div>
            <Text fw={800}>Aún no agregas nada</Text>
            <Text size="sm" c="dimmed">
              Explora el catálogo y encuentra algo que te guste.
            </Text>
            <Button component={Link} to="/catalogo" onClick={close}>
              Ir al catálogo
            </Button>
          </Stack>
        ) : (
          <Stack h="calc(100dvh - 120px)" justify="space-between" gap="md">
            <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
              <Stack gap="md">
                {lineas.map((l) => (
                  <Group key={l.idCarritoLinea} wrap="nowrap" align="flex-start" gap="sm">
                    <Box w={72} style={{ flexShrink: 0 }}>
                      <ProductImage src={l.imagen} alt={l.nombreProducto} radius="md" />
                    </Box>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={700} size="sm" lineClamp={2}>
                        {l.nombreProducto}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {fmtAtributos(l.atributos) || l.sku}
                      </Text>
                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">
                          {l.cantidad} × {fmtMoney(l.precioUnitario)}
                        </Text>
                        <Text fw={800} size="sm">
                          {fmtMoney(l.totalLinea)}
                        </Text>
                      </Group>
                    </Stack>
                  </Group>
                ))}
              </Stack>
            </ScrollArea>
            <Stack gap="sm">
              <Divider />
              <Group justify="space-between">
                <Text fw={700}>Total</Text>
                <Text fw={800} fz="xl" c="brand.7">
                  {fmtMoney(cart.data?.total ?? 0)}
                </Text>
              </Group>
              <Button
                component={Link}
                to={usuario ? '/checkout' : '/login'}
                state={usuario ? undefined : { from: '/checkout' }}
                size="md"
                rightSection={<IconArrowRight size={18} />}
                onClick={close}
              >
                {usuario ? 'Continuar con la compra' : 'Inicia sesión para pagar'}
              </Button>
              <Button component={Link} to="/carrito" variant="light" onClick={close}>
                Ver carrito completo
              </Button>
            </Stack>
          </Stack>
        )}
      </Drawer>
    </>
  );
}
