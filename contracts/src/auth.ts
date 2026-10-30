import { z } from 'zod';
import {
  BoolQuerySchema,
  DepartamentoSchema,
  PaginationQuerySchema,
  RolSchema,
  SearchQuerySchema,
  sortQuery,
} from './common';

// ── Sesión ────────────────────────────────────────────────────────────────────

export const CorreoSchema = z.string().trim().toLowerCase().email().max(254);
export const ContrasenaSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128);

export const RegisterInputSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  correo: CorreoSchema,
  contrasena: ContrasenaSchema,
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  correo: CorreoSchema,
  contrasena: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UsuarioSesionSchema = z.object({
  idUsuario: z.number().int(),
  nombre: z.string(),
  correo: z.string(),
  rol: RolSchema,
});
export type UsuarioSesion = z.infer<typeof UsuarioSesionSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  expiraEn: z.string(),
  usuario: UsuarioSesionSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ── Direcciones ───────────────────────────────────────────────────────────────

export const DireccionInputSchema = z.object({
  alias: z.string().trim().min(1).max(50),
  destinatario: z.string().trim().min(2).max(100),
  linea1: z.string().trim().min(3).max(200),
  linea2: z.string().trim().max(200).nullish(),
  ciudad: z.string().trim().min(2).max(100),
  departamento: DepartamentoSchema,
  codigoPostal: z.string().trim().max(10).nullish(),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Teléfono inválido'),
  esPrincipal: z.boolean().default(false),
});
export type DireccionInput = z.infer<typeof DireccionInputSchema>;

export const DireccionSchema = z.object({
  idDireccion: z.number().int(),
  alias: z.string(),
  destinatario: z.string(),
  linea1: z.string(),
  linea2: z.string().nullable(),
  ciudad: z.string(),
  departamento: DepartamentoSchema,
  codigoPostal: z.string().nullable(),
  telefono: z.string(),
  esPrincipal: z.boolean(),
});
export type Direccion = z.infer<typeof DireccionSchema>;

// ── Usuarios (Administrador) ──────────────────────────────────────────────────

export const UsuarioSchema = UsuarioSesionSchema.extend({
  activo: z.boolean(),
  fechaCreacion: z.string(),
});
export type Usuario = z.infer<typeof UsuarioSchema>;

export const CrearUsuarioInputSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  correo: CorreoSchema,
  contrasena: ContrasenaSchema,
  rol: RolSchema,
});
export type CrearUsuarioInput = z.infer<typeof CrearUsuarioInputSchema>;

export const ActualizarUsuarioInputSchema = z
  .object({
    nombre: z.string().trim().min(2).max(100),
    rol: RolSchema,
    activo: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Indica al menos un campo a modificar' });
export type ActualizarUsuarioInput = z.infer<typeof ActualizarUsuarioInputSchema>;

export const USUARIOS_SORT = ['nombre', 'correo', 'rol', 'fecha'] as const;
export const ListarUsuariosQuerySchema = PaginationQuerySchema.extend({
  q: SearchQuerySchema.optional(),
  rol: RolSchema.optional(),
  activo: BoolQuerySchema.optional(),
  sort: sortQuery(USUARIOS_SORT, 'nombre'),
});
export type ListarUsuariosQuery = z.infer<typeof ListarUsuariosQuerySchema>;
