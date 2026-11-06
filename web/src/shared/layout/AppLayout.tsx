import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Container,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconAddressBook,
  IconBuildingStore,
  IconCategory,
  IconChartBar,
  IconChevronDown,
  IconClipboardList,
  IconHistory,
  IconLogout,
  IconPackage,
  IconSearch,
  IconShieldCheck,
  IconShoppingBag,
  IconShoppingCart,
  IconTag,
  IconTicket,
  IconTruckDelivery,
  IconUsers,
  IconArrowBackUp,
  type Icon,
} from '@tabler/icons-react';
import type { Rol } from '@shopcart/contracts';
import { PageTransition } from '../ui/PageTransition';
import { CartButton } from '../ui/MiniCart';
import { ScrollEffects } from '../ui/ScrollEffects';
import { homeFor, useSession } from '../auth/session';
import { notifyError } from '../notify';

interface Enlace {
  to: string;
  label: string;
  end?: boolean;
}

const ICONOS: Record<string, Icon> = {
  '/catalogo': IconBuildingStore,
  '/mis-pedidos': IconShoppingBag,
  '/mis-direcciones': IconAddressBook,
  '/operador/pedidos': IconClipboardList,
  '/operador/inventario': IconPackage,
  '/admin/dashboard': IconChartBar,
  '/admin/catalogo': IconTag,
  '/admin/categorias': IconCategory,
  '/admin/cupones': IconTicket,
  '/admin/usuarios': IconUsers,
  '/admin/bitacora': IconHistory,
};

function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <Group gap={10} wrap="nowrap">
      <Box
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          background: 'linear-gradient(135deg, #0b8f70, #7ddc5a)',
          boxShadow: '0 6px 14px rgba(11,143,112,.35)',
        }}
      >
        <IconShoppingCart size={19} stroke={2.2} />
      </Box>
      <Text
        fw={800}
        fz={20}
        lh={1}
        c={claro ? 'white' : 'dark.9'}
        style={{ letterSpacing: '-0.03em' }}
      >
        ShopCart
      </Text>
    </Group>
  );
}

