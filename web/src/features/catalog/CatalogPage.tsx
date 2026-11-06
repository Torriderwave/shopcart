import { useEffect, useState } from 'react';
import {
  Card,
  Checkbox,
  Collapse,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  TextInput,
  Button,
} from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconBallFootball,
  IconBulb,
  IconDeviceLaptop,
  IconHanger,
  IconLayoutGrid,
  IconSearch,
  IconShoe,
  IconSunglasses,
  IconTag,
  IconX,
  type Icon,
} from '@tabler/icons-react';
import { PRODUCTOS_SORT } from '@shopcart/contracts';
import { useDebounced } from '../../shared/hooks/useDebounced';
import { useUrlFilters } from '../../shared/hooks/useUrlFilters';
import { DataTableFooterPagination } from '../../shared/ui/FooterPagination';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useCategorias, useProductos } from './api';
import { ProductCard } from './ProductCard';
import { Hero } from './Hero';
import { HomeSections } from './HomeSections';

const SORT_OPCIONES = [
  { value: 'nombre:asc', label: 'Nombre (A–Z)' },
  { value: 'nombre:desc', label: 'Nombre (Z–A)' },
  { value: 'precio:asc', label: 'Precio: menor a mayor' },
  { value: 'precio:desc', label: 'Precio: mayor a menor' },
  { value: 'recientes:desc', label: 'Más recientes' },
];
void PRODUCTOS_SORT;

const ICONO_CATEGORIA: Record<string, Icon> = {
  Ropa: IconHanger,
  Calzado: IconShoe,
  Accesorios: IconSunglasses,
  Hogar: IconBulb,
  Tecnología: IconDeviceLaptop,
  Deportes: IconBallFootball,
};

