import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '@mantine/core';
import { Link } from 'react-router-dom';
import { GuestOnly, RequireRole } from './shared/auth/guards';
import { homeFor, useSession } from './shared/auth/session';
import AppLayout from './shared/layout/AppLayout';
import { Cargando, Vacio } from './shared/ui/Estados';
import CatalogPage from './features/catalog/CatalogPage';
import ProductPage from './features/catalog/ProductPage';
import CartPage from './features/cart/CartPage';
import { AuthLayout, LoginPage, RegisterPage } from './features/auth/AuthPages';

// Cliente y personal se cargan bajo demanda: el catálogo (lo primero que se ve) no arrastra el panel admin.
const CheckoutPage = lazy(() => import('./features/checkout/CheckoutPage'));
const AddressesPage = lazy(() => import('./features/checkout/AddressesPage'));
const OrdersPages = lazy(() =>
  import('./features/orders/OrdersPages').then((m) => ({ default: m.MyOrdersPage })),
);
const OrderDetailCliente = lazy(() =>
  import('./features/orders/OrdersPages').then((m) => ({
    default: () => <m.OrderDetailPage modo="cliente" />,
  })),
);
const OrderDetailPersonal = lazy(() =>
  import('./features/orders/OrdersPages').then((m) => ({
    default: () => <m.OrderDetailPage modo="personal" />,
  })),
);
const StaffOrders = lazy(() =>
  import('./features/orders/OrdersPages').then((m) => ({ default: m.StaffOrdersPage })),
);
const Inventory = lazy(() =>
  import('./features/staff/InventoryPages').then((m) => ({ default: m.InventoryPage })),
);
const Kardex = lazy(() =>
  import('./features/staff/InventoryPages').then((m) => ({ default: m.KardexPage })),
);
const Dashboard = lazy(() => import('./features/admin/DashboardPage'));
const ProductsAdmin = lazy(() => import('./features/admin/ProductsAdminPage'));
const ProductEditor = lazy(() => import('./features/admin/ProductEditorPage'));
const Categories = lazy(() => import('./features/admin/CategoriesPage'));
const Coupons = lazy(() => import('./features/admin/CouponsPage'));
const Users = lazy(() => import('./features/admin/UsersPage'));
const Audit = lazy(() => import('./features/admin/AuditPage'));

/** "/" → catálogo para clientes e invitados; el personal va a su panel. */
function Inicio() {
  const { usuario, cargando } = useSession();
  if (cargando) return <Cargando />;
  if (usuario && usuario.rol !== 'Cliente') return <Navigate to={homeFor(usuario.rol)} replace />;
  return <CatalogPage />;
}

function NoEncontrada() {
  return (
    <Vacio
      titulo="Página no encontrada"
      descripcion="La dirección que buscas no existe."
      accion={
        <Button component={Link} to="/">
          Ir al inicio
        </Button>
      }
    />
  );
}

export default function App() {
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Inicio />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="producto/:id" element={<ProductPage />} />
          <Route path="carrito" element={<CartPage />} />

          <Route element={<GuestOnly />}>
            <Route element={<AuthLayout />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="registro" element={<RegisterPage />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['Cliente']} />}>
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="mis-pedidos" element={<OrdersPages />} />
            <Route path="mis-pedidos/:id" element={<OrderDetailCliente />} />
            <Route path="mis-direcciones" element={<AddressesPage />} />
          </Route>

          <Route element={<RequireRole roles={['Operador', 'Administrador']} />}>
            <Route path="operador/pedidos" element={<StaffOrders />} />
            <Route path="operador/pedidos/:id" element={<OrderDetailPersonal />} />
            <Route path="operador/inventario" element={<Inventory />} />
            <Route path="operador/inventario/:idVariante/kardex" element={<Kardex />} />
          </Route>

          <Route element={<RequireRole roles={['Administrador']} />}>
            <Route path="admin/dashboard" element={<Dashboard />} />
            <Route path="admin/catalogo" element={<ProductsAdmin />} />
            <Route path="admin/catalogo/:id" element={<ProductEditor />} />
            <Route path="admin/categorias" element={<Categories />} />
            <Route path="admin/cupones" element={<Coupons />} />
            <Route path="admin/usuarios" element={<Users />} />
            <Route path="admin/bitacora" element={<Audit />} />
          </Route>

          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
