import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Timeline,
} from '@mantine/core';
import { IconCheck, IconCircleCheck } from '@tabler/icons-react';
import {
  ESTADOS_PEDIDO,
  type EstadoPedido,
  type PedidoDetalle,
  type PedidoResumen,
  type PedidoResumenAdmin,
} from '@shopcart/contracts';
import { ApiError } from '../../shared/api/client';
import { fmtAtributos, fmtDateTime, fmtMoney } from '../../shared/format';
import { useDebounced } from '../../shared/hooks/useDebounced';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { notifyError, notifyOk } from '../../shared/notify';
import { ConfirmButton } from '../../shared/ui/ConfirmButton';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { ESTADO_LABEL, EstadoBadge } from '../../shared/ui/Misc';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useMisPedidos, usePedido, usePedidoAcciones, usePedidosAdmin } from './api';

const ESTADO_OPCIONES = ESTADOS_PEDIDO.map((e) => ({ value: e, label: ESTADO_LABEL[e] }));

// ── Listas ────────────────────────────────────────────────────────────────────

function FiltrosPedidos({
  values,
  set,
  conCliente,
}: {
  values: Record<string, string>;
  set: (p: Record<string, string | undefined>) => void;
  conCliente?: boolean;
}) {
  const [numero, setNumero] = useState(values.numero ?? '');
  const [cliente, setCliente] = useState(values.cliente ?? '');
  const numeroD = useDebounced(numero);
  const clienteD = useDebounced(cliente);
  useEffect(() => {
    if (numeroD !== (values.numero ?? '')) set({ numero: numeroD });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeroD]);
  useEffect(() => {
    if (clienteD !== (values.cliente ?? '')) set({ cliente: clienteD });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteD]);

  const rangoInvalido = !!values.desde && !!values.hasta && values.desde > values.hasta;
  const hay = !!(values.estado || values.desde || values.hasta || values.numero || values.cliente);

  return (
    <Card withBorder mb="md" padding="md">
      <SimpleGrid cols={{ base: 1, sm: 2, md: conCliente ? 5 : 4 }} spacing="sm">
        <TextInput
          label="N.º de pedido"
          value={numero}
          onChange={(e) => setNumero(e.currentTarget.value)}
        />
        {conCliente && (
          <TextInput
            label="Cliente"
            placeholder="Nombre o correo"
            value={cliente}
            onChange={(e) => setCliente(e.currentTarget.value)}
          />
        )}
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={ESTADO_OPCIONES}
          value={values.estado ?? null}
          onChange={(v) => set({ estado: v ?? undefined })}
        />
        <TextInput
          label="Desde"
          type="date"
          value={values.desde ?? ''}
          max={values.hasta || undefined}
          onChange={(e) => set({ desde: e.currentTarget.value || undefined })}
        />
        <TextInput
          label="Hasta"
          type="date"
          value={values.hasta ?? ''}
          min={values.desde || undefined}
          error={rangoInvalido ? 'No puede ser anterior a "Desde"' : undefined}
          onChange={(e) => set({ hasta: e.currentTarget.value || undefined })}
        />
      </SimpleGrid>
      {hay && (
        <Group mt="sm">
          <Button
            variant="subtle"
            size="xs"
            onClick={() => {
              setNumero('');
              setCliente('');
              set({
                numero: undefined,
                cliente: undefined,
                estado: undefined,
                desde: undefined,
                hasta: undefined,
              });
            }}
          >
            Limpiar filtros
          </Button>
        </Group>
      )}
    </Card>
  );
}

const queryDe = (v: Record<string, string>) => ({
  estado: v.estado,
  desde: v.desde,
  hasta: v.hasta && v.desde && v.hasta < v.desde ? undefined : v.hasta,
  numero: v.numero,
  cliente: v.cliente,
  sort: v.sort,
  page: v.page,
  pageSize: 15,
});

