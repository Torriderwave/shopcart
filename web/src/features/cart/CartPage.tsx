import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  NumberInput,
  Progress,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconTag, IconTrash, IconTruckDelivery, IconX } from '@tabler/icons-react';
import type { Carrito, CarritoLinea } from '@shopcart/contracts';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/auth/session';
import { fmtAtributos, fmtMoney } from '../../shared/format';
import { notifyError } from '../../shared/notify';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProductImage } from '../../shared/ui/Misc';
import { useCart, useCartMutations } from './api';

const PROBLEMA: Record<NonNullable<CarritoLinea['problema']>, string> = {
  INACTIVA: 'Este producto ya no está disponible. Quítalo para continuar.',
  SIN_STOCK: 'Sin existencias. Quítalo para continuar.',
  EXCEDE_DISPONIBLE: 'La cantidad supera la existencia disponible.',
};

export default function CartPage() {
  const cart = useCart();
  return (
    <>
      <PageHeader
        titulo="Tu carrito"
        descripcion={
          cart.data && cart.data.lineas.length > 0
            ? `${cart.data.cantidadItems} ${cart.data.cantidadItems === 1 ? 'artículo' : 'artículos'}`
            : undefined
        }
      />
      <Estados
        query={cart}
        esVacio={(c) => c.lineas.length === 0}
        vacio={
          <Vacio
            titulo="Tu carrito está vacío"
            descripcion="Explora el catálogo y agrega lo que te guste."
            accion={
              <Button component={Link} to="/catalogo">
                Ir al catálogo
              </Button>
            }
          />
        }
      >
        {(c) => <Contenido carrito={c} />}
      </Estados>
    </>
  );
}

