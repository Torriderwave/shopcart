import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorBody, ErrorCode } from '@shopcart/contracts';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details: Record<string, unknown>[] = [],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** THROW de los SPs → código estable y HTTP (ARQUITECTURA §5.9). */
const SP_ERRORS: Record<number, { code: ErrorCode; status: number }> = {
  50001: { code: 'STOCK_INSUFICIENTE', status: 409 },
  50002: { code: 'RESERVA_VENCIDA', status: 409 },
  50003: { code: 'VARIANTE_INACTIVA', status: 409 },
  50010: { code: 'CARRITO_VACIO', status: 400 },
  50011: { code: 'CHECKOUT_NO_INICIADO', status: 409 },
  50012: { code: 'CANTIDAD_EXCEDE_DISPONIBLE', status: 409 },
  50013: { code: 'TOTAL_CAMBIO', status: 409 },
  50020: { code: 'CUPON_INVALIDO', status: 400 },
  50021: { code: 'CUPON_FUERA_VIGENCIA', status: 400 },
  50022: { code: 'CUPON_MONTO_MINIMO', status: 400 },
  50023: { code: 'CUPON_AGOTADO', status: 409 },
  50024: { code: 'CUPON_LIMITE_CLIENTE', status: 409 },
  50025: { code: 'CUPON_SIN_PRODUCTOS_ELEGIBLES', status: 400 },
  50030: { code: 'TRANSICION_INVALIDA', status: 409 },
  50031: { code: 'PEDIDO_NO_CANCELABLE', status: 409 },
  50032: { code: 'DEVOLUCION_EXCEDE_VENDIDO', status: 400 },
  50033: { code: 'DEVOLUCION_NO_PERMITIDA', status: 409 },
  50034: { code: 'METODO_ENVIO_NO_APLICA', status: 400 },
  50035: { code: 'DIRECCION_INVALIDA', status: 400 },
  50040: { code: 'REFRESH_INVALIDO', status: 401 },
  50043: { code: 'PROHIBIDO', status: 403 },
  50044: { code: 'NO_ENCONTRADO', status: 404 },
  50050: { code: 'EN_USO', status: 409 },
  50060: { code: 'AJUSTE_INVALIDO', status: 400 },
  50070: { code: 'PROHIBIDO', status: 403 }, // bitácora inmutable
};

/** Constraint UNIQUE (convención UQ_Tabla_Columna) → campo que ve el cliente. */
const UNIQUE_FIELDS: Record<string, string> = {
  UQ_Usuarios_Correo: 'correo',
  UQ_ProductoVariantes_SKU: 'sku',
  UQ_Cupones_Codigo: 'codigo',
  UQ_Categorias_Nombre: 'nombre',
  UQ_MetodosEnvio_Nombre: 'nombre',
};

interface SqlLikeError {
  number?: number;
  message?: string;
  originalError?: { info?: { number?: number; message?: string } };
}

function sqlNumber(err: SqlLikeError): number | undefined {
  return err.number ?? err.originalError?.info?.number;
}

/** Convierte un error de SQL Server en AppError; undefined si no es un error de BD conocido. */
export function mapSqlError(err: unknown): AppError | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as SqlLikeError;
  const num = sqlNumber(e);
  if (num === undefined) return undefined;
  const message = e.originalError?.info?.message ?? e.message ?? 'Error de base de datos';

  const known = SP_ERRORS[num];
  if (known) return new AppError(known.code, known.status, message);

  if (num >= 50000 && num < 51000) return new AppError('VALIDACION', 400, message); // otras reglas de negocio

  if (num === 2627 || num === 2601) {
    const constraint = /'(UQ_[A-Za-z0-9_]+)'/.exec(message)?.[1];
    const campo = constraint ? UNIQUE_FIELDS[constraint] : undefined;
    return new AppError(
      'DUPLICADO',
      409,
      'Ya existe un registro con ese valor.',
      campo ? [{ campo }] : [],
    );
  }
  if (num === 547)
    return new AppError(
      'REFERENCIA_INVALIDA',
      400,
      'La operación referencia datos inexistentes o en uso.',
    );
  if (num === 1205)
    return new AppError(
      'CONCURRENCIA',
      503,
      'Operación en conflicto con otra en curso. Intenta de nuevo.',
    );
  return undefined;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NO_ENCONTRADO', 404, `Ruta no encontrada: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError(
      'VALIDACION',
      400,
      'Los datos enviados no son válidos.',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  } else {
    const mapped = mapSqlError(err);
    if (mapped) {
      appError = mapped;
    } else if (err instanceof SyntaxError && 'body' in err) {
      appError = new AppError('VALIDACION', 400, 'El cuerpo de la petición no es JSON válido.');
    } else {
      // Nunca se exponen detalles internos: se registran con el requestId.
      (req.log ?? logger).error({ err }, 'Error no controlado');
      appError = new AppError('INTERNO', 500, 'Ocurrió un error inesperado.');
    }
  }

  const body: ErrorBody = {
    success: false,
    error: { code: appError.code, message: appError.message, details: appError.details },
  };
  res.status(appError.status).json(body);
};
