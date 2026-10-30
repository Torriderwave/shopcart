import type {
  CrearUsuarioInput,
  Direccion,
  DireccionInput,
  ListarUsuariosQuery,
  Rol,
  Usuario,
  UsuarioSesion,
} from '@shopcart/contracts';
import { executeSp, firstRow, iso, p, pageRows, T, type Row } from '../../shared/db';

export interface UsuarioConHash extends UsuarioSesion {
  hashContrasena: string;
  activo: boolean;
}

const toSesion = (r: Row): UsuarioSesion => ({
  idUsuario: r.idUsuario as number,
  nombre: r.nombre as string,
  correo: r.correo as string,
  rol: r.rol as Rol,
});

const toUsuario = (r: Row): Usuario => ({
  ...toSesion(r),
  activo: r.activo as boolean,
  fechaCreacion: iso(r.fechaCreacion),
});

const toDireccion = (r: Row): Direccion => ({
  idDireccion: r.idDireccion as number,
  alias: r.alias as string,
  destinatario: r.destinatario as string,
  linea1: r.linea1 as string,
  linea2: (r.linea2 as string | null) ?? null,
  ciudad: r.ciudad as string,
  departamento: r.departamento as Direccion['departamento'],
  codigoPostal: (r.codigoPostal as string | null) ?? null,
  telefono: r.telefono as string,
  esPrincipal: r.esPrincipal as boolean,
});

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function registrarCliente(
  nombre: string,
  correo: string,
  hash: string,
): Promise<UsuarioSesion & { activo: boolean }> {
  const r = await executeSp('SP_Auth_RegistrarCliente', {
    Correo: p(T.NVarChar(254), correo),
    HashContrasena: p(T.NVarChar(255), hash),
    Nombre: p(T.NVarChar(100), nombre),
  });
  const row = firstRow(r)!;
  return { ...toSesion(row), activo: row.activo as boolean };
}

export async function obtenerPorCorreo(correo: string): Promise<UsuarioConHash | undefined> {
  const row = firstRow(
    await executeSp('SP_Auth_ObtenerUsuarioPorCorreo', { Correo: p(T.NVarChar(254), correo) }),
  );
  return row
    ? {
        ...toSesion(row),
        hashContrasena: row.hashContrasena as string,
        activo: row.activo as boolean,
      }
    : undefined;
}

export async function obtenerPorId(idUsuario: number): Promise<Usuario | undefined> {
  const row = firstRow(
    await executeSp('SP_Auth_ObtenerUsuarioPorId', { IDUsuario: p(T.Int, idUsuario) }),
  );
  return row ? toUsuario(row) : undefined;
}

export async function guardarRefreshToken(
  idUsuario: number,
  tokenHash: string,
  expiraEn: Date,
): Promise<void> {
  await executeSp('SP_Auth_GuardarRefreshToken', {
    IDUsuario: p(T.Int, idUsuario),
    TokenHash: p(T.Char(64), tokenHash),
    Familia: p(T.UniqueIdentifier, null),
    ExpiraEn: p(T.DateTime2(3), expiraEn),
  });
}

/** Rota el refresh token; devuelve el IDUsuario dueño. Lanza REFRESH_INVALIDO (401) si no sirve. */
export async function rotarRefreshToken(
  tokenHash: string,
  nuevoTokenHash: string,
  expiraEn: Date,
): Promise<number> {
  const r = await executeSp('SP_Auth_RotarRefreshToken', {
    TokenHash: p(T.Char(64), tokenHash),
    NuevoTokenHash: p(T.Char(64), nuevoTokenHash),
    ExpiraEn: p(T.DateTime2(3), expiraEn),
  });
  return firstRow(r)!.idUsuario as number;
}

export async function revocarRefreshToken(tokenHash: string): Promise<void> {
  await executeSp('SP_Auth_RevocarRefreshToken', { TokenHash: p(T.Char(64), tokenHash) });
}

// ── Usuarios (Administrador) ──────────────────────────────────────────────────