function GridSkeleton() {
  return (
    <SimpleGrid
      cols={{ base: 2, sm: 3, lg: 4 }}
      spacing="lg"
      aria-busy="true"
      aria-label="Cargando productos"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Card key={i} padding={0} withBorder>
          <Skeleton height={260} radius={0} />
          <Stack gap={8} p="md">
            <Skeleton height={14} width="80%" />
            <Skeleton height={20} width="45%" />
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

export default function CatalogPage() {
  const { values, set } = useUrlFilters({ sort: 'nombre:asc', page: '1' });
  const [texto, setTexto] = useState(values.q ?? '');
  const textoDebounced = useDebounced(texto);
  const [pMin, setPMin] = useState<number | string>(values.precioMin ?? '');
  const [pMax, setPMax] = useState<number | string>(values.precioMax ?? '');
  const pMinD = useDebounced(pMin, 500);
  const pMaxD = useDebounced(pMax, 500);

  useEffect(() => {
    if (textoDebounced !== (values.q ?? '')) set({ q: textoDebounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoDebounced]);
  useEffect(() => {
    const a = pMinD === '' ? undefined : String(pMinD);
    const b = pMaxD === '' ? undefined : String(pMaxD);
    if (a !== values.precioMin || b !== values.precioMax) set({ precioMin: a, precioMax: b });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pMinD, pMaxD]);

  const rangoInvalido = pMin !== '' && pMax !== '' && Number(pMin) > Number(pMax);
  const categorias = useCategorias();
  const productos = useProductos({
    q: values.q,
    idCategoria: values.idCategoria,
    precioMin: rangoInvalido ? undefined : values.precioMin,
    precioMax: rangoInvalido ? undefined : values.precioMax,
    soloDisponibles: values.soloDisponibles === 'true',
    sort: values.sort,
    page: values.page,
    pageSize: 12,
  });

  const hayFiltros = !!(
    values.q ||
    values.idCategoria ||
    values.precioMin ||
    values.precioMax ||
    values.soloDisponibles
  );
  const limpiar = () => {
    setTexto('');
    setPMin('');
    setPMax('');
    set({
      q: undefined,
      idCategoria: undefined,
      precioMin: undefined,
      precioMax: undefined,
      soloDisponibles: undefined,
    });
  };

  const [verFiltros, setVerFiltros] = useState(
    !!(values.precioMin || values.precioMax || values.soloDisponibles),
  );
  const catActiva = (categorias.data ?? []).find(
    (c) => String(c.idCategoria) === values.idCategoria,
  );
  const mostrarHero = !hayFiltros && (values.page ?? '1') === '1';

  return (
    <>
      {mostrarHero ? (
        <Hero
          onVer={() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' })}
        />
      ) : (
        <PageHeader
          titulo={catActiva ? catActiva.nombre : 'Catálogo'}
          descripcion="Todos los precios incluyen IVA (12 %)."
        />
      )}

      <Group gap="xs" mb="lg" wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <button
          type="button"
          className="chip"
          data-activo={!values.idCategoria}
          onClick={() => set({ idCategoria: undefined })}
        >
          <IconLayoutGrid size={16} /> Todo
        </button>
        {(categorias.data ?? []).map((c) => {
          const I = ICONO_CATEGORIA[c.nombre] ?? IconTag;
          return (
            <button
              key={c.idCategoria}
              type="button"
              className="chip"
              data-activo={values.idCategoria === String(c.idCategoria)}
              onClick={() => set({ idCategoria: String(c.idCategoria) })}
            >
              <I size={16} /> {c.nombre}
            </button>
          );
        })}
      </Group>

      <Card withBorder mb="lg" padding="md" id="productos">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            label="Buscar"
            placeholder="Nombre o descripción"
            leftSection={<IconSearch size={16} />}
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            style={{ flex: '1 1 240px' }}
          />
          <Select
            label="Ordenar por"
            allowDeselect={false}
            data={SORT_OPCIONES}
            value={values.sort}
            onChange={(v) => set({ sort: v ?? undefined })}
            style={{ flex: '0 1 220px' }}
          />
          <Button
            variant={verFiltros ? 'light' : 'default'}
            leftSection={<IconAdjustmentsHorizontal size={16} />}
            onClick={() => setVerFiltros((v) => !v)}
          >
            Filtros
          </Button>
          {hayFiltros && (
            <Button variant="subtle" leftSection={<IconX size={14} />} onClick={limpiar}>
              Limpiar
            </Button>
          )}
        </Group>
        <Collapse in={verFiltros}>
          <Group mt="md" align="flex-start" gap="md" wrap="wrap">
            <NumberInput
              label="Precio mín."
              min={0}
              decimalScale={2}
              prefix="Q"
              value={pMin}
              onChange={setPMin}
              error={rangoInvalido ? ' ' : undefined}
              w={160}
            />
            <NumberInput
              label="Precio máx."
              min={0}
              decimalScale={2}
              prefix="Q"
              value={pMax}
              onChange={setPMax}
              error={rangoInvalido ? 'El mínimo supera al máximo' : undefined}
              w={160}
            />
            <Checkbox
              mt={30}
              label="Solo disponibles"
              checked={values.soloDisponibles === 'true'}
              onChange={(e) =>
                set({ soloDisponibles: e.currentTarget.checked ? 'true' : undefined })
              }
            />
          </Group>
        </Collapse>
      </Card>

      <Estados
        query={productos}
        esqueleto={<GridSkeleton />}
        esVacio={(d) => d.items.length === 0}
        vacio={
          <Vacio
            titulo="No encontramos productos"
            descripcion={
              hayFiltros
                ? 'Prueba con otros filtros o limpia la búsqueda.'
                : 'Aún no hay productos publicados.'
            }
            accion={hayFiltros ? <Button onClick={limpiar}>Limpiar filtros</Button> : undefined}
          />
        }
      >
        {(d) => (
          <>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="lg">
              {d.items.map((p, i) => (
                <ProductCard key={p.idProducto} producto={p} indice={i} />
              ))}
            </SimpleGrid>
            <DataTableFooterPagination meta={d.meta} onPage={(p) => set({ page: String(p) })} />
            {mostrarHero && <HomeSections />}
          </>
        )}
      </Estados>
    </>
  );
}
