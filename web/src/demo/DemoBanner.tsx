import { useEffect, useRef, useState } from 'react';
import { Badge, Box, Button, Collapse, Group, List, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { resetDemo } from './db';
import { CUENTAS_DEMO } from './seed';

/** Banner persistente: avisa que es una demo, explica qué pasa con los datos y permite restablecerla. */
export function DemoBanner() {
  const [guia, setGuia] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Reserva espacio al final de la página para que el banner no tape el pie.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () =>
      document.documentElement.style.setProperty('--demo-banner-h', `${el.offsetHeight}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const restablecer = () => {
    resetDemo();
    window.location.replace(import.meta.env.BASE_URL);
  };

  return (
    <Box
      ref={ref}
      className="demo-banner"
      role="region"
      aria-label="Aviso de demostración"
      data-demo-banner
    >
      <Group justify="space-between" gap={8} wrap="wrap">
        <Group gap={8} wrap="nowrap" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Badge color="lime" variant="filled" size="sm" radius="sm" style={{ flexShrink: 0 }}>
            Demo
          </Badge>
          <Text size="xs" c="white" lh={1.35}>
            Datos ficticios; todo ocurre en tu navegador y se reinicia cada día.
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray.0"
            aria-expanded={guia}
            onClick={() => setGuia((g) => !g)}
          >
            {guia ? 'Ocultar guía' : 'Qué probar'}
          </Button>
          <Button
            size="compact-xs"
            color="lime"
            c="dark"
            leftSection={<IconRefresh size={13} />}
            onClick={restablecer}
          >
            Restablecer demo
          </Button>
        </Group>
      </Group>
      <Collapse in={guia}>
        <Box pt={8} style={{ maxHeight: '45vh', overflowY: 'auto' }}>
          <Text size="xs" c="gray.3" mb={4}>
            Cupones de prueba: <b>DEMO10</b> (10 %), <b>AHORRA40</b> (Q40 desde Q250), <b>CASA20</b>{' '}
            (20 % en Casa y Mesa), <b>SONIDO75</b> (Q75 en Electrónica); y para ver errores:{' '}
            <b>AGOTADO-DEMO</b>, <b>CADUCADO-DEMO</b>, <b>PROXIMO-DEMO</b>.
          </Text>
          <List size="xs" c="gray.3" spacing={2}>
            <List.Item>
              Cliente: {CUENTAS_DEMO.Cliente}. Reserva de stock de 15 min al pagar.
            </List.Item>
            <List.Item>
              Operador: avanza pedidos, registra devoluciones y mueve inventario.
            </List.Item>
            <List.Item>
              Administrador: catálogo, cupones, usuarios, bitácora y dashboard en vivo.
            </List.Item>
            <List.Item>Pagos simulados; no se envía nada a ningún servidor.</List.Item>
          </List>
        </Box>
      </Collapse>
    </Box>
  );
}
