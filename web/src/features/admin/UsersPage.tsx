import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  PasswordInput,
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
import {
  ActualizarUsuarioInputSchema,
  CrearUsuarioInputSchema,
  ROLES,
  type Rol,
  type Usuario,
} from '@shopcart/contracts';
import { api, apiPaged, ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/auth/session';
import { fmtDate } from '../../shared/format';
import { zodValidate } from '../../shared/form';
import { useDebounced } from '../../shared/hooks/useDebounced';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { notifyOk } from '../../shared/notify';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';

export default function UsersPage() {
  const { usuario: yo } = useSession();
  const { values, set } = useUrlFilters({ sort: 'nombre:asc', page: '1' });
  const [texto, setTexto] = useState(values.q ?? '');
  const textoD = useDebounced(texto);
  useEffect(() => {
    if (textoD !== (values.q ?? '')) set({ q: textoD });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoD]);
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);

  const usuarios = useQuery({
    queryKey: ['usuarios', values],
    queryFn: () =>
      apiPaged<Usuario>('/admin/usuarios', {
        query: {
          q: values.q,
          rol: values.rol,
          activo: values.activo,
          sort: values.sort,
          page: values.page,
          pageSize: 15,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const columnas: Column<Usuario>[] = [
    { key: 'n', header: 'Nombre', sort: 'nombre', render: (u) => <Text fw={600}>{u.nombre}</Text> },
    { key: 'c', header: 'Correo', sort: 'correo', render: (u) => u.correo },
    { key: 'r', header: 'Rol', sort: 'rol', render: (u) => <Badge variant="light">{u.rol}</Badge> },
    {
      key: 'a',
      header: 'Estado',
      render: (u) => (
        <Badge color={u.activo ? 'green' : 'gray'} variant="light">
          {u.activo ? 'Activo' : 'Desactivado'}
        </Badge>
      ),
    },
    { key: 'f', header: 'Alta', sort: 'fecha', render: (u) => fmtDate(u.fechaCreacion) },
    {
      key: 'x',
      header: '',
      align: 'right',
      render: (u) => (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPencil size={12} />}
          onClick={() => setEditando(u)}
        >
          Editar
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion="Los usuarios se desactivan, nunca se borran: conservan su historial."
        acciones={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nuevo')}>
            Nuevo usuario
          </Button>
        }
      />
      <Card withBorder mb="md" padding="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="Buscar"
            placeholder="Nombre o correo"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
          />
          <Select
            label="Rol"
            placeholder="Todos"
            clearable
            data={[...ROLES]}
            value={values.rol ?? null}
            onChange={(v) => set({ rol: v ?? undefined })}
          />
          <Select
            label="Estado"
            placeholder="Todos"
            clearable
            data={[
              { value: 'true', label: 'Activos' },
              { value: 'false', label: 'Desactivados' },
            ]}
            value={values.activo ?? null}
            onChange={(v) => set({ activo: v ?? undefined })}
          />
        </SimpleGrid>
      </Card>
      <Estados
        query={usuarios}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio titulo="Sin usuarios" descripcion="Ningún usuario coincide con los filtros." />
        }
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(u) => u.idUsuario}
            meta={d.meta}
            sort={values.sort}
            onSort={(s) => set({ sort: s })}
            onPage={(p) => set({ page: String(p) })}
          />
        )}
      </Estados>
      {editando && (
        <UsuarioModal
          usuario={editando === 'nuevo' ? null : editando}
          esYo={editando !== 'nuevo' && editando.idUsuario === yo?.idUsuario}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}

function UsuarioModal({
  usuario,
  esYo,
  onClose,
}: {
  usuario: Usuario | null;
  esYo: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: {
      nombre: usuario?.nombre ?? '',
      correo: usuario?.correo ?? '',
      contrasena: '',
      rol: (usuario?.rol ?? 'Cliente') as Rol,
      activo: usuario?.activo ?? true,
    },
    validate: (v) =>
      usuario
        ? zodValidate(ActualizarUsuarioInputSchema)({
            nombre: v.nombre,
            rol: v.rol,
            activo: v.activo,
          })
        : zodValidate(CrearUsuarioInputSchema)(v),
    validateInputOnBlur: true,
  });
  const guardar = useMutation({
    mutationFn: (v: typeof form.values) =>
      usuario
        ? api(`/admin/usuarios/${usuario.idUsuario}`, {
            method: 'PATCH',
            body: { nombre: v.nombre.trim(), rol: v.rol, activo: v.activo },
          })
        : api('/admin/usuarios', {
            method: 'POST',
            body: { nombre: v.nombre, correo: v.correo, contrasena: v.contrasena, rol: v.rol },
          }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      notifyOk('Usuario guardado.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else if (e instanceof ApiError && e.code === 'DUPLICADO')
        form.setFieldError('correo', 'Ya existe un usuario con este correo');
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });
  return (
    <Modal opened onClose={onClose} title={usuario ? 'Editar usuario' : 'Nuevo usuario'} centered>
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
          <TextInput
            label="Correo"
            type="email"
            disabled={!!usuario}
            {...form.getInputProps('correo')}
          />
          {!usuario && (
            <PasswordInput
              label="Contraseña inicial"
              description="Mínimo 8 caracteres"
              autoComplete="new-password"
              {...form.getInputProps('contrasena')}
            />
          )}
          <Select
            label="Rol"
            allowDeselect={false}
            data={[...ROLES]}
            disabled={esYo}
            description={esYo ? 'No puedes cambiar tu propio rol' : undefined}
            {...form.getInputProps('rol')}
          />
          {usuario && (
            <Switch
              label="Cuenta activa"
              disabled={esYo}
              description={
                esYo
                  ? 'No puedes desactivarte a ti mismo'
                  : 'Si se desactiva, no podrá iniciar sesión.'
              }
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
