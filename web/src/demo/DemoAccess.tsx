import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Divider, Group, Stack, Text } from '@mantine/core';
import { IconShieldCog, IconTruckLoading, IconUserCheck } from '@tabler/icons-react';
import { ApiError } from '../shared/api/client';
import { destinoTrasLogin, useSession } from '../shared/auth/session';
import { CUENTAS_DEMO } from './seed';

/** «Entrar como demo»: inicia sesión con una cuenta ficticia sin escribir ni mostrar contraseñas. */
export function DemoAccess() {
  const { login } = useSession();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entrar = async (rol: keyof typeof CUENTAS_DEMO) => {
    setError(null);
    setCargando(rol);
    try {
      // La demo no valida contraseñas: las cuentas de ejemplo entran con cualquier valor.
      const u = await login({ correo: CUENTAS_DEMO[rol], contrasena: 'demo' });
      navigate(destinoTrasLogin(u.rol, from), { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar la demo.');
      setCargando(null);
    }
  };

  return (
    <Stack gap="xs" mb="md" data-demo-access>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Button
        size="md"
        fullWidth
        leftSection={<IconUserCheck size={18} />}
        loading={cargando === 'Cliente'}
        disabled={cargando !== null}
        onClick={() => void entrar('Cliente')}
      >
        Entrar como demo
      </Button>
      <Text size="xs" c="dimmed" ta="center">
        Compra como cliente ficticio, sin escribir contraseñas.
      </Text>
      <Group gap="xs" grow wrap="wrap">
        <Button
          variant="light"
          size="xs"
          style={{ flex: '1 1 100%' }}
          leftSection={<IconTruckLoading size={15} />}
          loading={cargando === 'Operador'}
          disabled={cargando !== null}
          onClick={() => void entrar('Operador')}
        >
          Operador
        </Button>
        <Button
          variant="light"
          size="xs"
          style={{ flex: '1 1 100%' }}
          leftSection={<IconShieldCog size={15} />}
          loading={cargando === 'Administrador'}
          disabled={cargando !== null}
          onClick={() => void entrar('Administrador')}
        >
          Administrador
        </Button>
      </Group>
      <Divider label="o inicia sesión con un correo demo" labelPosition="center" my="xs" />
    </Stack>
  );
}
