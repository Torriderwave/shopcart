import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AjusteInputSchema,
  EntradaInputSchema,
  TIPOS_MOVIMIENTO,
  type ExistenciaListado,
  type KardexResponse,
  type MovimientoKardex,
} from '@shopcart/contracts';
import { api, apiPaged, apiWithMeta, ApiError } from '../../shared/api/client';
import { fmtAtributos, fmtDateTime } from '../../shared/format';
import { zodValidate } from '../../shared/form';
import { useDebounced } from '../../shared/hooks/useDebounced';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { notifyOk } from '../../shared/notify';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useCategorias } from '../catalog/api';

const useExistencias = (query: Record<string, unknown>) =>
  useQuery({
    queryKey: ['existencias', query],
    queryFn: () => apiPaged<ExistenciaListado>('/inventory/existencias', { query }),
    placeholderData: keepPreviousData,
  });

type Operacion = { tipo: 'entrada' | 'ajuste'; fila: ExistenciaListado };

export function InventoryPage() {
  const navigate = useNavigate();
  const base = '/operador';
  const { values, set } = useUrlFilters({ sort: 'sku:asc', page: '1' });
  const [texto, setTexto] = useState(values.q ?? '');
  const textoD = useDebounced(texto);
  useEffect(() => {
    if (textoD !== (values.q ?? '')) set({ q: textoD });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoD]);

  const categorias = useCategorias();
  const existencias = useExistencias({
    q: values.q,
    idCategoria: values.idCategoria,
    soloSinStock: values.soloSinStock === 'true',
    sort: values.sort,
    page: values.page,
    pageSize: 20,
  });
  const [op, setOp] = useState<Operacion | null>(null);

  const columnas: Column<ExistenciaListado>[] = [
    {
      key: 'sku',
      header: 'SKU',
      sort: 'sku',
      render: (e) => (
        <Text fw={600} size="sm">
          {e.sku}
        </Text>
      ),
    },
    {
      key: 'p',
      header: 'Producto',
      sort: 'producto',
      render: (e) => (
        <>
          <Text size="sm">{e.producto}</Text>
          <Text size="xs" c="dimmed">
            {fmtAtributos(e.atributos)} · {e.categoria}
            {!e.varianteActiva && ' · inactiva'}
          </Text>
        </>
      ),
    },
    { key: 'f', header: 'Física', sort: 'fisica', align: 'right', render: (e) => e.fisica },
    { key: 'r', header: 'Reservada', align: 'right', render: (e) => e.reservada },
    {
      key: 'd',
      header: 'Disponible',
      sort: 'disponible',
      align: 'right',
      render: (e) => (
        <Badge
          color={e.disponible <= 0 ? 'red' : e.disponible <= 5 ? 'orange' : 'green'}
          variant="light"
        >
          {e.disponible}
        </Badge>
      ),
    },
    {
      key: 'a',
      header: 'Acciones',
      align: 'right',
      render: (e) => (
        <Group gap={6} justify="flex-end" wrap="nowrap" onClick={(ev) => ev.stopPropagation()}>
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => setOp({ tipo: 'entrada', fila: e })}
          >
            Entrada
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="gray"
            onClick={() => setOp({ tipo: 'ajuste', fila: e })}
          >
            Ajuste
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            component={Link}
            to={`${base}/inventario/${e.idVariante}/kardex`}
          >
            Kardex
          </Button>
        </Group>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Inventario"
        descripcion="Existencias por variante. Cada movimiento queda en el kardex."
      />
      <Card withBorder mb="md" padding="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="Buscar"
            placeholder="SKU o producto"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
          />
          <Select
            label="Categoría"
            placeholder="Todas"
            clearable
            data={(categorias.data ?? []).map((c) => ({
              value: String(c.idCategoria),
              label: c.nombre,
            }))}
            value={values.idCategoria ?? null}
            onChange={(v) => set({ idCategoria: v ?? undefined })}
          />
          <Checkbox
            mt={{ base: 0, sm: 28 }}
            label="Solo sin existencia"
            checked={values.soloSinStock === 'true'}
            onChange={(e) => set({ soloSinStock: e.currentTarget.checked ? 'true' : undefined })}
          />
        </SimpleGrid>
      </Card>
      <Estados
        query={existencias}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio titulo="Sin resultados" descripcion="Ninguna variante coincide con los filtros." />
        }
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(e) => e.idVariante}
            meta={d.meta}
            sort={values.sort}
            onSort={(s) => set({ sort: s })}
            onPage={(p) => set({ page: String(p) })}
            onRowClick={(e) => navigate(`${base}/inventario/${e.idVariante}/kardex`)}
          />
        )}
      </Estados>
      {op && (
        <MovimientoModal
          key={`${op.tipo}-${op.fila.idVariante}`}
          op={op}
          onClose={() => setOp(null)}
        />
      )}
    </>
  );
}

