import type { ReactNode } from 'react';
import { Alert, Button, Center, Loader, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle, IconInbox } from '@tabler/icons-react';
import { ApiError } from '../api/client';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <Center py={60} role="status" aria-live="polite">
      <Stack align="center" gap="xs">
        <Loader />
        <Text c="dimmed" size="sm">
          {texto}
        </Text>
      </Stack>
    </Center>
  );
}

export function Vacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <Center py={50}>
      <Stack align="center" gap="xs" maw={420} ta="center">
        <div className="vacio-icono">
          <ThemeIcon variant="light" size={64} radius="xl" color="brand">
            <IconInbox size={32} stroke={1.5} />
          </ThemeIcon>
        </div>
        <Text fw={800} fz="lg" style={{ letterSpacing: '-0.01em' }}>
          {titulo}
        </Text>
        {descripcion && (
          <Text c="dimmed" size="sm">
            {descripcion}
          </Text>
        )}
        {accion}
      </Stack>
    </Center>
  );
}

export const mensajeError = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.';

/** Reintentar sirve ante fallos de red/servidor/límite; ante 403/404/400 repetir no cambia nada. */
const puedeReintentar = (e: unknown): boolean =>
  !(e instanceof ApiError) || e.code === 'RED' || e.status >= 500 || e.status === 429;

export function ErrorEstado({
  error,
  onReintentar,
}: {
  error: unknown;
  onReintentar?: () => void;
}) {
  return (
    <Alert
      color="red"
      icon={<IconAlertTriangle size={18} />}
      title="No se pudo cargar la información"
      my="md"
    >
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{mensajeError(error)}</Text>
        {onReintentar && puedeReintentar(error) && (
          <Button size="xs" variant="light" color="red" onClick={onReintentar}>
            Reintentar
          </Button>
        )}
      </Stack>
    </Alert>
  );
}

/** Resuelve loading / error / vacío / contenido para cualquier consulta. */
export function Estados<T>({
  query,
  vacio,
  esVacio,
  esqueleto,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: T | undefined;
    refetch: () => unknown;
  };
  vacio: ReactNode;
  esVacio?: (data: T) => boolean;
  /** Marcador de carga con la forma del contenido (en lugar del spinner). */
  esqueleto?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{esqueleto ?? <Cargando />}</>;
  if (query.isError)
    return <ErrorEstado error={query.error} onReintentar={() => void query.refetch()} />;
  if (query.data === undefined) return <Cargando />;
  if (esVacio?.(query.data)) return <>{vacio}</>;
  return <>{children(query.data)}</>;
}
