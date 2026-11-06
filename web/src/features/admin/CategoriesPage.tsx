import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import {
  CategoriaInputSchema,
  CategoriaUpdateInputSchema,
  type Categoria,
} from '@shopcart/contracts';
import { api, ApiError } from '../../shared/api/client';
import { zodValidate } from '../../shared/form';
import { notifyError, notifyOk } from '../../shared/notify';
import { ConfirmButton } from '../../shared/ui/ConfirmButton';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useCategorias } from '../catalog/api';

export default function CategoriesPage() {
  const categorias = useCategorias(true);
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Categoria | 'nueva' | null>(null);

  const desactivar = useMutation({
    mutationFn: (id: number) => api<void>(`/catalog/categorias/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorias'] }),
  });

  const columnas: Column<Categoria>[] = [
    { key: 'n', header: 'Nombre', render: (c) => <Text fw={600}>{c.nombre}</Text> },
    { key: 'd', header: 'Descripción', render: (c) => c.descripcion ?? <Text c="dimmed">—</Text> },
    { key: 'p', header: 'Productos activos', align: 'right', render: (c) => c.productosActivos },
    {
      key: 'a',
      header: 'Estado',
      render: (c) => (
        <Badge color={c.activo ? 'green' : 'gray'} variant="light">
          {c.activo ? 'Activa' : 'Inactiva'}
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
              titulo="Desactivar categoría"
              mensaje={`¿Desactivar «${c.nombre}»? Dejará de mostrarse en la tienda; no se elimina.`}
              etiquetaConfirmar="Desactivar"
              onConfirm={() =>
                desactivar.mutateAsync(c.idCategoria).then(
                  () => notifyOk('Categoría desactivada.'),
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
        titulo="Categorías"
        acciones={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nueva')}>
            Nueva categoría
          </Button>
        }
      />
      <Estados
        query={categorias}
        esVacio={(d) => d.length === 0}
        vacio={
          <Vacio
            titulo="Sin categorías"
            accion={<Button onClick={() => setEditando('nueva')}>Crear la primera</Button>}
          />
        }
      >
        {(d) => <DataTable rows={d} columns={columnas} rowKey={(c) => c.idCategoria} />}
      </Estados>
      {editando && (
        <CategoriaModal
          cat={editando === 'nueva' ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}

function CategoriaModal({ cat, onClose }: { cat: Categoria | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: {
      nombre: cat?.nombre ?? '',
      descripcion: cat?.descripcion ?? '',
      activo: cat?.activo ?? true,
    },
    validate: (v) =>
      zodValidate(cat ? CategoriaUpdateInputSchema : CategoriaInputSchema)({
        ...v,
        descripcion: v.descripcion.trim() || null,
      }),
    validateInputOnBlur: true,
  });
  const guardar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const body = {
        nombre: v.nombre.trim(),
        descripcion: v.descripcion.trim() || null,
        ...(cat ? { activo: v.activo } : {}),
      };
      return cat
        ? api(`/catalog/categorias/${cat.idCategoria}`, { method: 'PUT', body })
        : api('/catalog/categorias', { method: 'POST', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categorias'] });
      notifyOk('Categoría guardada.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else if (e instanceof ApiError && e.code === 'DUPLICADO')
        form.setFieldError('nombre', 'Ya existe una categoría con ese nombre');
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });
  return (
    <Modal opened onClose={onClose} title={cat ? 'Editar categoría' : 'Nueva categoría'} centered>
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          setError(null);
          guardar.mutate(v);
        })}
      >
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <TextInput label="Nombre" data-autofocus {...form.getInputProps('nombre')} />
          <Textarea
            label="Descripción (opcional)"
            autosize
            minRows={2}
            {...form.getInputProps('descripcion')}
          />
          {cat && (
            <Switch
              label="Categoría activa"
              {...form.getInputProps('activo', { type: 'checkbox' })}
            />
          )}
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
