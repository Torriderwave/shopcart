import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
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
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  ImagenInputSchema,
  ProductoInputSchema,
  ProductoUpdateInputSchema,
  VarianteInputSchema,
  VarianteUpdateInputSchema,
  type ProductoDetalle,
  type Variante,
} from '@shopcart/contracts';
import { api, ApiError } from '../../shared/api/client';
import { fmtAtributos, fmtMoney } from '../../shared/format';
import { zodValidate } from '../../shared/form';
import { notifyError, notifyOk } from '../../shared/notify';
import { ConfirmButton } from '../../shared/ui/ConfirmButton';
import { Estados } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProductImage } from '../../shared/ui/Misc';
import { useCategorias, useProducto } from '../catalog/api';

export default function ProductEditorPage() {
  const param = useParams().id;
  if (param === 'nuevo') return <NuevoProducto />;
  return <EditarProducto id={Number(param)} />;
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['producto'] });
    void qc.invalidateQueries({ queryKey: ['productos'] });
    void qc.invalidateQueries({ queryKey: ['existencias'] });
  };
}

// ── Alta ──────────────────────────────────────────────────────────────────────

function NuevoProducto() {
  const navigate = useNavigate();
  const invalidar = useInvalidar();
  return (
    <>
      <Button component={Link} to="/admin/catalogo" variant="subtle" size="xs" mb="sm">
        ← Volver a productos
      </Button>
      <PageHeader
        titulo="Nuevo producto"
        descripcion="Primero los datos generales; después podrás agregar variantes e imágenes."
      />
      <Card withBorder padding="md" maw={640}>
        <DatosProducto
          onGuardado={(r) => {
            invalidar();
            notifyOk('Producto creado. Agrega ahora sus variantes.');
            navigate(`/admin/catalogo/${r.idProducto}`, { replace: true });
          }}
        />
      </Card>
    </>
  );
}

// ── Edición ───────────────────────────────────────────────────────────────────

