import { Link } from 'react-router-dom';
import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import type { ProductoResumen } from '@shopcart/contracts';
import AnimatedContent from '../../components/reactbits/AnimatedContent';
import SpotlightCard from '../../components/reactbits/SpotlightCard';
import { fmtMoney } from '../../shared/format';
import { ProductImage } from '../../shared/ui/Misc';

export const fmtRango = (p: Pick<ProductoResumen, 'precioDesde' | 'precioHasta'>): string =>
  p.precioDesde === null
    ? '—'
    : p.precioDesde === p.precioHasta
      ? fmtMoney(p.precioDesde)
      : `${fmtMoney(p.precioDesde)} – ${fmtMoney(p.precioHasta ?? p.precioDesde)}`;

/** Tarjeta de producto: entrada animada, foco de luz con el cursor, zoom de imagen y «Ver detalle». */
export function ProductCard({
  producto: p,
  indice = 0,
}: {
  producto: ProductoResumen;
  indice?: number;
}) {
  return (
    <AnimatedContent
      distance={36}
      duration={0.7}
      delay={(indice % 4) * 0.08}
      blur={6}
      threshold={0.05}
      style={{ height: '100%' }}
    >
      <SpotlightCard
        theme="light"
        spotlightColor="rgba(18, 167, 132, 0.24)"
        className="producto-spot"
      >
        <Card padding={0} className="producto-card">
          <Link to={`/producto/${p.idProducto}`} className="producto-media" aria-label={p.nombre}>
            <div style={{ overflow: 'hidden' }}>
              <ProductImage src={p.imagenPrincipal} alt={p.nombre} radius={0} />
            </div>
            <Badge variant="white" color="dark" size="sm" className="producto-cat">
              {p.categoria.nombre}
            </Badge>
            {!p.hayStock && (
              <Badge color="red" size="sm" style={{ position: 'absolute', top: 10, right: 10 }}>
                Agotado
              </Badge>
            )}
            <span className="producto-ver">
              Ver detalle <IconArrowRight size={16} />
            </span>
          </Link>
          <Stack gap={6} p="md">
            <Anchor
              component={Link}
              to={`/producto/${p.idProducto}`}
              fw={700}
              c="dark.8"
              lineClamp={2}
              underline="never"
              mih={44}
            >
              {p.nombre}
            </Anchor>
            <Group justify="space-between" align="center">
              <Text fw={800} fz="lg" c="brand.7" style={{ letterSpacing: '-0.02em' }}>
                {fmtRango(p)}
              </Text>
            </Group>
          </Stack>
        </Card>
      </SpotlightCard>
    </AnimatedContent>
  );
}
