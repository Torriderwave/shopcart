import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Radio,
  Stack,
  Stepper,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconClockHour4 } from '@tabler/icons-react';
import type { Checkout, PedidoDetalle } from '@shopcart/contracts';
import { api, ApiError } from '../../shared/api/client';
import { fmtAtributos, fmtMoney } from '../../shared/format';
import { notifyError, notifyOk } from '../../shared/notify';
import { Cargando, ErrorEstado } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProductImage } from '../../shared/ui/Misc';
import { Cupon } from '../cart/CartPage';
import { DireccionTarjeta } from './AddressesPage';
import { DireccionForm, useDireccionMutations, useDirecciones } from './addresses';

/** Entrada/recarga: GET del checkout activo; si no existe (o venció), se inicia (reserva 15 min). */
async function cargarCheckout(): Promise<Checkout> {
  try {
    return await api<Checkout>('/checkout');
  } catch (e) {
    if (e instanceof ApiError && e.code === 'CHECKOUT_NO_INICIADO') {
      return api<Checkout>('/checkout', { method: 'POST' });
    }
    throw e;
  }
}

const KEY_STORAGE = 'shopcart.idempotencyKey';

/** La llave vive mientras dure este intento de pago: un reintento (red caída, doble clic) la reutiliza. */
function llaveDePago(): string {
  let k = sessionStorage.getItem(KEY_STORAGE);
  if (!k) {
    k = crypto.randomUUID();
    sessionStorage.setItem(KEY_STORAGE, k);
  }
  return k;
}
const olvidarLlave = () => sessionStorage.removeItem(KEY_STORAGE);

