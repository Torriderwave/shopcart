import { useState, type ReactNode } from 'react';
import { Button, Group, Modal, Text, type ButtonProps } from '@mantine/core';

/** Botón que pide confirmación antes de ejecutar una acción destructiva o irreversible. */
export function ConfirmButton({
  titulo,
  mensaje,
  etiquetaConfirmar = 'Confirmar',
  onConfirm,
  canOpen,
  children,
  ...rest
}: {
  titulo: string;
  mensaje: ReactNode;
  etiquetaConfirmar?: string;
  onConfirm: () => Promise<unknown> | unknown;
  /** Validación previa: si devuelve false no se abre el diálogo (el llamador muestra el error). */
  canOpen?: () => boolean;
  children: ReactNode;
} & ButtonProps) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);

  const ejecutar = async () => {
    setCargando(true);
    try {
      await onConfirm();
      setAbierto(false);
    } catch {
      // El llamador ya informó el error; el diálogo queda abierto para reintentar o cancelar.
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <Button {...rest} onClick={() => (canOpen?.() ?? true) && setAbierto(true)}>
        {children}
      </Button>
      <Modal
        opened={abierto}
        onClose={() => !cargando && setAbierto(false)}
        title={titulo}
        centered
      >
        <Text size="sm">{mensaje}</Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setAbierto(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button color={rest.color ?? 'red'} onClick={() => void ejecutar()} loading={cargando}>
            {etiquetaConfirmar}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