function Contenido({ carrito }: { carrito: Carrito }) {
  const { usuario } = useSession();
  const navigate = useNavigate();
  const m = useCartMutations();
  const hayProblemas = carrito.lineas.some((l) => l.problema);
  const esPersonal = usuario?.rol === 'Operador' || usuario?.rol === 'Administrador';

  const continuar = () => {
    if (!usuario) navigate('/login', { state: { from: '/checkout' } });
    else navigate('/checkout');
  };

  return (
    <Grid gutter="xl">
      <Grid.Col span={{ base: 12, md: 8 }}>
        <EnvioGratis total={carrito.total} />
        <Stack gap="sm">
          {carrito.lineas.map((l) => (
            <Linea key={l.idCarritoLinea} linea={l} />
          ))}
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card
          withBorder
          padding="lg"
          radius="lg"
          shadow="sm"
          style={{ position: 'sticky', top: 84 }}
        >
          <Stack gap="sm">
            <Text fw={800} fz="lg">
              Resumen del pedido
            </Text>
            <Cupon carrito={carrito} />
            <Divider />
            <Fila etiqueta="Subtotal" valor={fmtMoney(carrito.subtotal)} />
            {carrito.descuento > 0 && (
              <Fila etiqueta="Descuento" valor={`− ${fmtMoney(carrito.descuento)}`} color="green" />
            )}
            <Divider />
            <Fila etiqueta="Total" valor={fmtMoney(carrito.total)} fuerte />
            <Text size="xs" c="dimmed">
              Incluye IVA de {fmtMoney(carrito.iva)}. El envío se calcula en el checkout.
            </Text>
            {hayProblemas && (
              <Alert color="orange">Corrige los productos marcados antes de continuar.</Alert>
            )}
            {esPersonal ? (
              <Alert color="blue">Las cuentas de personal no realizan compras.</Alert>
            ) : (
              <Button
                size="md"
                disabled={hayProblemas}
                onClick={continuar}
                loading={m.agregar.isPending}
              >
                {usuario ? 'Continuar con la compra' : 'Inicia sesión para pagar'}
              </Button>
            )}
            {!usuario && (
              <Text size="xs" c="dimmed" ta="center">
                ¿No tienes cuenta?{' '}
                <Anchor component={Link} to="/registro" state={{ from: '/checkout' }} size="xs">
                  Regístrate
                </Anchor>
                . Tu carrito se conserva.
              </Text>
            )}
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}

/** Umbral de envío gratis del seed (Q200 tras descuento); el checkout confirma el costo real. */
const ENVIO_GRATIS_DESDE = 200;

function EnvioGratis({ total }: { total: number }) {
  const falta = Math.max(0, ENVIO_GRATIS_DESDE - total);
  const pct = Math.min(100, (total / ENVIO_GRATIS_DESDE) * 100);
  return (
    <Card withBorder padding="md" radius="lg" mb="sm" role="status">
      <Group gap="sm" mb={8} wrap="nowrap">
        <ThemeIcon variant="light" radius="xl" color={falta === 0 ? 'green' : 'brand'}>
          <IconTruckDelivery size={18} />
        </ThemeIcon>
        <Text size="sm" fw={600}>
          {falta === 0
            ? '¡Tu pedido tiene envío gratis!'
            : `Te faltan ${fmtMoney(falta)} para el envío gratis`}
        </Text>
      </Group>
      <Progress
        value={pct}
        radius="xl"
        size="sm"
        color={falta === 0 ? 'green' : 'brand'}
        animated={falta > 0}
      />
    </Card>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
  color,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
  color?: string;
}) {
  return (
    <Group justify="space-between">
      <Text fw={fuerte ? 700 : 400} size={fuerte ? 'lg' : 'sm'}>
        {etiqueta}
      </Text>
      <Text fw={fuerte ? 700 : 500} size={fuerte ? 'lg' : 'sm'} c={color}>
        {valor}
      </Text>
    </Group>
  );
}

function Linea({ linea }: { linea: CarritoLinea }) {
  const m = useCartMutations();
  const [cant, setCant] = useState<number | string>(linea.cantidad);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (valor: number | string) => {
    setCant(valor);
    const n = Number(valor);
    if (valor === '' || !Number.isInteger(n) || n < 1) return;
    if (n === linea.cantidad) return;
    setError(null);
    m.cantidad.mutate(
      { id: linea.idCarritoLinea, cantidad: n },
      {
        onError: (e) => {
          setCant(linea.cantidad);
          if (
            e instanceof ApiError &&
            (e.code === 'CANTIDAD_EXCEDE_DISPONIBLE' || e.code === 'STOCK_INSUFICIENTE')
          )
            setError(e.message);
          else notifyError(e);
        },
      },
    );
  };

  return (
    <Card withBorder padding="sm" radius="lg" className="linea-carrito">
      <Group wrap="nowrap" align="flex-start">
        <div style={{ width: 104, flexShrink: 0 }}>
          <ProductImage src={linea.imagen} alt={linea.nombreProducto} />
        </div>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <div style={{ minWidth: 0 }}>
              <Anchor component={Link} to={`/producto/${linea.idProducto}`} fw={600} c="inherit">
                {linea.nombreProducto}
              </Anchor>
              <Text size="xs" c="dimmed">
                {fmtAtributos(linea.atributos) || linea.sku}
              </Text>
            </div>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={`Quitar ${linea.nombreProducto}`}
              loading={m.quitar.isPending && m.quitar.variables === linea.idCarritoLinea}
              onClick={() =>
                m.quitar.mutate(linea.idCarritoLinea, { onError: (e) => notifyError(e) })
              }
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
          <Group justify="space-between" align="flex-end">
            <NumberInput
              aria-label={`Cantidad de ${linea.nombreProducto}`}
              w={100}
              size="xs"
              min={1}
              max={Math.max(linea.disponible, 1)}
              allowDecimal={false}
              allowNegative={false}
              clampBehavior="strict"
              value={cant}
              onChange={cambiar}
              onBlur={() => {
                if (cant === '' || Number(cant) < 1) setCant(linea.cantidad);
              }}
              disabled={linea.problema === 'INACTIVA' || linea.problema === 'SIN_STOCK'}
            />
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">
                {fmtMoney(linea.precioUnitario)} c/u
              </Text>
              <Text fw={700}>{fmtMoney(linea.totalLinea)}</Text>
            </Stack>
          </Group>
          {linea.problema && (
            <Badge
              color="orange"
              variant="light"
              size="sm"
              style={{ height: 'auto', whiteSpace: 'normal' }}
              py={4}
            >
              {PROBLEMA[linea.problema]}
            </Badge>
          )}
          {error && (
            <Text size="xs" c="red" role="alert">
              {error}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

export function Cupon({ carrito }: { carrito: Carrito }) {
  const m = useCartMutations();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (carrito.cuponCodigo) {
    const valido = carrito.cuponValido !== false;
    return (
      <Stack gap={6}>
        <Group justify="space-between">
          <Badge
            size="lg"
            variant="light"
            color={valido ? 'green' : 'red'}
            leftSection={<IconTag size={14} />}
          >
            {carrito.cuponCodigo}
          </Badge>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconX size={12} />}
            loading={m.quitarCupon.isPending}
            onClick={() => m.quitarCupon.mutate(undefined, { onError: (e) => notifyError(e) })}
          >
            Quitar
          </Button>
        </Group>
        {!valido && (
          <Text size="xs" c="red" role="alert">
            {carrito.cuponMensaje ?? 'El cupón ya no es válido para este carrito.'}
          </Text>
        )}
        {valido && carrito.cuponMensaje && (
          <Text size="xs" c="dimmed">
            {carrito.cuponMensaje}
          </Text>
        )}
      </Stack>
    );
  }

  const aplicar = () => {
    const c = codigo.trim();
    if (!c) {
      setError('Escribe un código de cupón');
      return;
    }
    setError(null);
    m.aplicarCupon.mutate(c, {
      onSuccess: () => setCodigo(''),
      onError: (e) => {
        if (e instanceof ApiError && e.code !== 'INTERNO' && e.code !== 'RED') setError(e.message);
        else notifyError(e);
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aplicar();
      }}
    >
      <Group align="flex-start" wrap="nowrap" gap="xs">
        <TextInput
          style={{ flex: 1 }}
          aria-label="Código de cupón"
          placeholder="Código de cupón"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.currentTarget.value.toUpperCase());
            setError(null);
          }}
          error={error}
        />
        <Button type="submit" variant="light" loading={m.aplicarCupon.isPending}>
          Aplicar
        </Button>
      </Group>
    </form>
  );
}
