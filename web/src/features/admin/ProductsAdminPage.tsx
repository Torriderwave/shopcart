import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  Select,
  SimpleGrid,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { ProductoResumen } from '@shopcart/contracts';
import { fmtMoney } from '../../shared/format';
import { useDebounced } from '../../shared/hooks/useDebounced';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { DataTable, type Column } from '../../shared/ui/DataTable';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useCategorias, useProductos } from '../catalog/api';

export default function ProductsAdminPage() {
  const navigate = useNavigate();
  const { values, set } = useUrlFilters({ sort: 'nombre:asc', page: '1' });
  const [texto, setTexto] = useState(values.q ?? '');
  const textoD = useDebounced(texto);
  useEffect(() => {
    if (textoD !== (values.q ?? '')) set({ q: textoD });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoD]);
  const categorias = useCategorias(true);
  const productos = useProductos({
    q: values.q,
    idCategoria: values.idCategoria,
    // El panel muestra todo (incluye inactivos) salvo que se pida lo contrario.
    incluirInactivos: values.soloActivos !== 'true',
    sort: values.sort,
    page: values.page,
    pageSize: 15,
  });

  const columnas: Column<ProductoResumen>[] = [
    {
      key: 'n',
      header: 'Producto',
      sort: 'nombre',
      render: (p) => (
        <Group wrap="nowrap" gap="sm">
          {p.imagenPrincipal ? (
            <Image
              src={p.imagenPrincipal}
              w={40}
              h={40}
              radius="sm"
              alt=""
              fallbackSrc="https://placehold.co/40x40?text=%3F"
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                background: 'var(--mantine-color-gray-2)',
                borderRadius: 4,
              }}
            />
          )}
          <div>
            <Text fw={600} size="sm">
              {p.nombre}
            </Text>
            <Text size="xs" c="dimmed">
              {p.categoria.nombre}
            </Text>
          </div>
        </Group>
      ),
    },
    {
      key: 'p',
      header: 'Precio',
      sort: 'precio',
      align: 'right',
      render: (p) =>
        p.precioDesde === null
          ? '—'
          : p.precioDesde === p.precioHasta
            ? fmtMoney(p.precioDesde)
            : `${fmtMoney(p.precioDesde)} – ${fmtMoney(p.precioHasta ?? p.precioDesde)}`,
    },
    {
      key: 's',
      header: 'Stock',
      render: (p) => (
        <Badge color={p.hayStock ? 'green' : 'red'} variant="light">
          {p.hayStock ? 'Con stock' : 'Agotado'}
        </Badge>
      ),
    },
    {
      key: 'a',
      header: 'Estado',
      render: (p) => (
        <Badge color={p.activo ? 'green' : 'gray'} variant="light">
          {p.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Productos"
        acciones={
          <Button component={Link} to="/admin/catalogo/nuevo" leftSection={<IconPlus size={16} />}>
            Nuevo producto
          </Button>
        }
      />
      <Card withBorder mb="md" padding="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="Buscar"
            placeholder="Nombre o descripción"
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
            label="Ocultar inactivos"
            checked={values.soloActivos === 'true'}
            onChange={(e) => set({ soloActivos: e.currentTarget.checked ? 'true' : undefined })}
          />
        </SimpleGrid>
      </Card>
      <Estados
        query={productos}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio titulo="Sin productos" descripcion="Ningún producto coincide con los filtros." />
        }
      >
        {(d) => (
          <DataTable
            rows={d.items}
            columns={columnas}
            rowKey={(p) => p.idProducto}
            meta={d.meta}
            sort={values.sort}
            onSort={(s) => set({ sort: s })}
            onPage={(p) => set({ page: String(p) })}
            onRowClick={(p) => navigate(`/admin/catalogo/${p.idProducto}`)}
          />
        )}
      </Estados>
    </>
  );
}