function EditarProducto({ id }: { id: number }) {
  const producto = useProducto(id, true);
  return (
    <>
      <Button component={Link} to="/admin/catalogo" variant="subtle" size="xs" mb="sm">
        ← Volver a productos
      </Button>
      <Estados query={producto} vacio={null}>
        {(p) => (
          <>
            <PageHeader
              titulo={p.nombre}
              descripcion={p.categoria.nombre}
              acciones={
                <Badge color={p.activo ? 'green' : 'gray'} variant="light" size="lg">
                  {p.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              }
            />
            <Stack gap="lg">
              <Card withBorder padding="md">
                <Text fw={600} mb="sm">
                  Datos generales
                </Text>
                <DatosProducto producto={p} onGuardado={() => notifyOk('Producto actualizado.')} />
              </Card>
              <Variantes p={p} />
              <Imagenes p={p} />
            </Stack>
          </>
        )}
      </Estados>
    </>
  );
}

function DatosProducto({
  producto,
  onGuardado,
}: {
  producto?: ProductoDetalle;
  onGuardado: (r: { idProducto: number }) => void;
}) {
  const categorias = useCategorias(true);
  const invalidar = useInvalidar();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: {
      idCategoria: producto ? String(producto.categoria.idCategoria) : '',
      nombre: producto?.nombre ?? '',
      descripcion: producto?.descripcion ?? '',
      activo: producto?.activo ?? true,
    },
    validate: (v) =>
      zodValidate(producto ? ProductoUpdateInputSchema : ProductoInputSchema)({
        ...v,
        idCategoria: Number(v.idCategoria) || undefined,
      }),
    validateInputOnBlur: true,
  });
  const guardar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const body = {
        idCategoria: Number(v.idCategoria),
        nombre: v.nombre.trim(),
        descripcion: v.descripcion.trim(),
        ...(producto ? { activo: v.activo } : {}),
      };
      return producto
        ? api<{ idProducto: number }>(`/catalog/productos/${producto.idProducto}`, {
            method: 'PUT',
            body,
          })
        : api<{ idProducto: number }>('/catalog/productos', { method: 'POST', body });
    },
    onSuccess: (r) => {
      invalidar();
      onGuardado(r);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });
  return (
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
        <TextInput label="Nombre" {...form.getInputProps('nombre')} />
        <Select
          label="Categoría"
          placeholder="Selecciona"
          searchable
          data={(categorias.data ?? [])
            .filter((c) => c.activo || String(c.idCategoria) === form.values.idCategoria)
            .map((c) => ({ value: String(c.idCategoria), label: c.nombre }))}
          {...form.getInputProps('idCategoria')}
        />
        <Textarea
          label="Descripción"
          autosize
          minRows={3}
          maxLength={2000}
          {...form.getInputProps('descripcion')}
        />
        {producto && (
          <Switch
            label="Producto activo (visible en la tienda)"
            {...form.getInputProps('activo', { type: 'checkbox' })}
          />
        )}
        <Group justify="flex-end">
          <Button type="submit" loading={guardar.isPending}>
            {producto ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

// ── Variantes ─────────────────────────────────────────────────────────────────

function Variantes({ p }: { p: ProductoDetalle }) {
  const [editando, setEditando] = useState<Variante | 'nueva' | null>(null);
  const invalidar = useInvalidar();
  const desactivar = useMutation({
    mutationFn: (id: number) => api<void>(`/catalog/variantes/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar,
  });
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>Variantes</Text>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditando('nueva')}>
          Agregar variante
        </Button>
      </Group>
      {p.variantes.length === 0 ? (
        <Text size="sm" c="dimmed">
          Este producto aún no tiene variantes; no se puede vender hasta crear una.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>SKU</Table.Th>
                <Table.Th>Atributos</Table.Th>
                <Table.Th ta="right">Precio</Table.Th>
                <Table.Th ta="right">Disponible</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {p.variantes.map((v) => (
                <Table.Tr key={v.idVariante}>
                  <Table.Td fw={600}>{v.sku}</Table.Td>
                  <Table.Td>{fmtAtributos(v.atributos) || '—'}</Table.Td>
                  <Table.Td ta="right">{fmtMoney(v.precio)}</Table.Td>
                  <Table.Td ta="right">{v.disponible}</Table.Td>
                  <Table.Td>
                    <Badge color={v.activo ? 'green' : 'gray'} variant="light">
                      {v.activo ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                      <Button size="compact-xs" variant="light" onClick={() => setEditando(v)}>
                        Editar
                      </Button>
                      {v.activo && (
                        <ConfirmButton
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          titulo="Desactivar variante"
                          mensaje={`¿Desactivar la variante ${v.sku}? Dejará de venderse; los pedidos anteriores no cambian.`}
                          etiquetaConfirmar="Desactivar"
                          onConfirm={() =>
                            desactivar.mutateAsync(v.idVariante).then(
                              () => notifyOk('Variante desactivada.'),
                              (e) => notifyError(e),
                            )
                          }
                        >
                          Desactivar
                        </ConfirmButton>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {editando && (
        <VarianteModal
          idProducto={p.idProducto}
          variante={editando === 'nueva' ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </Card>
  );
}

interface AttrRow {
  clave: string;
  valor: string;
}

function VarianteModal({
  idProducto,
  variante,
  onClose,
}: {
  idProducto: number;
  variante: Variante | null;
  onClose: () => void;
}) {
  const invalidar = useInvalidar();
  const [error, setError] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<AttrRow[]>(
    variante && Object.keys(variante.atributos).length
      ? Object.entries(variante.atributos).map(([clave, valor]) => ({ clave, valor }))
      : [{ clave: '', valor: '' }],
  );
  const form = useForm({
    initialValues: {
      sku: variante?.sku ?? '',
      precio: (variante?.precio ?? '') as number | string,
      activo: variante?.activo ?? true,
    },
    validateInputOnBlur: true,
  });

  // El valor se lee ANTES de encolar la actualización: dentro del updater el evento ya no existe.
  const editarAttr = (i: number, campo: keyof AttrRow, valor: string) =>
    setAttrs((r) => r.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  const construir = () => {
    const atributos: Record<string, string> = {};
    for (const a of attrs)
      if (a.clave.trim() || a.valor.trim()) atributos[a.clave.trim()] = a.valor.trim();
    return {
      sku: form.values.sku,
      atributos,
      precio: form.values.precio === '' ? undefined : Number(form.values.precio),
      ...(variante ? { activo: form.values.activo } : {}),
    };
  };

  const guardar = useMutation({
    mutationFn: (body: unknown) =>
      variante
        ? api(`/catalog/variantes/${variante.idVariante}`, { method: 'PUT', body })
        : api(`/catalog/productos/${idProducto}/variantes`, { method: 'POST', body }),
    onSuccess: () => {
      invalidar();
      notifyOk('Variante guardada.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'DUPLICADO')
        form.setFieldError('sku', 'Ya existe una variante con ese SKU');
      else if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });

  const enviar = () => {
    setError(null);
    const body = construir();
    const parsed = (variante ? VarianteUpdateInputSchema : VarianteInputSchema).safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] === 'atributos' ? 'atributos' : String(i.path[0]);
        errs[k] ??= i.message;
      }
      form.setErrors(errs);
      return;
    }
    // Atributos con clave vacía pero valor (o al revés) no pasan el esquema: se avisa.
    guardar.mutate(parsed.data);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={variante ? `Editar ${variante.sku}` : 'Nueva variante'}
      centered
      size="lg"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <Stack gap="sm">
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="SKU"
              description="Único. Letras, números, punto, guion"
              data-autofocus
              {...form.getInputProps('sku')}
            />
            <NumberInput
              label="Precio (IVA incluido)"
              min={0}
              decimalScale={2}
              fixedDecimalScale
              prefix="Q"
              {...form.getInputProps('precio')}
            />
          </SimpleGrid>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Atributos (talla, color…)
            </Text>
            <Stack gap={6}>
              {attrs.map((a, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <TextInput
                    aria-label="Atributo"
                    placeholder="Talla"
                    value={a.clave}
                    onChange={(e) => editarAttr(i, 'clave', e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    aria-label="Valor"
                    placeholder="M"
                    value={a.valor}
                    onChange={(e) => editarAttr(i, 'valor', e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Quitar atributo"
                    onClick={() =>
                      setAttrs((r) =>
                        r.length > 1 ? r.filter((_, j) => j !== i) : [{ clave: '', valor: '' }],
                      )
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
            {form.errors.atributos && (
              <Text size="xs" c="red" mt={4}>
                {form.errors.atributos}
              </Text>
            )}
            <Button
              size="compact-xs"
              variant="subtle"
              mt={6}
              onClick={() => setAttrs((r) => [...r, { clave: '', valor: '' }])}
            >
              + Agregar atributo
            </Button>
          </div>
          {variante && (
            <Switch
              label="Variante activa"
              {...form.getInputProps('activo', { type: 'checkbox' })}
            />
          )}
          {!variante && (
            <Text size="xs" c="dimmed">
              La existencia inicial se registra después como una entrada de inventario.
            </Text>
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

// ── Imágenes ──────────────────────────────────────────────────────────────────

function Imagenes({ p }: { p: ProductoDetalle }) {
  const invalidar = useInvalidar();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { url: '', esPrincipal: false },
    validate: (v) =>
      zodValidate(ImagenInputSchema)({
        url: v.url,
        orden: p.imagenes.length,
        esPrincipal: v.esPrincipal,
      }),
  });
  const agregar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api(`/catalog/productos/${p.idProducto}/imagenes`, {
        method: 'POST',
        body: {
          url: v.url.trim(),
          orden: p.imagenes.length,
          esPrincipal: v.esPrincipal || p.imagenes.length === 0,
        },
      }),
    onSuccess: () => {
      invalidar();
      form.reset();
      notifyOk('Imagen agregada.');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    },
  });
  const quitar = useMutation({
    mutationFn: (id: number) => api<void>(`/catalog/imagenes/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar,
  });
  return (
    <Card withBorder padding="md">
      <Text fw={600} mb="sm">
        Imágenes
      </Text>
      {p.imagenes.length === 0 ? (
        <Text size="sm" c="dimmed" mb="sm">
          Sin imágenes todavía.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }} mb="md">
          {p.imagenes.map((im) => (
            <Stack key={im.idImagen} gap={4}>
              <ProductImage src={im.url} alt={p.nombre} />
              <Group justify="space-between" wrap="nowrap">
                {im.esPrincipal ? <Badge size="xs">Principal</Badge> : <span />}
                <ConfirmButton
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  titulo="Quitar imagen"
                  mensaje="¿Quitar esta imagen del producto?"
                  etiquetaConfirmar="Quitar"
                  onConfirm={() =>
                    quitar.mutateAsync(im.idImagen).then(
                      () => notifyOk('Imagen quitada.'),
                      (e) => notifyError(e),
                    )
                  }
                >
                  Quitar
                </ConfirmButton>
              </Group>
            </Stack>
          ))}
        </SimpleGrid>
      )}
      {error && (
        <Alert color="red" role="alert" mb="sm">
          {error}
        </Alert>
      )}
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          setError(null);
          agregar.mutate(v);
        })}
      >
        <Group align="flex-start" wrap="wrap">
          <TextInput
            label="URL de la imagen"
            placeholder="https://… o /productos/01.jpg"
            style={{ flex: 1, minWidth: 240 }}
            {...form.getInputProps('url')}
          />
          <Checkbox
            mt={30}
            label="Principal"
            {...form.getInputProps('esPrincipal', { type: 'checkbox' })}
          />
          <Button mt={24} type="submit" loading={agregar.isPending}>
            Agregar
          </Button>
        </Group>
      </form>
    </Card>
  );
}
