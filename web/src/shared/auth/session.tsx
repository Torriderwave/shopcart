import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
  Rol,
  UsuarioSesion,
} from '@shopcart/contracts';
import {
  api,
  markSession,
  refreshSession,
  setAccessToken,
  setCartToken,
  setSessionLostHandler,
} from '../api/client';

interface SessionValue {
  usuario: UsuarioSesion | null;
  /** true mientras se intenta restaurar la sesión al arrancar. */
  cargando: boolean;
  /** Fallo transitorio al restaurar la sesión (no significa que haya cerrado sesión). */
  errorArranque: string | null;
  reintentarSesion: () => void;
  login: (input: LoginInput) => Promise<UsuarioSesion>;
  register: (input: RegisterInput) => Promise<UsuarioSesion>;
  logout: () => Promise<void>;
  tieneRol: (...roles: Rol[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Ruta de inicio según el rol. */
export const homeFor = (rol: Rol | undefined): string =>
  rol === 'Administrador' ? '/admin/dashboard' : rol === 'Operador' ? '/operador/pedidos' : '/';

/** Destino tras iniciar sesión: la ruta pedida originalmente (solo para clientes) o el inicio del rol. */
export const destinoTrasLogin = (rol: Rol | undefined, from?: string): string =>
  from && rol === 'Cliente' && from.startsWith('/') ? from : homeFor(rol);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorArranque, setErrorArranque] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const adopt = useCallback(
    (auth: AuthResponse) => {
      setAccessToken(auth.accessToken);
      markSession(true);
      // El carrito del invitado ya se fusionó en el servidor: el token deja de servir.
      setCartToken(null);
      setUsuario(auth.usuario);
      // La clave del carrito incluye al usuario: el carrito ya fusionado se pide solo al montar.
      qc.removeQueries({ queryKey: ['cart', 'invitado'] });
      return auth.usuario;
    },
    [qc],
  );

  // Arranque: restaura la sesión con el refresh token (cookie httpOnly).
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    void refreshSession().then((r) => {
      if (!vivo) return;
      if (r.estado === 'ok') {
        setUsuario(r.auth.usuario);
        setErrorArranque(null);
      } else if (r.estado === 'error') setErrorArranque(r.mensaje);
      else setErrorArranque(null);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [intento]);

  // El refresh falló en medio de una petición: la sesión terminó.
  useEffect(() => {
    setSessionLostHandler(() => {
      markSession(false);
      setUsuario(null);
      qc.clear();
    });
    return () => setSessionLostHandler(null);
  }, [qc]);

  const value = useMemo<SessionValue>(
    () => ({
      usuario,
      cargando,
      errorArranque,
      reintentarSesion: () => setIntento((n) => n + 1),
      login: async (input) =>
        adopt(await api<AuthResponse>('/auth/login', { method: 'POST', body: input })),
      register: async (input) =>
        adopt(await api<AuthResponse>('/auth/register', { method: 'POST', body: input })),
      logout: async () => {
        try {
          await api<void>('/auth/logout', { method: 'POST' });
        } finally {
          setAccessToken(null);
          markSession(false);
          setCartToken(null);
          setUsuario(null);
          qc.clear();
        }
      },
      tieneRol: (...roles) => !!usuario && roles.includes(usuario.rol),
    }),
    [usuario, cargando, errorArranque, adopt, qc],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fuera de SessionProvider');
  return ctx;
}
