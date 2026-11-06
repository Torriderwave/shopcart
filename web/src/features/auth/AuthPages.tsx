import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Button,
  Box,
  Card,
  Container,
  Grid,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconShieldCheck,
  IconShoppingCart,
  IconTicket,
  IconTruckDelivery,
} from '@tabler/icons-react';
import Aurora from '../../components/reactbits/Aurora';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { LoginInputSchema, RegisterInputSchema, type Rol } from '@shopcart/contracts';
import { ApiError } from '../../shared/api/client';
import { destinoTrasLogin, useSession } from '../../shared/auth/session';
import { zodValidate } from '../../shared/form';
import { PageTransition } from '../../shared/ui/PageTransition';

function useDestino() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return (rol: Rol) => destinoTrasLogin(rol, from);
}

export function AuthLayout() {
  const { pathname } = useLocation();
  return (
    <Container size={960} py={{ base: 'md', sm: 40 }}>
      <Card
        padding={0}
        withBorder
        style={{ overflow: 'hidden', borderColor: 'var(--sc-border)' }}
        shadow="md"
      >
        <Grid gutter={0}>
          <Grid.Col span={{ base: 12, md: 5 }} visibleFrom="md">
            <Stack
              className="hero-dark auth-panel"
              h="100%"
              p={40}
              justify="space-between"
              gap="xl"
              style={{ borderRadius: 0 }}
            >
              <div className="hero-aurora" aria-hidden>
                <Aurora
                  colorStops={['#10b981', '#34d399', '#bef264']}
                  amplitude={1.6}
                  blend={0.9}
                  speed={0.6}
                  height={0.9}
                  glow={1}
                  brightness={1.3}
                  intro={false}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <Group gap={10}>
                <Box
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(255,255,255,.22)',
                    color: '#fff',
                  }}
                >
                  <IconShoppingCart size={21} />
                </Box>
                <Text fw={800} fz={22} c="white" style={{ letterSpacing: '-0.03em' }}>
                  ShopCart
                </Text>
              </Group>
              <Stack gap="md" style={{ position: 'relative', zIndex: 1 }}>
                <Title order={2} c="white" fz={30} lh={1.15}>
                  Compra fácil, rápido y seguro.
                </Title>
                {[
                  { I: IconTruckDelivery, t: 'Envío gratis desde Q200' },
                  { I: IconTicket, t: 'Cupones de bienvenida' },
                  { I: IconShieldCheck, t: 'Reembolsos exactos al centavo' },
                ].map(({ I, t }) => (
                  <Group key={t} gap="sm" wrap="nowrap">
                    <I size={20} />
                    <Text size="sm" opacity={0.92}>
                      {t}
                    </Text>
                  </Group>
                ))}
              </Stack>
              <Text size="xs" opacity={0.7}>
                © 2026 ShopCart
              </Text>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Box p={{ base: 'lg', sm: 44 }} style={{ overflow: 'hidden' }}>
              {/* El panel de marca no se remonta: solo el formulario se desliza al cambiar de vista. */}
              <PageTransition salida dir={pathname === '/registro' ? 1 : -1} />
            </Box>
          </Grid.Col>
        </Grid>
      </Card>
    </Container>
  );
}

function Marco({
  titulo,
  pie,
  children,
}: {
  titulo: string;
  pie: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <Title order={2} mb="lg">
        {titulo}
      </Title>
      {children}
      <Text ta="center" size="sm" mt="lg" c="dimmed">
        {pie}
      </Text>
    </>
  );
}

export function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const destino = useDestino();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const form = useForm({
    initialValues: { correo: '', contrasena: '' },
    validate: zodValidate(LoginInputSchema),
    validateInputOnBlur: true,
  });

  const enviar = form.onSubmit(async (values) => {
    setError(null);
    setEnviando(true);
    try {
      const u = await login(values);
      navigate(destino(u.rol), { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      setEnviando(false);
    }
  });

  return (
    <Marco
      titulo="Iniciar sesión"
      pie={
        <>
          ¿No tienes cuenta?{' '}
          <Anchor component={Link} to="/registro">
            Regístrate
          </Anchor>
        </>
      }
    >
      <form onSubmit={enviar} noValidate>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <TextInput
            label="Correo electrónico"
            type="email"
            autoComplete="username"
            placeholder="tu@correo.com"
            {...form.getInputProps('correo')}
          />
          <PasswordInput
            label="Contraseña"
            autoComplete="current-password"
            {...form.getInputProps('contrasena')}
          />
          <Button type="submit" loading={enviando} fullWidth>
            Entrar
          </Button>
        </Stack>
      </form>
    </Marco>
  );
}

const RegistroFormSchema = RegisterInputSchema.extend({ confirmar: z.string() }).refine(
  (v) => v.contrasena === v.confirmar,
  { path: ['confirmar'], message: 'Las contraseñas no coinciden' },
);

export function RegisterPage() {
  const { register } = useSession();
  const navigate = useNavigate();
  const destino = useDestino();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const form = useForm({
    initialValues: { nombre: '', correo: '', contrasena: '', confirmar: '' },
    validate: zodValidate(RegistroFormSchema),
    validateInputOnBlur: true,
  });

  const enviar = form.onSubmit(async ({ nombre, correo, contrasena }) => {
    setError(null);
    setEnviando(true);
    try {
      const u = await register({ nombre, correo, contrasena });
      navigate(destino(u.rol), { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else if (e instanceof ApiError && e.code === 'DUPLICADO')
        form.setFieldError('correo', 'Ya existe una cuenta con este correo');
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      setEnviando(false);
    }
  });

  return (
    <Marco
      titulo="Crear cuenta"
      pie={
        <>
          ¿Ya tienes cuenta?{' '}
          <Anchor component={Link} to="/login">
            Inicia sesión
          </Anchor>
        </>
      }
    >
      <form onSubmit={enviar} noValidate>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <TextInput
            label="Nombre completo"
            autoComplete="name"
            {...form.getInputProps('nombre')}
          />
          <TextInput
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            {...form.getInputProps('correo')}
          />
          <PasswordInput
            label="Contraseña"
            description="Mínimo 8 caracteres"
            autoComplete="new-password"
            {...form.getInputProps('contrasena')}
          />
          <PasswordInput
            label="Confirmar contraseña"
            autoComplete="new-password"
            {...form.getInputProps('confirmar')}
          />
          <Button type="submit" loading={enviando} fullWidth>
            Crear cuenta
          </Button>
        </Stack>
      </form>
    </Marco>
  );
}
