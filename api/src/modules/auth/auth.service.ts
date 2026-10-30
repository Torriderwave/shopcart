import type {
  ActualizarUsuarioInput,
  AuthResponse,
  CrearUsuarioInput,
  Direccion,
  DireccionInput,
  ListarUsuariosQuery,
  LoginInput,
  RegisterInput,
  Usuario,
  UsuarioSesion,
} from '@shopcart/contracts';
import {
  hashPassword,
  hashToken,
  newRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../../shared/auth';
import { config } from '../../shared/config';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import * as repo from './auth.repository';

export interface Session {
  auth: AuthResponse;
  refreshToken: string;
}

const refreshExpiry = (): Date => new Date(Date.now() + config.REFRESH_TTL_DAYS * 86_400_000);

async function openSession(user: UsuarioSesion, cartToken?: string): Promise<Session> {
  // Solo clientes tienen carrito; un fallo al fusionar no debe impedir el inicio de sesión.
  if (cartToken && user.rol === 'Cliente') {
    await repo.fusionarCarritoInvitado(user.idUsuario, cartToken).catch((err: unknown) => {
      logger.warn({ err }, 'No se pudo fusionar el carrito de invitado');
    });
  }
  const refreshToken = newRefreshToken();
  await repo.guardarRefreshToken(user.idUsuario, hashToken(refreshToken), refreshExpiry());
  const { token, expiraEn } = signAccessToken(user);
  return { auth: { accessToken: token, expiraEn, usuario: user }, refreshToken };
}

export async function register(input: RegisterInput, cartToken?: string): Promise<Session> {
  const user = await repo.registrarCliente(
    input.nombre,
    input.correo,
    await hashPassword(input.contrasena),
  );
  return openSession(user, cartToken);
}

// Hash de relleno: el tiempo de respuesta no revela si el correo existe.
let dummyHash: Promise<string> | undefined;

export async function login(input: LoginInput, cartToken?: string): Promise<Session> {
  const user = await repo.obtenerPorCorreo(input.correo);
  dummyHash ??= hashPassword('contrasena-de-relleno');
  const ok = await verifyPassword(user?.hashContrasena ?? (await dummyHash), input.contrasena);
  if (!user || !user.activo || !ok) {
    throw new AppError('CREDENCIALES_INVALIDAS', 401, 'Correo o contraseña incorrectos.');
  }
  return openSession(user, cartToken);
}

/** Rota el refresh token (el SP detecta reuso y revoca la familia) y emite un access nuevo. */
export async function refresh(currentToken: string): Promise<Session> {
  const next = newRefreshToken();
  const idUsuario = await repo.rotarRefreshToken(
    hashToken(currentToken),
    hashToken(next),
    refreshExpiry(),
  );
  const user = await repo.obtenerPorId(idUsuario);
  if (!user?.activo) throw new AppError('REFRESH_INVALIDO', 401, 'La sesión no es válida.');
  const { token, expiraEn } = signAccessToken(user);
  return { auth: { accessToken: token, expiraEn, usuario: user }, refreshToken: next };
}

export const logout = (token: string): Promise<void> => repo.revocarRefreshToken(hashToken(token));

export async function me(idUsuario: number): Promise<UsuarioSesion> {
  const user = await repo.obtenerPorId(idUsuario);
  if (!user?.activo) throw new AppError('NO_AUTENTICADO', 401, 'La sesión no es válida.');
  return { idUsuario: user.idUsuario, nombre: user.nombre, correo: user.correo, rol: user.rol };
}

// ── Usuarios (Administrador) ──────────────────────────────────────────────────

export const listarUsuarios = (idSesion: number, q: ListarUsuariosQuery) =>
  repo.listarUsuarios(idSesion, q);

export async function crearUsuario(idSesion: number, input: CrearUsuarioInput): Promise<Usuario> {
  return repo.crearUsuario(idSesion, input, await hashPassword(input.contrasena));
}

export const actualizarUsuario = (
  idSesion: number,
  idUsuario: number,
  cambios: ActualizarUsuarioInput,
): Promise<Usuario> => repo.actualizarUsuario(idSesion, idUsuario, cambios);

// ── Direcciones (Cliente) ─────────────────────────────────────────────────────

export const listarDirecciones = (idSesion: number): Promise<Direccion[]> =>
  repo.listarDirecciones(idSesion);
export const crearDireccion = (idSesion: number, d: DireccionInput): Promise<Direccion> =>
  repo.crearDireccion(idSesion, d);
export const actualizarDireccion = (
  idSesion: number,
  id: number,
  d: DireccionInput,
): Promise<Direccion> => repo.actualizarDireccion(idSesion, id, d);
export const desactivarDireccion = (idSesion: number, id: number): Promise<void> =>
  repo.desactivarDireccion(idSesion, id);
