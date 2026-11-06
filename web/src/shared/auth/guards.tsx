import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Rol } from '@shopcart/contracts';
import { ApiError } from '../api/client';
import { Cargando, ErrorEstado } from '../ui/Estados';
import { destinoTrasLogin, homeFor, useSession } from './session';

/** Exige sesión y uno de los roles; si no, redirige al login o a la página de inicio del rol. */
export function RequireRole({ roles }: { roles: Rol[] }) {
  const { usuario, cargando, errorArranque, reintentarSesion } = useSession();
  const location = useLocation();
  if (cargando) return <Cargando />;
  // Fallo transitorio (p. ej. servidor ocupado): no mandar al login, ofrecer reintentar.
  if (!usuario && errorArranque) {
    return (
      <ErrorEstado error={new ApiError('RED', errorArranque, 0)} onReintentar={reintentarSesion} />
    );
  }
  if (!usuario) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!roles.includes(usuario.rol)) return <Navigate to={homeFor(usuario.rol)} replace />;
  return <Outlet />;
}

/** /login y /registro: si ya hay sesión se va al inicio del rol. */
export function GuestOnly() {
  const { usuario, cargando } = useSession();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (cargando) return <Cargando />;
  if (usuario) return <Navigate to={destinoTrasLogin(usuario.rol, from)} replace />;
  return <Outlet />;
}