function useCuentaRegresiva(expira: string | null | undefined) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!expira) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expira]);
  if (!expira) return null;
  return Math.max(0, Math.floor((new Date(expira).getTime() - ahora) / 1000));
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const checkout = useQuery({
    queryKey: ['checkout'],
    queryFn: cargarCheckout,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const direcciones = useDirecciones();
  const dirMut = useDireccionMutations();

  const [paso, setPaso] = useState(0);
  const [idDireccion, setIdDireccion] = useState<number | null>(null);
  const [idEnvio, setIdEnvio] = useState<number | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const data = checkout.data;
  const segundos = useCuentaRegresiva(data?.carrito.reservaExpiraEn);
  const vencida = segundos === 0;

  // Dirección por defecto: la principal (o la única).
  useEffect(() => {
    if (idDireccion === null && direcciones.data?.length) {
      setIdDireccion(
        (direcciones.data.find((d) => d.esPrincipal) ?? direcciones.data[0])!.idDireccion,
      );
    }
  }, [direcciones.data, idDireccion]);

  // Envío por defecto: el más barato que aplica; se corrige si deja de aplicar.
  const opciones = useMemo(() => data?.opcionesEnvio ?? [], [data]);
  useEffect(() => {
    if (!opciones.length) return;
    const actual = opciones.find((o) => o.idMetodoEnvio === idEnvio);
    if (!actual || !actual.aplica) {
      const mejor = [...opciones].filter((o) => o.aplica).sort((a, b) => a.total - b.total)[0];
      setIdEnvio(mejor?.idMetodoEnvio ?? null);
    }
  }, [opciones, idEnvio]);

  const reiniciar = useMutation({
    mutationFn: () => api<Checkout>('/checkout', { method: 'POST' }),
    onSuccess: (c) => {
      qc.setQueryData(['checkout'], c);
      setAviso(null);
      olvidarLlave();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CARRITO_VACIO')
        navigate('/carrito', { replace: true });
      else notifyError(e);
    },
  });

  const envio = opciones.find((o) => o.idMetodoEnvio === idEnvio);
  const direccion = direcciones.data?.find((d) => d.idDireccion === idDireccion);

  // Candado síncrono: `isPending` tarda un render en reflejarse y un doble clic rápido se colaría.
  const pagando = useRef(false);

  const pagar = useMutation({
    mutationFn: () =>
      api<PedidoDetalle>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': llaveDePago() },
        body: { idDireccion, idMetodoEnvio: idEnvio, totalEsperado: envio?.total },
      }),
    onSettled: () => {
      pagando.current = false;
    },
    onSuccess: (pedido) => {
      olvidarLlave();
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      notifyOk(`Pedido ${pedido.numeroPedido} confirmado.`);
      navigate(`/mis-pedidos/${pedido.idPedido}`, { replace: true, state: { nuevo: true } });
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return notifyError(e);
      if (e.code === 'TOTAL_CAMBIO') {
        olvidarLlave();
        setAviso('El total cambió desde que lo revisaste. Verifica el nuevo monto antes de pagar.');
        void checkout.refetch();
        setPaso(2);
      } else if (e.code === 'RESERVA_VENCIDA' || e.code === 'CHECKOUT_NO_INICIADO') {
        olvidarLlave();
        setAviso('Tu reserva venció. Reinicia el checkout para apartar de nuevo tus productos.');
        void qc.invalidateQueries({ queryKey: ['checkout'] });
      } else if (e.code === 'STOCK_INSUFICIENTE') {
        olvidarLlave();
        setAviso(`${e.message} Revisa tu carrito para ajustar las cantidades.`);
      } else if (e.code === 'CARRITO_VACIO') {
        navigate('/carrito', { replace: true });
      } else notifyError(e, 'No se pudo procesar el pago');
    },
  });

  const resumenLineas = useMemo(() => data?.carrito.lineas ?? [], [data]);

  if (checkout.isPending) return <Cargando texto="Reservando tus productos…" />;
  if (checkout.isError) {
    const e = checkout.error;
    if (e instanceof ApiError && e.code === 'CARRITO_VACIO') {
      return (
        <>
          <PageHeader titulo="Checkout" />
          <Alert color="blue" title="Tu carrito está vacío">
            Agrega productos para poder pagar.
            <div>
              <Button component={Link} to="/catalogo" mt="sm" size="xs">
                Ir al catálogo
              </Button>
            </div>
          </Alert>
        </>
      );
    }
    const sinStock =
      e instanceof ApiError && (e.code === 'STOCK_INSUFICIENTE' || e.code === 'VARIANTE_INACTIVA');
    return (
      <>
        <PageHeader titulo="Checkout" />
        <ErrorEstado error={e} onReintentar={() => void checkout.refetch()} />
        {sinStock && (
          <Button component={Link} to="/carrito" variant="light">
            Revisar mi carrito
          </Button>
        )}
      </>
    );
  }
  if (!data) return null;

  const carrito = data.carrito;
  const listoPaso1 = idDireccion !== null;
  const listoPaso2 = idEnvio !== null && !!envio?.aplica;

  return (
    <>
      <PageHeader
        titulo="Checkout"
        acciones={
          segundos !== null && (
            <Group gap={6} role="timer" aria-label="Tiempo de reserva restante">
              <ThemeIcon variant="light" color={segundos < 120 ? 'red' : 'blue'} radius="xl">
                <IconClockHour4 size={16} />
              </ThemeIcon>
              <Text size="sm" fw={600} c={segundos < 120 ? 'red' : undefined}>
                {vencida ? 'Reserva vencida' : `Reserva: ${mmss(segundos)}`}
              </Text>
            </Group>
          )
        }
      />

      {(vencida || aviso) && (
        <Alert
          color={vencida ? 'red' : 'orange'}
          mb="md"
          role="alert"
          title={vencida ? 'Tu reserva venció' : 'Atención'}
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {vencida
                ? 'Liberamos las unidades de tu carrito. Reinicia el checkout para apartarlas de nuevo.'
                : aviso}
            </Text>
            <Group gap="xs">
              <Button size="xs" loading={reiniciar.isPending} onClick={() => reiniciar.mutate()}>
                Reiniciar checkout
              </Button>
              <Button size="xs" variant="default" component={Link} to="/carrito">
                Volver al carrito
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stepper
            active={paso}
            onStepClick={(i) => i <= paso && setPaso(i)}
            allowNextStepsSelect={false}
            size="sm"
          >
            <Stepper.Step label="Dirección" description="¿Dónde entregamos?">
              <Card withBorder padding="md" mt="md">
                {direcciones.isPending && <Cargando />}
                {direcciones.isError && (
                  <ErrorEstado
                    error={direcciones.error}
                    onReintentar={() => void direcciones.refetch()}
                  />
                )}
                {direcciones.data && !agregando && direcciones.data.length > 0 && (
                  <Radio.Group
                    value={idDireccion === null ? '' : String(idDireccion)}
                    onChange={(v) => setIdDireccion(Number(v))}
                    aria-label="Dirección de entrega"
                  >
                    <Stack>
                      {direcciones.data.map((d) => (
                        <Radio
                          key={d.idDireccion}
                          value={String(d.idDireccion)}
                          label={<DireccionTarjeta d={d} />}
                          styles={{
                            root: {
                              border: '1px solid var(--mantine-color-gray-3)',
                              borderRadius: 8,
                              padding: 12,
                            },
                          }}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                )}
                {direcciones.data && !agregando && direcciones.data.length === 0 && (
                  <Text size="sm" c="dimmed" mb="sm">
                    Aún no tienes direcciones. Registra una para continuar.
                  </Text>
                )}
                {agregando || (direcciones.data && direcciones.data.length === 0) ? (
                  <DireccionForm
                    enviando={dirMut.crear.isPending}
                    etiquetaEnviar="Guardar y usar esta dirección"
                    onCancel={direcciones.data?.length ? () => setAgregando(false) : undefined}
                    onSubmit={async (d) => {
                      const nueva = await dirMut.crear.mutateAsync(d);
                      setIdDireccion(nueva.idDireccion);
                      setAgregando(false);
                    }}
                  />
                ) : (
                  direcciones.data && (
                    <Button variant="subtle" size="xs" mt="sm" onClick={() => setAgregando(true)}>
                      + Usar otra dirección
                    </Button>
                  )
                )}
              </Card>
              <Group justify="flex-end" mt="md">
                <Button disabled={!listoPaso1 || agregando} onClick={() => setPaso(1)}>
                  Continuar
                </Button>
              </Group>
            </Stepper.Step>

            <Stepper.Step label="Envío y cupón" description="Elige cómo recibirlo">
              <Card withBorder padding="md" mt="md">
                <Text fw={600} mb="xs">
                  Método de envío
                </Text>
                <Radio.Group
                  value={idEnvio === null ? '' : String(idEnvio)}
                  onChange={(v) => setIdEnvio(Number(v))}
                  aria-label="Método de envío"
                >
                  <Stack>
                    {opciones.map((o) => (
                      <Radio
                        key={o.idMetodoEnvio}
                        value={String(o.idMetodoEnvio)}
                        disabled={!o.aplica}
                        label={
                          <Group justify="space-between" wrap="nowrap" w="100%" gap="xl">
                            <div>
                              <Text fw={500}>{o.nombre}</Text>
                              <Text size="xs" c="dimmed">
                                {o.aplica
                                  ? `Llega en ~${o.diasEstimados} días`
                                  : 'Disponible desde Q200 de compra (después de descuentos)'}
                              </Text>
                            </div>
                            <Text fw={600}>{o.costo === 0 ? 'Gratis' : fmtMoney(o.costo)}</Text>
                          </Group>
                        }
                        styles={{
                          root: {
                            border: '1px solid var(--mantine-color-gray-3)',
                            borderRadius: 8,
                            padding: 12,
                          },
                          labelWrapper: { width: '100%' },
                          body: { width: '100%' },
                        }}
                      />
                    ))}
                  </Stack>
                </Radio.Group>
                <Divider my="md" />
                <Text fw={600} mb="xs">
                  Cupón de descuento
                </Text>
                <Cupon carrito={carrito} />
              </Card>
              <Group justify="space-between" mt="md">
                <Button variant="default" onClick={() => setPaso(0)}>
                  Atrás
                </Button>
                <Button disabled={!listoPaso2} onClick={() => setPaso(2)}>
                  Continuar
                </Button>
              </Group>
            </Stepper.Step>

            <Stepper.Step label="Pagar" description="Confirma tu pedido">
              <Card withBorder padding="md" mt="md">
                <Stack gap="md">
                  <div>
                    <Text fw={600}>Entrega en</Text>
                    {direccion && <DireccionTarjeta d={direccion} />}
                  </div>
                  <div>
                    <Text fw={600}>Envío</Text>
                    <Text size="sm">
                      {envio?.nombre} · ~{envio?.diasEstimados} días ·{' '}
                      {envio && (envio.costo === 0 ? 'Gratis' : fmtMoney(envio.costo))}
                    </Text>
                  </div>
                  <Alert color="blue" variant="light">
                    El pago es simulado: se aprobará automáticamente al confirmar.
                  </Alert>
                </Stack>
              </Card>
              <Group justify="space-between" mt="md">
                <Button variant="default" onClick={() => setPaso(1)} disabled={pagar.isPending}>
                  Atrás
                </Button>
                <Button
                  size="md"
                  loading={pagar.isPending}
                  disabled={vencida || !listoPaso1 || !listoPaso2 || !envio}
                  onClick={() => {
                    if (pagando.current) return;
                    pagando.current = true;
                    pagar.mutate();
                  }}
                >
                  Pagar {envio ? fmtMoney(envio.total) : ''}
                </Button>
              </Group>
            </Stepper.Step>
          </Stepper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="md" radius="md">
            <Text fw={600} mb="sm">
              Resumen
            </Text>
            <Stack gap="xs">
              {resumenLineas.map((l) => (
                <Group key={l.idCarritoLinea} wrap="nowrap" align="flex-start" gap="sm">
                  <div style={{ width: 44, flexShrink: 0 }}>
                    <ProductImage src={l.imagen} alt={l.nombreProducto} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" lineClamp={1}>
                      {l.cantidad} × {l.nombreProducto}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {fmtAtributos(l.atributos)}
                    </Text>
                  </div>
                  <Text size="sm">{fmtMoney(l.totalLinea)}</Text>
                </Group>
              ))}
            </Stack>
            <Divider my="sm" />
            <Stack gap={4}>
              <Linea etiqueta="Subtotal" valor={fmtMoney(carrito.subtotal)} />
              {carrito.descuento > 0 && (
                <Linea
                  etiqueta="Descuento"
                  valor={`− ${fmtMoney(carrito.descuento)}`}
                  color="green"
                />
              )}
              <Linea
                etiqueta="Envío"
                valor={envio ? (envio.costo === 0 ? 'Gratis' : fmtMoney(envio.costo)) : '—'}
              />
              <Divider my={4} />
              <Linea
                etiqueta="Total"
                valor={envio ? fmtMoney(envio.total) : fmtMoney(carrito.total)}
                fuerte
              />
              {envio && (
                <Text size="xs" c="dimmed">
                  Incluye IVA de {fmtMoney(envio.iva)}
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}

function Linea({
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
      <Text size={fuerte ? 'md' : 'sm'} fw={fuerte ? 700 : 400}>
        {etiqueta}
      </Text>
      <Text size={fuerte ? 'md' : 'sm'} fw={fuerte ? 700 : 500} c={color}>
        {valor}
      </Text>
    </Group>
  );
}