export function MyOrdersPage() {
  const navigate = useNavigate();
  const { values, set } = useUrlFilters({ sort: 'fecha:desc', page: '1' });
  const pedidos = useMisPedidos(queryDe(values));
  const columnas: Column<PedidoResumen>[] = [
    {
      key: 'n',
      header: 'Pedido',
      sort: 'numero',
      render: (p) => (
        <Text fw={600} style={{ whiteSpace: 'nowrap' }}>
          {p.numeroPedido}
        </Text>
      ),
    },
    { key: 'f', header: 'Fecha', sort: 'fecha', render: (p) => fmtDateTime(p.fechaCreacion) },
    {
      key: 'e',
      header: 'Estado',
      sort: 'estado',
      render: (p) => <EstadoBadge estado={p.estadoCodigo} />,
    },
    { key: 'i', header: 'Artículos', align: 'right', render: (p) => p.cantidadItems },
    { key: 't', header: 'Total', sort: 'total', align: 'right', render: (p) => fmtMoney(p.total) },
  ];
  const hay = !!(values.estado || values.desde || values.hasta || values.numero);
  return (
    <>
      <PageHeader
        titulo="Mis pedidos"
        descripcion="Consulta el estado y el historial de tus compras."
      />
      <FiltrosPedidos values={values} set={set} />
      <Estados
        query={pedidos}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio
            titulo={hay ? 'Ningún pedido coincide con los filtros' : 'Aún no tienes pedidos'}
            descripcion={hay ? undefined : 'Cuando compres, aparecerán aquí.'}
            accion={
              hay ? undefined : (
                <Button component={Link} to="/catalogo">
                  Ir al catálogo
                </Button>
              )
            }
          />
        }
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(p) => p.idPedido}
            meta={d.meta}
            sort={values.sort}
            onSort={(s) => set({ sort: s })}
            onPage={(p) => set({ page: String(p) })}
            onRowClick={(p) => navigate(`/mis-pedidos/${p.idPedido}`)}
          />
        )}
      </Estados>
    </>
  );
}

export function StaffOrdersPage() {
  const navigate = useNavigate();
  const base = '/operador';
  const { values, set } = useUrlFilters({ sort: 'fecha:desc', page: '1' });
  const pedidos = usePedidosAdmin(queryDe(values));
  const columnas: Column<PedidoResumenAdmin>[] = [
    {
      key: 'n',
      header: 'Pedido',
      sort: 'numero',
      render: (p) => (
        <Text fw={600} style={{ whiteSpace: 'nowrap' }}>
          {p.numeroPedido}
        </Text>
      ),
    },
    { key: 'f', header: 'Fecha', sort: 'fecha', render: (p) => fmtDateTime(p.fechaCreacion) },
    {
      key: 'c',
      header: 'Cliente',
      sort: 'cliente',
      render: (p) => (
        <>
          <Text size="sm">{p.clienteNombre}</Text>
          <Text size="xs" c="dimmed">
            {p.clienteCorreo}
          </Text>
        </>
      ),
    },
    {
      key: 'e',
      header: 'Estado',
      sort: 'estado',
      render: (p) => <EstadoBadge estado={p.estadoCodigo} />,
    },
    { key: 'i', header: 'Artículos', align: 'right', render: (p) => p.cantidadItems },
    { key: 't', header: 'Total', sort: 'total', align: 'right', render: (p) => fmtMoney(p.total) },
  ];
  const hay = !!(values.estado || values.desde || values.hasta || values.numero || values.cliente);
  return (
    <>
      <PageHeader
        titulo="Pedidos"
        descripcion="Prepara, despacha y gestiona los pedidos de los clientes."
      />
      <FiltrosPedidos values={values} set={set} conCliente />
      <Estados
        query={pedidos}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio
            titulo={hay ? 'Ningún pedido coincide con los filtros' : 'Todavía no hay pedidos'}
          />
        }
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(p) => p.idPedido}
            meta={d.meta}
            sort={values.sort}
            onSort={(s) => set({ sort: s })}
            onPage={(p) => set({ page: String(p) })}
            onRowClick={(p) => navigate(`${base}/pedidos/${p.idPedido}`)}
          />
        )}
      </Estados>
    </>
  );
}

