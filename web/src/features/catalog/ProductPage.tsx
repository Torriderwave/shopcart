import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Card,
  Divider,
  ThemeIcon,
  Button,
  Chip,
  Grid,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconShieldCheck,
  IconShoppingCartPlus,
  IconTruckDelivery,
} from '@tabler/icons-react';
import type { Variante } from '@shopcart/contracts';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/auth/session';
import { fmtMoney } from '../../shared/format';
import { notifyError, notifyOk } from '../../shared/notify';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { ProductImage } from '../../shared/ui/Misc';
import { useCartMutations } from '../cart/api';
import { useProducto, useProductos } from './api';
import { ProductCard } from './ProductCard';

export default function ProductPage() {
  const id = Number(useParams().id);
  const producto = useProducto(id);
  if (producto.error instanceof ApiError && producto.error.code === 'NO_ENCONTRADO') {
    return <ProductoNoEncontrado />;
  }
  return (
    <Estados query={producto} vacio={null} children={(p) => <Detalle key={p.idProducto} p={p} />} />
  );
}

function Detalle({ p }: { p: NonNullable<ReturnType<typeof useProducto>['data']> }) {
  const { usuario } = useSession();
  const navigate = useNavigate();
  const { agregar } = useCartMutations();
  const esPersonal = usuario?.rol === 'Operador' || usuario?.rol === 'Administrador';

  const variantes = useMemo(() => p.variantes.filter((v) => v.activo), [p.variantes]);
  const claves = useMemo(
    () => [...new Set(variantes.flatMap((v) => Object.keys(v.atributos)))],
    [variantes],
  );

  // Selección inicial: la primera variante con existencia (o la primera).
  const inicial = variantes.find((v) => v.disponible > 0) ?? variantes[0];
  const [sel, setSel] = useState<Record<string, string>>(inicial?.atributos ?? {});
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [imagen, setImagen] = useState(0);
  const [errorCarrito, setErrorCarrito] = useState<string | null>(null);

  const variante: Variante | undefined = variantes.find((v) =>
    claves.every((k) => v.atributos[k] === sel[k]),
  );

  // Al cambiar de variante, la cantidad se ajusta a su existencia.
  useEffect(() => {
    setErrorCarrito(null);
    if (variante && Number(cantidad) > variante.disponible && variante.disponible > 0) {
      setCantidad(variante.disponible);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variante?.idVariante]);

  const valoresDe = (clave: string) =>
    [...new Set(variantes.map((v) => v.atributos[clave]).filter(Boolean))] as string[];

  // Un valor está habilitado si existe alguna variante con él compatible con el resto de la selección.
  const compatible = (clave: string, valor: string) =>
    variantes.some(
      (v) =>
        v.atributos[clave] === valor &&
        claves.every((k) => k === clave || v.atributos[k] === sel[k]),
    );

  const elegir = (clave: string, valor: string) => {
    const next = { ...sel, [clave]: valor };
    // Si la combinación no existe, se toma la primera variante que contenga el valor elegido.
    const existe = variantes.some((v) => claves.every((k) => v.atributos[k] === next[k]));
    if (existe) setSel(next);
    else {
      const alt = variantes.find((v) => v.atributos[clave] === valor);
      if (alt) setSel(alt.atributos);
    }
  };

  const agotada = !variante || variante.disponible <= 0;
  const cantidadNum = Number(cantidad);
  const cantidadValida =
    Number.isInteger(cantidadNum) &&
    cantidadNum >= 1 &&
    (!variante || cantidadNum <= variante.disponible);

  const agregarAlCarrito = () => {
    if (!variante || !cantidadValida) return;
    setErrorCarrito(null);
    agregar.mutate(
      { idVariante: variante.idVariante, cantidad: cantidadNum },
      {
        onSuccess: () => notifyOk(`${p.nombre} se agregó al carrito.`),
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'VALIDACION')
            setErrorCarrito('Cantidad inválida.');
          else if (e instanceof ApiError) setErrorCarrito(e.message);
          else notifyError(e);
        },
      },
    );
  };

  const imagenes = p.imagenes.length ? p.imagenes : [];
  const actual = imagenes[imagen]?.url ?? p.imagenPrincipal;

  return (
    <>
      <Breadcrumbs mb="md">
        <Anchor component={Link} to="/catalogo" size="sm">
          Catálogo
        </Anchor>
        <Anchor component={Link} to={`/catalogo?idCategoria=${p.categoria.idCategoria}`} size="sm">
          {p.categoria.nombre}
        </Anchor>
        <Text size="sm">{p.nombre}</Text>
      </Breadcrumbs>
      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card padding="xs" withBorder style={{ borderColor: 'var(--sc-border)' }}>
            <div
              className="zoom-frame"
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty(
                  '--zx',
                  `${((e.clientX - r.left) / r.width) * 100}%`,
                );
                e.currentTarget.style.setProperty(
                  '--zy',
                  `${((e.clientY - r.top) / r.height) * 100}%`,
                );
              }}
            >
              <ProductImage src={actual} alt={p.nombre} radius="md" />
            </div>
          </Card>
          {imagenes.length > 1 && (
            <SimpleGrid cols={5} mt="sm" spacing="xs">
              {imagenes.map((im, i) => (
                <UnstyledButton
                  key={im.idImagen}
                  onClick={() => setImagen(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  style={{
                    outline: i === imagen ? '3px solid var(--mantine-color-brand-6)' : 'none',
                    outlineOffset: 2,
                    borderRadius: 8,
                    opacity: i === imagen ? 1 : 0.7,
                  }}
                >
                  <ProductImage src={im.url} alt={`${p.nombre} ${i + 1}`} radius="sm" />
                </UnstyledButton>
              ))}
            </SimpleGrid>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="xl" style={{ borderColor: 'var(--sc-border)' }}>
            <Stack gap="md">
              <div>
                <Badge variant="light" mb={6}>
                  {p.categoria.nombre}
                </Badge>
                <Title order={1} fz={30}>
                  {p.nombre}
                </Title>
              </div>
              <Text fz={34} fw={800} c="brand.7" style={{ letterSpacing: '-0.03em' }}>
                {variante
                  ? fmtMoney(variante.precio)
                  : p.precioDesde !== null
                    ? fmtMoney(p.precioDesde)
                    : '—'}
                <Text span size="xs" c="dimmed" ml={6}>
                  IVA incluido
                </Text>
              </Text>
              {p.descripcion && <Text c="dimmed">{p.descripcion}</Text>}

              {claves.map((clave) => (
                <div key={clave}>
                  <Text fw={600} size="sm" mb={6}>
                    {clave}
                  </Text>
                  <Chip.Group
                    multiple={false}
                    value={sel[clave] ?? ''}
                    onChange={(v) => elegir(clave, v)}
                  >
                    <Group gap="xs">
                      {valoresDe(clave).map((valor) => (
                        <Chip
                          key={valor}
                          value={valor}
                          variant="outline"
                          size="md"
                          disabled={!compatible(clave, valor)}
                        >
                          {valor}
                        </Chip>
                      ))}
                    </Group>
                  </Chip.Group>
                </div>
              ))}

              {variantes.length === 0 ? (
                <Alert color="gray">Este producto no tiene variantes a la venta.</Alert>
              ) : (
                <>
                  <Group gap="sm">
                    {variante && (
                      <Text size="sm" c="dimmed">
                        SKU {variante.sku}
                      </Text>
                    )}
                    {variante &&
                      (variante.disponible <= 0 ? (
                        <Badge color="red" variant="light">
                          Agotado
                        </Badge>
                      ) : variante.disponible <= 5 ? (
                        <Badge color="orange" variant="light">
                          ¡Últimas {variante.disponible} unidades!
                        </Badge>
                      ) : (
                        <Badge color="green" variant="light">
                          Disponible
                        </Badge>
                      ))}
                  </Group>

                  {esPersonal ? (
                    <Alert color="blue">Las cuentas de personal no realizan compras.</Alert>
                  ) : (
                    <Group align="flex-end" wrap="wrap">
                      <NumberInput
                        label="Cantidad"
                        w={120}
                        min={1}
                        max={variante?.disponible ?? 1}
                        allowDecimal={false}
                        allowNegative={false}
                        clampBehavior="strict"
                        value={cantidad}
                        onChange={setCantidad}
                        disabled={agotada}
                        error={!agotada && !cantidadValida ? 'Cantidad no válida' : undefined}
                      />
                      <Button
                        leftSection={<IconShoppingCartPlus size={18} />}
                        onClick={agregarAlCarrito}
                        loading={agregar.isPending}
                        disabled={agotada || !cantidadValida}
                      >
                        {agotada ? 'Agotado' : 'Agregar al carrito'}
                      </Button>
                      <Button variant="light" onClick={() => navigate('/carrito')}>
                        Ver carrito
                      </Button>
                    </Group>
                  )}
                  {errorCarrito && (
                    <Alert color="red" role="alert">
                      {errorCarrito}
                    </Alert>
                  )}
                </>
              )}
              <Divider />
              <Stack gap="xs">
                {[
                  { I: IconTruckDelivery, t: 'Envío gratis desde Q200 tras descuentos' },
                  { I: IconArrowBackUp, t: 'Devoluciones con reembolso proporcional' },
                  { I: IconShieldCheck, t: 'Tu stock se reserva al iniciar el pago' },
                ].map(({ I, t }) => (
                  <Group key={t} gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" size="md" radius="xl">
                      <I size={16} />
                    </ThemeIcon>
                    <Text size="sm" c="dimmed">
                      {t}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
      <Relacionados idCategoria={p.categoria.idCategoria} idActual={p.idProducto} />
    </>
  );
}

function Relacionados({ idCategoria, idActual }: { idCategoria: number; idActual: number }) {
  const lista = useProductos({ idCategoria, pageSize: 5, sort: 'recientes:desc' });
  const items = (lista.data?.items ?? []).filter((x) => x.idProducto !== idActual).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section style={{ marginTop: 56 }} aria-label="Productos relacionados">
      <Title order={3} mb="md">
        También te puede gustar
      </Title>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="lg">
        {items.map((x, i) => (
          <ProductCard key={x.idProducto} producto={x} indice={i} />
        ))}
      </SimpleGrid>
    </section>
  );
}

export function ProductoNoEncontrado() {
  return (
    <Vacio
      titulo="Producto no encontrado"
      descripcion="Puede que ya no esté disponible."
      accion={
        <Button component={Link} to="/catalogo">
          Volver al catálogo
        </Button>
      }
    />
  );
}