export async function crearUsuario(
  idSesion: number,
  input: CrearUsuarioInput,
  hash: string,
): Promise<Usuario> {
  const r = await executeSp('SP_Auth_CrearUsuario', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Correo: p(T.NVarChar(254), input.correo),
    HashContrasena: p(T.NVarChar(255), hash),
    Nombre: p(T.NVarChar(100), input.nombre),
    Rol: p(T.NVarChar(20), input.rol),
  });
  return toUsuario(firstRow(r)!);
}

export async function actualizarUsuario(
  idSesion: number,
  idUsuario: number,
  cambios: { nombre?: string; rol?: Rol; activo?: boolean },
): Promise<Usuario> {
  const r = await executeSp('SP_Auth_ActualizarUsuario', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDUsuario: p(T.Int, idUsuario),
    Nombre: p(T.NVarChar(100), cambios.nombre ?? null),
    Rol: p(T.NVarChar(20), cambios.rol ?? null),
    Activo: p(T.Bit, cambios.activo ?? null),
  });
  return toUsuario(firstRow(r)!);
}

export async function listarUsuarios(
  idSesion: number,
  q: ListarUsuariosQuery,
): Promise<{ items: Usuario[]; total: number }> {
  const r = await executeSp('SP_Auth_ListarUsuarios', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Q: p(T.NVarChar(100), q.q ?? null),
    Rol: p(T.NVarChar(20), q.rol ?? null),
    Activo: p(T.Bit, q.activo ?? null),
    OrdenarPor: p(T.NVarChar(20), q.sort.campo),
    Direccion: p(T.NVarChar(4), q.sort.direccion),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toUsuario), total };
}

// ── Direcciones (Cliente) ─────────────────────────────────────────────────────

const direccionParams = (idSesion: number, d: DireccionInput) => ({
  IDUsuarioSesion: p(T.Int, idSesion),
  Alias: p(T.NVarChar(50), d.alias),
  Destinatario: p(T.NVarChar(100), d.destinatario),
  Linea1: p(T.NVarChar(200), d.linea1),
  Linea2: p(T.NVarChar(200), d.linea2 ?? null),
  Ciudad: p(T.NVarChar(100), d.ciudad),
  Departamento: p(T.NVarChar(30), d.departamento),
  CodigoPostal: p(T.NVarChar(10), d.codigoPostal ?? null),
  Telefono: p(T.NVarChar(20), d.telefono),
  EsPrincipal: p(T.Bit, d.esPrincipal),
});

export async function listarDirecciones(idSesion: number): Promise<Direccion[]> {
  const r = await executeSp('SP_Direcciones_ListarPorUsuario', {
    IDUsuarioSesion: p(T.Int, idSesion),
  });
  return (r.recordsets[0] ?? []).map(toDireccion);
}

export async function crearDireccion(idSesion: number, d: DireccionInput): Promise<Direccion> {
  const r = await executeSp('SP_Direcciones_Crear', direccionParams(idSesion, d));
  return toDireccion(firstRow(r)!);
}

export async function actualizarDireccion(
  idSesion: number,
  idDireccion: number,
  d: DireccionInput,
): Promise<Direccion> {
  const r = await executeSp('SP_Direcciones_Actualizar', {
    ...direccionParams(idSesion, d),
    IDDireccion: p(T.Int, idDireccion),
  });
  return toDireccion(firstRow(r)!);
}

export async function desactivarDireccion(idSesion: number, idDireccion: number): Promise<void> {
  await executeSp('SP_Direcciones_Desactivar', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDDireccion: p(T.Int, idDireccion),
  });
}

/** Al iniciar sesión o registrarse, el carrito de invitado pasa a ser del usuario. */
export async function fusionarCarritoInvitado(idUsuario: number, token: string): Promise<void> {
  await executeSp('SP_Carrito_FusionarInvitadoAUsuario', {
    IDUsuario: p(T.Int, idUsuario),
    TokenInvitado: p(T.UniqueIdentifier, token),
  });
}