function MovimientoModal({ op, onClose }: { op: Operacion; onClose: () => void }) {
  const qc = useQueryClient();
  const esEntrada = op.tipo === 'entrada';
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { cantidad: '' as number | string, motivo: '' },
    validate: (v) =>
      zodValidate(esEntrada ? EntradaInputSchema : AjusteInputSchema)({
        idVariante: op.fila.idVariante,
        cantidad: v.cantidad === '' ? undefined : Number(v.cantidad),
        motivo: v.motivo,
      }),
  });

  const guardar = useMutation({
    mutationFn: (v: { cantidad: number; motivo: string }) =>
      api(esEntrada ? '/inventory/entradas' : '/inventory/ajustes', {
        method: 'POST',
        body: { idVariante: op.fila.idVariante, ...v },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['existencias'] });
      void qc.invalidateQueries({ queryKey: ['kardex'] });
      void qc.invalidateQueries({ queryKey: ['producto'] });
      notifyOk(esEntrada ? 'Entrada registrada.' : 'Ajuste registrado.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else if (e instanceof ApiError && e.code === 'AJUSTE_INVALIDO')
        form.setFieldError('cantidad', e.message);
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });

  return (
    <Modal
      opened
      onClose={onClose}
      centered
      title={`${esEntrada ? 'Entrada de mercadería' : 'Ajuste manual'} · ${op.fila.sku}`}
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          setError(null);
          guardar.mutate({ cantidad: Number(v.cantidad), motivo: v.motivo.trim() });
        })}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {op.fila.producto} · {fmtAtributos(op.fila.atributos)} — existencia física actual:{' '}
            <b>{op.fila.fisica}</b> (reservada {op.fila.reservada})
          </Text>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <NumberInput
            label={esEntrada ? 'Cantidad que ingresa' : 'Cantidad (+ suma, − resta)'}
            allowDecimal={false}
            allowNegative={!esEntrada}
            min={esEntrada ? 1 : undefined}
            data-autofocus
            {...form.getInputProps('cantidad')}
          />
          <Textarea
            label="Motivo"
            placeholder={
              esEntrada ? 'Compra a proveedor, reposición…' : 'Conteo físico, merma, daño…'
            }
            autosize
            minRows={2}
            maxLength={200}
            {...form.getInputProps('motivo')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={guardar.isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardar.isPending}>
              Registrar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ── Kardex ────────────────────────────────────────────────────────────────────

const TIPO_COLOR: Record<string, string> = {
  Entrada: 'green',
  Venta: 'blue',
  Ajuste: 'gray',
  Devolucion: 'orange',
  Cancelacion: 'grape',
};

export function KardexPage() {
  const id = Number(useParams().idVariante);
  const base = '/operador';
  const { values, set } = useUrlFilters({ page: '1' });
  const rangoInvalido = !!values.desde && !!values.hasta && values.desde > values.hasta;
  const kardex = useQuery({
    queryKey: ['kardex', id, values],
    queryFn: () =>
      apiWithMeta<KardexResponse>(`/inventory/variantes/${id}/kardex`, {
        query: {
          tipo: values.tipo,
          desde: values.desde,
          hasta: rangoInvalido ? undefined : values.hasta,
          page: values.page,
          pageSize: 20,
        },
      }),
    placeholderData: keepPreviousData,
    enabled: Number.isFinite(id),
  });

  const columnas: Column<MovimientoKardex>[] = [
    { key: 'f', header: 'Fecha', render: (m) => fmtDateTime(m.fecha) },
    {
      key: 't',
      header: 'Tipo',
      render: (m) => (
        <Badge variant="light" color={TIPO_COLOR[m.tipo] ?? 'gray'}>
          {m.tipo}
        </Badge>
      ),
    },
    {
      key: 'c',
      header: 'Cantidad',
      align: 'right',
      render: (m) => (
        <Text fw={600} c={m.cantidad < 0 ? 'red' : 'green'}>
          {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
        </Text>
      ),
    },
    { key: 'r', header: 'Resultante', align: 'right', render: (m) => m.resultante },
    {
      key: 'm',
      header: 'Motivo',
      render: (m) => (
        <>
          {m.motivo}
          {m.numeroPedido && (
            <Text size="xs" c="dimmed">
              Pedido {m.numeroPedido}
            </Text>
          )}
        </>
      ),
    },
    { key: 'u', header: 'Usuario', render: (m) => m.usuario },
  ];

  return (
    <>
      <Button component={Link} to={`${base}/inventario`} variant="subtle" size="xs" mb="sm">
        ← Volver al inventario
      </Button>
      <Estados query={kardex} vacio={null}>
        {({ data: k, meta }) => (
          <>
            <PageHeader
              titulo={`Kardex · ${k.variante.sku}`}
              descripcion={[k.variante.producto, fmtAtributos(k.variante.atributos)]
                .filter(Boolean)
                .join(' · ')}
            />
            <SimpleGrid cols={3} mb="md">
              <Stat t="Física" v={k.variante.fisica} />
              <Stat t="Reservada" v={k.variante.reservada} />
              <Stat t="Disponible" v={k.variante.disponible} />
            </SimpleGrid>
            <Card withBorder mb="md" padding="md">
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Select
                  label="Tipo"
                  placeholder="Todos"
                  clearable
                  data={[...TIPOS_MOVIMIENTO]}
                  value={values.tipo ?? null}
                  onChange={(v) => set({ tipo: v ?? undefined })}
                />
                <TextInput
                  label="Desde"
                  type="date"
                  value={values.desde ?? ''}
                  onChange={(e) => set({ desde: e.currentTarget.value || undefined })}
                />
                <TextInput
                  label="Hasta"
                  type="date"
                  value={values.hasta ?? ''}
                  error={rangoInvalido ? 'No puede ser anterior a "Desde"' : undefined}
                  onChange={(e) => set({ hasta: e.currentTarget.value || undefined })}
                />
              </SimpleGrid>
            </Card>
            {k.movimientos.length === 0 ? (
              <Vacio titulo="Sin movimientos" descripcion="No hay movimientos con estos filtros." />
            ) : (
              <DataTable
                rows={k.movimientos}
                columns={columnas}
                rowKey={(m) => m.idKardex}
                meta={meta}
                onPage={(p) => set({ page: String(p) })}
              />
            )}
          </>
        )}
      </Estados>
    </>
  );
}

function Stat({ t, v }: { t: string; v: number }) {
  return (
    <Card withBorder padding="sm" ta="center">
      <Text size="xs" c="dimmed">
        {t}
      </Text>
      <Text fw={700} size="xl">
        {v}
      </Text>
    </Card>
  );
}