function BuscadorCabecera() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      style={{ flex: 1, maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/catalogo?q=${encodeURIComponent(q.trim())}` : '/catalogo');
        setQ('');
      }}
    >
      <TextInput
        aria-label="Buscar en la tienda"
        placeholder="¿Qué estás buscando?"
        leftSection={<IconSearch size={16} />}
        radius="xl"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        styles={{ input: { background: '#ecf0e8', border: '1px solid transparent' } }}
      />
    </form>
  );
}

function PieDePagina() {
  const items = [
    { icon: IconTruckDelivery, t: 'Envío gratis', d: 'En compras desde Q200' },
    { icon: IconArrowBackUp, t: 'Devoluciones', d: 'Reembolso proporcional al centavo' },
    { icon: IconShieldCheck, t: 'Compra segura', d: 'Reserva de stock al pagar' },
  ];
  return (
    <Box
      component="footer"
      mt={56}
      py={36}
      style={{ background: '#fff', borderTop: '1px solid var(--sc-border)' }}
    >
      <Container size="lg">
        <Group justify="space-between" align="flex-start" gap="xl">
          <Stack gap={6}>
            <Marca />
            <Text size="sm" c="dimmed" maw={300}>
              Tu tienda en línea. Precios con IVA incluido (12 %).
            </Text>
          </Stack>
          <Group gap={40} align="flex-start">
            {items.map(({ icon: I, t, d }) => (
              <Group key={t} gap="sm" wrap="nowrap" align="flex-start">
                <Box c="brand.6" mt={2}>
                  <I size={24} stroke={1.7} />
                </Box>
                <div>
                  <Text fw={700} size="sm">
                    {t}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {d}
                  </Text>
                </div>
              </Group>
            ))}
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mt="xl">
          © 2026 ShopCart · Tech Challenge 360
        </Text>
      </Container>
    </Box>
  );
}

const TIENDA: Enlace[] = [{ to: '/catalogo', label: 'Catálogo' }];
const CLIENTE: Enlace[] = [
  { to: '/mis-pedidos', label: 'Mis pedidos' },
  { to: '/mis-direcciones', label: 'Mis direcciones' },
];
const OPERADOR: Enlace[] = [
  { to: '/operador/pedidos', label: 'Pedidos' },
  { to: '/operador/inventario', label: 'Inventario' },
];
const ADMIN: Enlace[] = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  ...OPERADOR,
  { to: '/admin/catalogo', label: 'Productos' },
  { to: '/admin/categorias', label: 'Categorías' },
  { to: '/admin/cupones', label: 'Cupones' },
  { to: '/admin/usuarios', label: 'Usuarios' },
  { to: '/admin/bitacora', label: 'Bitácora' },
];

export const enlacesPara = (rol: Rol | undefined): Enlace[] =>
  rol === 'Administrador'
    ? ADMIN
    : rol === 'Operador'
      ? OPERADOR
      : [...TIENDA, ...(rol ? CLIENTE : [])];

export default function AppLayout() {
  const { usuario, logout } = useSession();
  const navigate = useNavigate();
  const [abierto, { toggle, close }] = useDisclosure(false);
  const esPersonal = usuario?.rol === 'Operador' || usuario?.rol === 'Administrador';
  const enlaces = enlacesPara(usuario?.rol);
  const movil = useMediaQuery('(max-width: 47.99em)') ?? false;
  // El menú lateral solo existe en el DOM cuando se ve: si no, sus enlaces quedarían enfocables con Tab fuera de pantalla.
  const navbarVisible = movil ? abierto : esPersonal;

  const salir = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      notifyError(e);
    }
  };

  const { pathname } = useLocation();
  const enCatalogo = pathname === '/' || pathname.startsWith('/catalogo');
  // login y registro comparten su propio marco (AuthLayout): no se remonta al alternar entre ellos.
  const claveRuta = pathname === '/login' || pathname === '/registro' ? 'auth' : pathname;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  const iniciales = (usuario?.nombre ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join('');

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        // Móvil: el menú vive en el navbar. Escritorio: solo el personal usa barra lateral.
        collapsed: { mobile: !abierto, desktop: !esPersonal },
      }}
      padding={esPersonal ? 'lg' : 0}
    >
      <AppShell.Header
        style={{
          background: 'rgba(255,255,255,.88)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--sc-border)',
        }}
      >
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="lg">
          <Group wrap="nowrap" gap="md">
            <Burger opened={abierto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menú" />
            <UnstyledButton component={Link} to={homeFor(usuario?.rol)} onClick={close}>
              <Marca />
            </UnstyledButton>
            {usuario && esPersonal && (
              <Badge variant="light" visibleFrom="sm">
                {usuario.rol}
              </Badge>
            )}
            {!esPersonal && (
              <Group gap={4} ml="md" visibleFrom="md">
                {enlaces.map((e) => (
                  <NavLink key={e.to} to={e.to} className="nav-link">
                    {e.label}
                  </NavLink>
                ))}
              </Group>
            )}
          </Group>

          {!esPersonal && !enCatalogo && (
            <Box visibleFrom="sm" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <BuscadorCabecera />
            </Box>
          )}

          <Group gap="xs" wrap="nowrap">
            {!esPersonal && <CartButton />}
            {usuario ? (
              <Menu position="bottom-end" width={230} shadow="md">
                <Menu.Target>
                  <UnstyledButton aria-label="Menú de usuario">
                    <Group gap={8} wrap="nowrap">
                      <Avatar color="brand" radius="xl" size={36}>
                        {iniciales}
                      </Avatar>
                      <Text size="sm" fw={600} visibleFrom="sm" maw={150} truncate>
                        {usuario.nombre}
                      </Text>
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{usuario.correo}</Menu.Label>
                  {usuario.rol === 'Administrador' && (
                    <Menu.Item
                      component={Link}
                      to="/admin/dashboard"
                      leftSection={<IconChartBar size={16} />}
                    >
                      Dashboard
                    </Menu.Item>
                  )}
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={16} />}
                    onClick={() => void salir()}
                  >
                    Cerrar sesión
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <Group gap="xs" wrap="nowrap">
                <Button component={Link} to="/login" variant="subtle" size="sm">
                  Entrar
                </Button>
                <Button component={Link} to="/registro" size="sm" visibleFrom="xs" radius="xl">
                  Registrarse
                </Button>
              </Group>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" style={{ background: '#0a2620', borderRight: 'none' }}>
        {navbarVisible && (
          <ScrollArea>
            {usuario && (
              <Text
                size="xs"
                c="#6d9b8e"
                mb="md"
                tt="uppercase"
                fw={700}
                style={{ letterSpacing: '.08em' }}
              >
                {usuario.rol === 'Administrador'
                  ? 'Administración'
                  : usuario.rol === 'Operador'
                    ? 'Operación'
                    : 'Mi cuenta'}
              </Text>
            )}
            <Stack gap={4}>
              {enlaces.map((e) => {
                const I = ICONOS[e.to] ?? IconPackage;
                return (
                  <NavLink key={e.to} to={e.to} end={e.end} onClick={close} className="side-link">
                    <I size={19} stroke={1.8} />
                    {e.label}
                  </NavLink>
                );
              })}
              {!usuario && (
                <NavLink to="/registro" onClick={close} className="side-link">
                  Registrarse
                </NavLink>
              )}
            </Stack>
          </ScrollArea>
        )}
      </AppShell.Navbar>

      <ScrollEffects />
      <AppShell.Main>
        {esPersonal ? (
          <Container size="xl" px={0}>
            <PageTransition clave={claveRuta} />
          </Container>
        ) : (
          <>
            <Container size="lg" py="lg" style={{ minHeight: 'calc(100vh - 64px - 260px)' }}>
              <PageTransition clave={claveRuta} />
            </Container>
            <PieDePagina />
          </>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
