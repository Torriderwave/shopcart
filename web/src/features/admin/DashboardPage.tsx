import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Button,
  ThemeIcon,
} from '@mantine/core';
import { BarChart, DonutChart, LineChart } from '@mantine/charts';
import CountUp from '../../components/reactbits/CountUp';
import {
  IconArrowBackUp,
  IconCash,
  IconPackage,
  IconReceipt,
  IconShoppingBag,
  type Icon,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type {
  CarritoAbandonado,
  Kpis,
  PedidoResumenAdmin,
  TopProducto,
  VentaCategoria,
  VentaPeriodo,
} from '@shopcart/contracts';
import { api, apiPaged } from '../../shared/api/client';
import { fmtDate, fmtDateTime, fmtMoney, hoyGT } from '../../shared/format';
import { Cargando, ErrorEstado, Vacio } from '../../shared/ui/Estados';
import { EstadoBadge } from '../../shared/ui/Misc';
import { PageHeader } from '../../shared/ui/PageHeader';

/** Las 7 mayores categorías y el resto agrupado: la gráfica y la leyenda siguen legibles con muchas categorías. */
function topCategorias(todas: VentaCategoria[], max = 7): VentaCategoria[] {
  if (todas.length <= max + 1) return todas;
  const resto = todas.slice(max);
  return [
    ...todas.slice(0, max),
    {
      idCategoria: -1,
      categoria: `Otras (${resto.length})`,
      ventasNetas: resto.reduce((a, c) => a + c.ventasNetas, 0),
      unidades: resto.reduce((a, c) => a + c.unidades, 0),
      pedidos: resto.reduce((a, c) => a + c.pedidos, 0),
    },
  ];
}

type Agrupacion = 'dia' | 'semana' | 'mes';

const PRESETS = [
  { label: '7 días', dias: 7 },
  { label: '30 días', dias: 30 },
  { label: '90 días', dias: 90 },
  { label: '6 meses', dias: 180 },
];

function Panel({
  titulo,
  children,
  query,
}: {
  titulo: string;
  children: React.ReactNode;
  query?: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Text fw={600} mb="sm">
        {titulo}
      </Text>
      {query?.isPending ? (
        <Cargando />
      ) : query?.isError ? (
        <ErrorEstado error={query.error} onReintentar={() => void query.refetch()} />
      ) : (
        children
      )}
    </Card>
  );
}

function Kpi({
  t,
  v,
  sub,
  icon: I,
  color,
  numero,
  dinero,
}: {
  numero?: number;
  dinero?: boolean;
  t: string;
  v: string;
  sub?: string;
  icon: Icon;
  color: string;
}) {
  return (
    <Card withBorder padding="md" style={{ borderColor: 'var(--sc-border)' }}>
      <Group justify="space-between" wrap="nowrap" mb={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '.04em' }}>
          {t}
        </Text>
        <ThemeIcon variant="light" color={color} size={32} radius="xl" style={{ flexShrink: 0 }}>
          <I size={18} stroke={1.8} />
        </ThemeIcon>
      </Group>
      <Text fw={800} fz={26} lh={1.2} style={{ letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
        {numero !== undefined ? (
          <CountUp
            to={numero}
            prefix={dinero ? 'Q ' : ''}
            decimals={dinero ? 2 : 0}
            separator=","
            duration={1.4}
          />
        ) : (
          v
        )}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed" mt={2}>
          {sub}
        </Text>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const [desde, setDesde] = useState(hoyGT(-29));
  const [hasta, setHasta] = useState(hoyGT());
  const [agrup, setAgrup] = useState<Agrupacion>('dia');
  const rangoInvalido = !!desde && !!hasta && desde > hasta;
  const q = rangoInvalido ? {} : { desde, hasta };

  const kpis = useQuery({
    queryKey: ['rep', 'kpis', q],
    queryFn: () => api<Kpis>('/reports/kpis', { query: q }),
    enabled: !rangoInvalido,
  });
  const ventas = useQuery({
    queryKey: ['rep', 'ventas', q, agrup],
    queryFn: () => api<VentaPeriodo[]>('/reports/ventas', { query: { ...q, agrupacion: agrup } }),
    enabled: !rangoInvalido,
  });
  const categorias = useQuery({
    queryKey: ['rep', 'cat', q],
    queryFn: () => api<VentaCategoria[]>('/reports/ventas-categoria', { query: q }),
    enabled: !rangoInvalido,
  });
  const top = useQuery({
    queryKey: ['rep', 'top', q],
    queryFn: () => api<TopProducto[]>('/reports/top-productos', { query: { ...q, limite: 10 } }),
    enabled: !rangoInvalido,
  });
  const abandonados = useQuery({
    queryKey: ['rep', 'abandonados'],
    queryFn: () => api<CarritoAbandonado[]>('/reports/carritos-abandonados'),
  });
  const recientes = useQuery({
    queryKey: ['orders', 'admin', 'recientes'],
    queryFn: () =>
      apiPaged<PedidoResumenAdmin>('/orders', {
        query: { page: 1, pageSize: 6, sort: 'fecha:desc' },
      }),
  });

  const aplicarPreset = (dias: number) => {
    setDesde(hoyGT(-(dias - 1)));
    setHasta(hoyGT());
  };

  const etiquetaPeriodo = (p: string) =>
    agrup === 'mes' ? p.slice(0, 7) : agrup === 'semana' ? `Sem. ${p.slice(5)}` : p.slice(5);

  return (
    <>
      <PageHeader
        titulo="Dashboard"
        descripcion="Solo pedidos pagados, sin cancelados y descontando devoluciones. Fechas en hora de Guatemala."
      />
      <Card withBorder padding="md" mb="lg">
        <Group align="flex-end" wrap="wrap">
          <TextInput
            label="Desde"
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.currentTarget.value)}
          />
          <TextInput
            label="Hasta"
            type="date"
            value={hasta}
            min={desde || undefined}
            max={hoyGT()}
            error={rangoInvalido ? 'Debe ser posterior a "Desde"' : undefined}
            onChange={(e) => setHasta(e.currentTarget.value)}
          />
          <Group gap={6}>
            {PRESETS.map((p) => (
              <Button key={p.dias} size="xs" variant="light" onClick={() => aplicarPreset(p.dias)}>
                {p.label}
              </Button>
            ))}
          </Group>
        </Group>
      </Card>

      {kpis.isPending ? (
        <Cargando />
      ) : kpis.isError ? (
        <ErrorEstado error={kpis.error} onReintentar={() => void kpis.refetch()} />
      ) : kpis.data ? (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 5 }} mb="lg">
          <Kpi
            t="Ventas netas"
            v={fmtMoney(kpis.data.ventasNetas)}
            numero={kpis.data.ventasNetas}
            dinero
            sub="Sin envío, menos devoluciones"
            icon={IconCash}
            color="brand"
          />
          <Kpi
            t="Pedidos"
            v={String(kpis.data.pedidos)}
            numero={kpis.data.pedidos}
            icon={IconShoppingBag}
            color="blue"
          />
          <Kpi
            t="Ticket promedio"
            v={fmtMoney(kpis.data.ticketPromedio)}
            numero={kpis.data.ticketPromedio}
            dinero
            icon={IconReceipt}
            color="teal"
          />
          <Kpi
            t="Unidades"
            v={String(kpis.data.unidades)}
            numero={kpis.data.unidades}
            icon={IconPackage}
            color="orange"
          />
          <Kpi
            t="Devuelto"
            v={fmtMoney(kpis.data.montoDevuelto)}
            numero={kpis.data.montoDevuelto}
            dinero
            icon={IconArrowBackUp}
            color="red"
          />
        </SimpleGrid>
      ) : null}

      <Stack gap="lg">
        <Panel titulo="Ventas en el tiempo" query={ventas}>
          <SegmentedControl
            mb="md"
            size="xs"
            value={agrup}
            onChange={(v) => setAgrup(v as Agrupacion)}
            data={[
              { value: 'dia', label: 'Por día' },
              { value: 'semana', label: 'Por semana' },
              { value: 'mes', label: 'Por mes' },
            ]}
          />
          {ventas.data && ventas.data.length > 0 ? (
            <>
              <LineChart
                h={280}
                data={ventas.data.map((v) => ({
                  periodo: etiquetaPeriodo(v.periodo),
                  Ventas: v.ventasNetas,
                  Pedidos: v.pedidos,
                }))}
                dataKey="periodo"
                series={[
                  { name: 'Ventas', label: 'Ventas netas (Q)', color: 'brand.6' },
                  { name: 'Pedidos', label: 'Pedidos', color: 'orange.6', yAxisId: 'right' },
                ]}
                withRightYAxis
                yAxisProps={{
                  width: 70,
                  tickFormatter: (v: number) => `Q${Math.round(v).toLocaleString('es-GT')}`,
                }}
                curveType="monotone"
                valueFormatter={(v) => (v > 1000 ? fmtMoney(v) : String(v))}
                tickLine="x"
                withLegend
              />
            </>
          ) : (
            <Vacio
              titulo="Sin ventas en este período"
              descripcion="Prueba con un rango de fechas más amplio."
            />
          )}
        </Panel>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Panel titulo="Ventas por categoría" query={categorias}>
            {categorias.data && categorias.data.length > 0 ? (
              <Group wrap="wrap" justify="center">
                <DonutChart
                  size={200}
                  thickness={32}
                  withTooltip
                  tooltipDataSource="segment"
                  data={topCategorias(categorias.data).map((c, i) => ({
                    name: c.categoria,
                    value: c.ventasNetas,
                    color: `${['blue', 'teal', 'orange', 'grape', 'red', 'cyan', 'lime', 'pink'][i % 8]}.6`,
                  }))}
                  valueFormatter={fmtMoney}
                />
                <Stack gap={4}>
                  {topCategorias(categorias.data).map((c, i) => (
                    <Group key={c.idCategoria} gap="xs" wrap="nowrap">
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: `var(--mantine-color-${['blue', 'teal', 'orange', 'grape', 'red', 'cyan', 'lime', 'pink'][i % 8]}-6)`,
                        }}
                      />
                      <Text size="sm">{c.categoria}</Text>
                      <Text size="sm" fw={600}>
                        {fmtMoney(c.ventasNetas)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {c.unidades} u.
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Group>
            ) : (
              <Vacio titulo="Sin ventas por categoría" />
            )}
          </Panel>

          <Panel titulo="Top 10 productos" query={top}>
            {top.data && top.data.length > 0 ? (
              <BarChart
                h={300}
                orientation="vertical"
                data={top.data.map((t) => ({ producto: t.producto, Unidades: t.unidades }))}
                dataKey="producto"
                series={[{ name: 'Unidades', color: 'teal.6' }]}
                yAxisProps={{ width: 140 }}
                tickLine="x"
              />
            ) : (
              <Vacio titulo="Sin productos vendidos" />
            )}
          </Panel>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Panel titulo="Pedidos recientes" query={recientes}>
            {recientes.data && recientes.data.items.length > 0 ? (
              <Stack gap="xs">
                {recientes.data.items.map((p) => (
                  <Group key={p.idPedido} justify="space-between" wrap="nowrap">
                    <div>
                      <Anchor
                        component={Link}
                        to={`/operador/pedidos/${p.idPedido}`}
                        fw={600}
                        size="sm"
                      >
                        {p.numeroPedido}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {p.clienteNombre} · {fmtDateTime(p.fechaCreacion)}
                      </Text>
                    </div>
                    <Group gap="xs" wrap="nowrap">
                      <EstadoBadge estado={p.estadoCodigo} />
                      <Text size="sm" fw={600}>
                        {fmtMoney(p.total)}
                      </Text>
                    </Group>
                  </Group>
                ))}
                <Anchor component={Link} to="/operador/pedidos" size="sm">
                  Ver todos los pedidos →
                </Anchor>
              </Stack>
            ) : (
              <Vacio titulo="Aún no hay pedidos" />
            )}
          </Panel>

          <Panel titulo="Carritos abandonados" query={abandonados}>
            {abandonados.data && abandonados.data.length > 0 ? (
              <Table.ScrollContainer minWidth={380}>
                <Table verticalSpacing="xs" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Cliente</Table.Th>
                      <Table.Th ta="right">Artículos</Table.Th>
                      <Table.Th ta="right">Subtotal</Table.Th>
                      <Table.Th>Última actividad</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {abandonados.data.slice(0, 8).map((c) => (
                      <Table.Tr key={c.idCarrito}>
                        <Table.Td>
                          {c.cliente ?? (
                            <Text span c="dimmed">
                              Invitado
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">{c.items}</Table.Td>
                        <Table.Td ta="right">{fmtMoney(c.subtotal)}</Table.Td>
                        <Table.Td>{fmtDate(c.ultimaActividad)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <Vacio titulo="Sin carritos abandonados" />
            )}
            {abandonados.data && abandonados.data.length > 8 && (
              <Text size="xs" c="dimmed" mt="xs">
                Mostrando 8 de {abandonados.data.length}.
              </Text>
            )}
          </Panel>
        </SimpleGrid>
      </Stack>
    </>
  );
}