// ── Detalle ───────────────────────────────────────────────────────────────────

export function OrderDetailPage({ modo }: { modo: 'cliente' | 'personal' }) {
  const id = Number(useParams().id);
  const location = useLocation();
  const pedido = usePedido(id);
  const base = modo === 'cliente' ? '/mis-pedidos' : '/operador/pedidos';
  const nuevo = (location.state as { nuevo?: boolean } | null)?.nuevo;

  return (
    <>
      <Button component={Link} to={base} variant="subtle" size="xs" mb="sm">
        ← Volver a pedidos
      </Button>
      <Estados query={pedido} vacio={null}>
        {(p) => (
          <>
            {nuevo && (
              <Alert
                color="green"
                icon={<IconCircleCheck />}
                title="¡Gracias por tu compra!"
                mb="md"
              >
                Tu pedido {p.numeroPedido} fue confirmado y el pago aprobado.
              </Alert>
            )}
            <Detalle p={p} modo={modo} />
          </>
        )}
      </Estados>
    </>
  );
}

function Detalle({ p, modo }: { p: PedidoDetalle; modo: 'cliente' | 'personal' }) {
  return (
    <>
      <PageHeader
        titulo={`Pedido ${p.numeroPedido}`}
        descripcion={`Realizado el ${fmtDateTime(p.fechaCreacion)}`}
        acciones={<EstadoBadge estado={p.estadoCodigo} />}
      />
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card withBorder padding={0} radius="md">
            <Table.ScrollContainer minWidth={520}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Cant.</Table.Th>
                    <Table.Th ta="right">Precio</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {p.lineas.map((l) => (
                    <Table.Tr key={l.idPedidoLinea}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {l.nombreProducto}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {fmtAtributos(l.atributos)} · {l.sku}
                        </Text>
                        {l.cantidadDevuelta > 0 && (
                          <Text size="xs" c="orange">
                            Devueltas: {l.cantidadDevuelta}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">{l.cantidad}</Table.Td>
                      <Table.Td ta="right">{fmtMoney(l.precioUnitario)}</Table.Td>
                      <Table.Td ta="right">
                        {fmtMoney(l.totalLinea)}
                        {l.descuentoLinea > 0 && (
                          <Text size="xs" c="green">
                            − {fmtMoney(l.descuentoLinea)} desc.
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          {p.devoluciones.length > 0 && (
            <Card withBorder padding="md" radius="md" mt="md">
              <Text fw={600} mb="xs">
                Devoluciones
              </Text>
              <Stack gap="sm">
                {p.devoluciones.map((d) => (
                  <div key={d.idDevolucion}>
                    <Group justify="space-between">
                      <Text size="sm">{d.motivo}</Text>
                      <Text size="sm" fw={600}>
                        {fmtMoney(d.montoTotal)}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {fmtDateTime(d.fecha)} · {d.usuario} ·{' '}
                      {d.lineas.map((l) => `${l.cantidad} × ${l.sku}`).join(', ')}
                    </Text>
                  </div>
                ))}
              </Stack>
            </Card>
          )}

          <Card withBorder padding="md" radius="md" mt="md">
            <Text fw={600} mb="sm">
              Historial
            </Text>
            <Timeline active={p.historial.length - 1} bulletSize={20} lineWidth={2}>
              {p.historial.map((h, i) => (
                <Timeline.Item
                  key={i}
                  bullet={<IconCheck size={12} />}
                  title={
                    h.estadoAnteriorNombre
                      ? `${h.estadoAnteriorNombre} → ${h.estadoNuevoNombre}`
                      : h.estadoNuevoNombre
                  }
                >
                  <Text size="xs" c="dimmed">
                    {fmtDateTime(h.fecha)} · {h.usuario}
                  </Text>
                  {h.nota && <Text size="sm">{h.nota}</Text>}
                </Timeline.Item>
              ))}
            </Timeline>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            <Card withBorder padding="md" radius="md">
              <Stack gap={4}>
                <Fila e="Subtotal" v={fmtMoney(p.subtotal)} />
                {p.descuento > 0 && (
                  <Fila
                    e={`Descuento${p.cuponCodigo ? ` (${p.cuponCodigo})` : ''}`}
                    v={`− ${fmtMoney(p.descuento)}`}
                  />
                )}
                <Fila
                  e={`Envío (${p.metodoEnvio})`}
                  v={p.costoEnvio === 0 ? 'Gratis' : fmtMoney(p.costoEnvio)}
                />
                <Divider my={4} />
                <Fila e="Total" v={fmtMoney(p.total)} fuerte />
                <Text size="xs" c="dimmed">
                  Incluye IVA de {fmtMoney(p.iva)}
                </Text>
                {p.montoDevuelto > 0 && <Fila e="Reembolsado" v={fmtMoney(p.montoDevuelto)} />}
              </Stack>
            </Card>
            <Card withBorder padding="md" radius="md">
              <Text fw={600} mb={4}>
                Entrega
              </Text>
              <Text size="sm">{p.direccion.destinatario}</Text>
              <Text size="sm" c="dimmed">
                {p.direccion.linea1}
                {p.direccion.linea2 ? `, ${p.direccion.linea2}` : ''}
              </Text>
              <Text size="sm" c="dimmed">
                {p.direccion.ciudad}, {p.direccion.departamento}
              </Text>
              <Text size="sm" c="dimmed">
                Tel. {p.direccion.telefono}
              </Text>
              {modo === 'personal' && (
                <>
                  <Divider my="xs" />
                  <Text fw={600}>Cliente</Text>
                  <Text size="sm">{p.cliente.nombre}</Text>
                  <Text size="xs" c="dimmed">
                    {p.cliente.correo}
                  </Text>
                </>
              )}
            </Card>
            <Acciones p={p} modo={modo} />
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  );
}

function Fila({ e, v, fuerte }: { e: string; v: string; fuerte?: boolean }) {
  return (
    <Group justify="space-between">
      <Text size="sm" fw={fuerte ? 700 : 400}>
        {e}
      </Text>
      <Text size="sm" fw={fuerte ? 700 : 500}>
        {v}
      </Text>
    </Group>
  );
}

// ── Acciones: cancelar, avanzar estado, devolver ───────────────────────────────

function Acciones({ p, modo }: { p: PedidoDetalle; modo: 'cliente' | 'personal' }) {
  const acc = usePedidoAcciones(p.idPedido);
  const [motivo, setMotivo] = useState('');
  const [motivoError, setMotivoError] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [devolviendo, setDevolviendo] = useState(false);

  const puedeAvanzar = modo === 'personal' ? p.acciones.transiciones : [];
  const sinAcciones =
    !p.acciones.puedeCancelar &&
    !puedeAvanzar.length &&
    !(modo === 'personal' && p.acciones.puedeDevolver);
  if (sinAcciones) return null;

  const motivoValido = (): boolean => {
    if (motivo.trim().length >= 3) return true;
    setMotivoError('Indica el motivo (mínimo 3 caracteres)');
    return false;
  };

  const cancelar = async () => {
    try {
      await acc.cancelar.mutateAsync(motivo.trim());
      notifyOk('Pedido cancelado. Las existencias fueron reintegradas.');
      setMotivo('');
    } catch (e) {
      notifyError(e);
      throw e;
    }
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Text fw={600} mb="sm">
        Acciones
      </Text>
      <Stack gap="sm">
        {puedeAvanzar.map((siguiente: EstadoPedido) => (
          <div key={siguiente}>
            <Textarea
              label="Nota (opcional)"
              autosize
              minRows={1}
              maxLength={500}
              value={nota}
              onChange={(e) => setNota(e.currentTarget.value)}
              mb="xs"
            />
            <Button
              fullWidth
              loading={acc.estado.isPending}
              onClick={() =>
                acc.estado.mutate(
                  { estado: siguiente, ...(nota.trim() ? { nota: nota.trim() } : {}) },
                  {
                    onSuccess: () => {
                      setNota('');
                      notifyOk(`Pedido marcado como ${ESTADO_LABEL[siguiente]}.`);
                    },
                    onError: (e) => notifyError(e),
                  },
                )
              }
            >
              Marcar como {ESTADO_LABEL[siguiente]}
            </Button>
          </div>
        ))}

        {modo === 'personal' && p.acciones.puedeDevolver && (
          <Button variant="light" color="orange" onClick={() => setDevolviendo(true)}>
            Registrar devolución
          </Button>
        )}

        {p.acciones.puedeCancelar && (
          <>
            <Textarea
              label="Motivo de la cancelación"
              autosize
              minRows={2}
              maxLength={500}
              value={motivo}
              error={motivoError}
              onChange={(e) => {
                setMotivo(e.currentTarget.value);
                setMotivoError(null);
              }}
            />
            <ConfirmButton
              color="red"
              variant="light"
              titulo="Cancelar pedido"
              mensaje={`¿Cancelar el pedido ${p.numeroPedido}? Se reintegrará la existencia y no se puede deshacer.`}
              etiquetaConfirmar="Sí, cancelar pedido"
              canOpen={motivoValido}
              onConfirm={cancelar}
            >
              Cancelar pedido
            </ConfirmButton>
          </>
        )}
      </Stack>
      {devolviendo && <DevolucionModal p={p} onClose={() => setDevolviendo(false)} />}
    </Card>
  );
}

function DevolucionModal({ p, onClose }: { p: PedidoDetalle; onClose: () => void }) {
  const acc = usePedidoAcciones(p.idPedido);
  const [motivo, setMotivo] = useState('');
  const [cant, setCant] = useState<Record<number, number | string>>({});
  const [error, setError] = useState<string | null>(null);

  const devolvibles = p.lineas.filter((l) => l.cantidad - l.cantidadDevuelta > 0);

  const enviar = () => {
    setError(null);
    const lineas = devolvibles
      .map((l) => ({
        idPedidoLinea: l.idPedidoLinea,
        cantidad: Number(cant[l.idPedidoLinea] ?? 0),
      }))
      .filter((l) => l.cantidad > 0);
    if (lineas.length === 0)
      return setError('Indica la cantidad a devolver en al menos una línea.');
    if (motivo.trim().length < 3)
      return setError('El motivo es obligatorio (mínimo 3 caracteres).');
    acc.devolver.mutate(
      { motivo: motivo.trim(), lineas },
      {
        onSuccess: () => {
          notifyOk('Devolución registrada. Las existencias fueron reintegradas.');
          onClose();
        },
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.'),
      },
    );
  };

  return (
    <Modal opened onClose={onClose} title={`Devolución · ${p.numeroPedido}`} size="lg" centered>
      <Stack>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Devolvible</Table.Th>
              <Table.Th w={120}>Devolver</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {devolvibles.map((l) => {
              const max = l.cantidad - l.cantidadDevuelta;
              return (
                <Table.Tr key={l.idPedidoLinea}>
                  <Table.Td>
                    <Text size="sm">{l.nombreProducto}</Text>
                    <Text size="xs" c="dimmed">
                      {fmtAtributos(l.atributos)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">{max}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={`Cantidad a devolver de ${l.nombreProducto}`}
                      size="xs"
                      min={0}
                      max={max}
                      allowDecimal={false}
                      allowNegative={false}
                      clampBehavior="strict"
                      value={cant[l.idPedidoLinea] ?? 0}
                      onChange={(v) => setCant((c) => ({ ...c, [l.idPedidoLinea]: v }))}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        <Textarea
          label="Motivo"
          required
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
          maxLength={500}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={acc.devolver.isPending}>
            Cancelar
          </Button>
          <Button color="orange" loading={acc.devolver.isPending} onClick={enviar}>
            Registrar devolución
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
