import { useState } from 'react';
import { Badge } from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import type { EstadoPedido } from '@shopcart/contracts';

const ESTADO_COLOR: Record<EstadoPedido, string> = {
  Pagado: 'blue',
  Preparando: 'yellow',
  Despachado: 'cyan',
  Entregado: 'green',
  Cancelado: 'red',
  DevueltoParcial: 'orange',
  DevueltoTotal: 'gray',
};

export const ESTADO_LABEL: Record<EstadoPedido, string> = {
  Pagado: 'Pagado',
  Preparando: 'Preparando',
  Despachado: 'Despachado',
  Entregado: 'Entregado',
  Cancelado: 'Cancelado',
  DevueltoParcial: 'Devuelto parcial',
  DevueltoTotal: 'Devuelto total',
};

export function EstadoBadge({ estado }: { estado: EstadoPedido }) {
  return (
    <Badge color={ESTADO_COLOR[estado]} variant="light">
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}

/** Imagen cuadrada con contenedor de tamaño fijo y respaldo visible si la URL externa falla o no existe. */
export function ProductImage({
  src,
  alt,
  radius = 'sm',
}: {
  src: string | null;
  alt: string;
  radius?: number | string;
}) {
  const [roto, setRoto] = useState(false);
  const r = typeof radius === 'number' ? radius : `var(--mantine-radius-${radius})`;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        background: 'var(--mantine-color-gray-1)',
        borderRadius: radius === 0 ? 0 : r,
        overflow: 'hidden',
      }}
    >
      {!src || roto ? (
        <div
          role="img"
          aria-label={alt}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--mantine-color-gray-5)',
          }}
        >
          <IconPhotoOff size={32} />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="producto-img"
          onError={() => setRoto(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
    </div>
  );
}
