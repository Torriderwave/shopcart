import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { CuponInputSchema, TIPOS_CUPON, type Cupon } from '@shopcart/contracts';
import { api, apiPaged, ApiError } from '../../shared/api/client';
import { fmtDateTime, fmtMoney } from '../../shared/format';
import { zodValidate } from '../../shared/form';
import { gtInputToIso, isoToGtInput } from '../../shared/gt-time';
import { useDebounced } from '../../shared/hooks/useDebounced';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { notifyError, notifyOk } from '../../shared/notify';
import { ConfirmButton } from '../../shared/ui/ConfirmButton';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useCategorias } from '../catalog/api';

export default function CouponsPage() {
  const qc = useQueryClient();
  const { values, set } = useUrlFilters({ sort: 'codigo:asc', page: '1' });
  const [texto, setTexto] = useState(values.q ?? '');
  const textoD = useDebounced(texto);
  useEffect(() => {
    if (textoD !== (values.q ?? '')) set({ q: textoD });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoD]);
  const [editando, setEditando] = useState<Cupon | 'nuevo' | null>(null);

  const cupones = useQuery({
    queryKey: ['cupones', values],
    queryFn: () =>
      apiPaged<Cupon>('/coupons', {
        query: {
          q: values.q,
          activo: values.activo,
          vigente: values.vigente,
          sort: values.sort,
          page: values.page,
          pageSize: 15,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const desactivar = useMutation({
    mutationFn: (id: number) => api<void>(`/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cupones'] }),
  });

  const columnas: Column<Cupon>[] = [
    { key: 'c', header: 'Código', sort: 'codigo', render: (c) => <Text fw={700}>{c.codigo}</Text> },
    {
      key: 'v',
      header: 'Descuento',
      sort: 'valor',
      render: (c) => (
        <>
          {c.tipo === 'Porcentaje' ? `${c.valor} %` : fmtMoney(c.valor)}
          <Text size="xs" c="dimmed">
            {c.categoria ? `Solo ${c.categoria}` : 'Todo el carrito'}
            {c.montoMinimo > 0 ? ` · mín. ${fmtMoney(c.montoMinimo)}` : ''}
          </Text>
        </>
      ),
    },
    {
      key: 'u',
      header: 'Usos',
      sort: 'usos',
      align: 'right',
      render: (c) => `${c.usosTotalesActual} / ${c.usosTotalesMax}`,
    },
    { key: 'p', header: 'Por cliente', align: 'right', render: (c) => c.usosPorCliente },
    {
      key: 'h',
      header: 'Vigencia',
      sort: 'hasta',
      render: (c) => (
        <Text size="xs">
          {fmtDateTime(c.vigenteDesde)}
          <br />
          {fmtDateTime(c.vigenteHasta)}
        </Text>
      ),
    },
    {
      key: 'e',
      header: 'Estado',
      render: (c) =>
        !c.activo ? (
          <Badge color="gray" variant="light">
            Inactivo
          </Badge>
        ) : c.vigente ? (
          <Badge color="green" variant="light">
            Vigente
          </Badge>
        ) : (
          <Badge color="orange" variant="light">
            Fuera de vigencia
          </Badge>
        ),
    },
    {
      key: 'x',
      header: '',
      align: 'right',
      render: (c) => (
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconPencil size={12} />}
            onClick={() => setEditando(c)}
          >
            Editar
          </Button>
          {c.activo && (
            <ConfirmButton
              size="compact-xs"
              variant="subtle"
              color="red"
              titulo="Desactivar cupón"
              mensaje={`¿Desactivar el cupón ${c.codigo}? Ya no podrá aplicarse; su historial de usos se conserva.`}
              etiquetaConfirmar="Desactivar"
              onConfirm={() =>
                desactivar.mutateAsync(c.idCupon).then(
                  () => notifyOk('Cupón desactivado.'),
                  (e) => notifyError(e),
                )
              }
            >
              Desactivar
            </ConfirmButton>
          )}
        </Group>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Cupones"
        descripcion="Las vigencias se manejan en hora de Guatemala."
        acciones={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nuevo')}>
            Nuevo cupón
          </Button>
        }
      />
      <Card withBorder mb="md" padding="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="Buscar"
            placeholder="Código"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
          />
          <Select
            label="Estado"
            placeholder="Todos"
            clearable
            data={[
              { value: 'true', label: 'Activos' },
              { value: 'false', label: 'Inactivos' },
            ]}
            value={values.activo ?? null}
            onChange={(v) => set({ activo: v ?? undefined })}
          />
          <Select
            label="Vigencia"
            placeholder="Todos"
            clearable
            data={[
              { value: 'true', label: 'Vigentes ahora' },
              { value: 'false', label: 'No vigentes' },
            ]}
            value={values.vigente ?? null}
            onChange={(v) => set({ vigente: v ?? undefined })}
          />
        </SimpleGrid>
      </Card>
      <Estados
        query={cupones}
        esVacio={(d) => d.items.length === 0}
        vacio={<Vacio titulo="Sin cupones" descripcion="Crea un cupón o cambia los filtros." />}
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(c) => c.idCupon}
            meta={d.meta}
            sort={values.sort}
            onSort={(s) => set({ sort: s })}
            onPage={(p) => set({ page: String(p) })}
          />
        )}
      </Estados>
      {editando && (
        <CuponModal
          cupon={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}

function CuponModal({ cupon, onClose }: { cupon: Cupon | null; onClose: () => void }) {
  const qc = useQueryClient();
  const categorias = useCategorias();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      codigo: cupon?.codigo ?? '',
      tipo: (cupon?.tipo ?? 'Porcentaje') as (typeof TIPOS_CUPON)[number],
      valor: (cupon?.valor ?? '') as number | string,
      montoMinimo: (cupon?.montoMinimo ?? 0) as number | string,
      usosTotalesMax: (cupon?.usosTotalesMax ?? 100) as number | string,
      usosPorCliente: (cupon?.usosPorCliente ?? 1) as number | string,
      idCategoria: cupon?.idCategoria ? String(cupon.idCategoria) : '',
      vigenteDesde: cupon ? isoToGtInput(cupon.vigenteDesde) : '',
      vigenteHasta: cupon ? isoToGtInput(cupon.vigenteHasta) : '',
      activo: cupon?.activo ?? true,
    },
    validate: (v) => {
      const e = zodValidate(CuponInputSchema)(toBody(v));
      if (!v.vigenteDesde) e.vigenteDesde = 'Indica la fecha de inicio';
      if (!v.vigenteHasta) e.vigenteHasta = 'Indica la fecha de fin';
      return e;
    },
    validateInputOnBlur: true,
  });

  function toBody(v: typeof form.values) {
    return {
      codigo: v.codigo,
      tipo: v.tipo,
      valor: v.valor === '' ? undefined : Number(v.valor),
      montoMinimo: v.montoMinimo === '' ? 0 : Number(v.montoMinimo),
      usosTotalesMax: v.usosTotalesMax === '' ? undefined : Number(v.usosTotalesMax),
      usosPorCliente: v.usosPorCliente === '' ? undefined : Number(v.usosPorCliente),
      idCategoria: v.idCategoria ? Number(v.idCategoria) : null,
      vigenteDesde: gtInputToIso(v.vigenteDesde) || undefined,
      vigenteHasta: gtInputToIso(v.vigenteHasta) || undefined,
      activo: v.activo,
    };
  }

  const guardar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const body = CuponInputSchema.parse(toBody(v));
      return cupon
        ? api(`/coupons/${cupon.idCupon}`, { method: 'PUT', body })
        : api('/coupons', { method: 'POST', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cupones'] });
      notifyOk('Cupón guardado.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else if (e instanceof ApiError && e.code === 'DUPLICADO')
        form.setFieldError('codigo', 'Ya existe un cupón con ese código');
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={cupon ? `Editar cupón ${cupon.codigo}` : 'Nuevo cupón'}
      size="lg"
      centered
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          setError(null);
          guardar.mutate(v);
        })}
      >
        <Stack gap="sm">
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="Código"
              placeholder="VERANO20"
              data-autofocus
              {...form.getInputProps('codigo')}
              onChange={(e) => form.setFieldValue('codigo', e.currentTarget.value.toUpperCase())}
            />
            <Select
              label="Tipo"
              allowDeselect={false}
              data={[
                { value: 'Porcentaje', label: 'Porcentaje (%)' },
                { value: 'Fijo', label: 'Monto fijo (Q)' },
              ]}
              {...form.getInputProps('tipo')}
            />
            <NumberInput
              label={form.values.tipo === 'Porcentaje' ? 'Porcentaje' : 'Monto'}
              min={0}
              decimalScale={2}
              suffix={form.values.tipo === 'Porcentaje' ? ' %' : undefined}
              prefix={form.values.tipo === 'Fijo' ? 'Q' : undefined}
              {...form.getInputProps('valor')}
            />
            <NumberInput
              label="Monto mínimo de compra"
              min={0}
              decimalScale={2}
              prefix="Q"
              {...form.getInputProps('montoMinimo')}
            />
            <NumberInput
              label="Límite total de usos"
              min={1}
              allowDecimal={false}
              {...form.getInputProps('usosTotalesMax')}
            />
            <NumberInput
              label="Usos por cliente"
              min={1}
              allowDecimal={false}
              {...form.getInputProps('usosPorCliente')}
            />
            <TextInput
              label="Vigente desde"
              type="datetime-local"
              {...form.getInputProps('vigenteDesde')}
            />
            <TextInput
              label="Vigente hasta"
              type="datetime-local"
              {...form.getInputProps('vigenteHasta')}
            />
          </SimpleGrid>
          <Select
            label="Aplica a"
            allowDeselect={false}
            data={[
              { value: '', label: 'Todo el carrito' },
              ...(categorias.data ?? []).map((c) => ({
                value: String(c.idCategoria),
                label: `Solo ${c.nombre}`,
              })),
            ]}
            {...form.getInputProps('idCategoria')}
          />
          <Switch label="Cupón activo" {...form.getInputProps('activo', { type: 'checkbox' })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={guardar.isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardar.isPending}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
