import { useState } from 'react';
import {
  Badge,
  Card,
  Code,
  Grid,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Text,
  TextInput,
} from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ACCIONES_BITACORA, type EntradaBitacora } from '@shopcart/contracts';
import { apiPaged } from '../../shared/api/client';
import { fmtDateTime } from '../../shared/format';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';

const MODULOS = ['Catalogo', 'Inventario', 'Cupones', 'Pedidos', 'Usuarios'];

export default function AuditPage() {
  const { values, set } = useUrlFilters({ page: '1' });
  const [detalle, setDetalle] = useState<EntradaBitacora | null>(null);
  const rangoInvalido = !!values.desde && !!values.hasta && values.desde > values.hasta;
  const bitacora = useQuery({
    queryKey: ['audit', values],
    queryFn: () =>
      apiPaged<EntradaBitacora>('/audit', {
        query: {
          modulo: values.modulo,
          accion: values.accion,
          desde: values.desde,
          hasta: rangoInvalido ? undefined : values.hasta,
          page: values.page,
          pageSize: 20,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const columnas: Column<EntradaBitacora>[] = [
    { key: 'f', header: 'Fecha', render: (b) => fmtDateTime(b.fecha) },
    { key: 'u', header: 'Usuario', render: (b) => b.usuario },
    { key: 'm', header: 'Módulo', render: (b) => b.modulo },
    { key: 'e', header: 'Entidad', render: (b) => `${b.entidad} #${b.idEntidad}` },
    {
      key: 'a',
      header: 'Acción',
      render: (b) => (
        <Badge
          variant="light"
          color={b.accion === 'Baja' ? 'red' : b.accion === 'Alta' ? 'green' : 'blue'}
        >
          {b.accion}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Bitácora"
        descripcion="Registro inmutable de cambios. Haz clic en una fila para ver el valor anterior y el nuevo."
      />
      <Card withBorder mb="md" padding="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
          <Select
            label="Módulo"
            placeholder="Todos"
            clearable
            data={MODULOS}
            value={values.modulo ?? null}
            onChange={(v) => set({ modulo: v ?? undefined })}
          />
          <Select
            label="Acción"
            placeholder="Todas"
            clearable
            data={[...ACCIONES_BITACORA]}
            value={values.accion ?? null}
            onChange={(v) => set({ accion: v ?? undefined })}
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
      <Estados
        query={bitacora}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio
            titulo="Sin registros"
            descripcion="No hay movimientos en la bitácora con estos filtros."
          />
        }
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(b) => b.idBitacora}
            meta={d.meta}
            onPage={(p) => set({ page: String(p) })}
            onRowClick={setDetalle}
          />
        )}
      </Estados>
      <Modal
        opened={!!detalle}
        onClose={() => setDetalle(null)}
        size="xl"
        centered
        title={
          detalle
            ? `${detalle.modulo} · ${detalle.entidad} #${detalle.idEntidad} · ${detalle.accion}`
            : ''
        }
      >
        {detalle && (
          <>
            <Text size="sm" c="dimmed" mb="sm">
              {fmtDateTime(detalle.fecha)} · {detalle.usuario}
            </Text>
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text fw={600} size="sm" mb={4}>
                  Valor anterior
                </Text>
                <ScrollArea.Autosize mah={360}>
                  <Code block>
                    {detalle.valorAnterior ? JSON.stringify(detalle.valorAnterior, null, 2) : '—'}
                  </Code>
                </ScrollArea.Autosize>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text fw={600} size="sm" mb={4}>
                  Valor nuevo
                </Text>
                <ScrollArea.Autosize mah={360}>
                  <Code block>
                    {detalle.valorNuevo ? JSON.stringify(detalle.valorNuevo, null, 2) : '—'}
                  </Code>
                </ScrollArea.Autosize>
              </Grid.Col>
            </Grid>
          </>
        )}
      </Modal>
    </>
  );
}
