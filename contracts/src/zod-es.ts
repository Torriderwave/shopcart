import { z } from 'zod';

/**
 * Mensajes de validación en español para TODOS los esquemas (API y web comparten el mismo texto).
 * Los mensajes escritos a mano en cada esquema tienen prioridad; esto solo cubre los de zod por defecto.
 */
const FORMATOS: Record<string, string> = {
  email: 'Correo electrónico no válido',
  url: 'La URL no es válida',
  uuid: 'Identificador no válido',
  regex: 'Formato no válido',
};

export function configurarZodEs(): void {
  z.config({
    customError: (iss) => {
      switch (iss.code) {
        case 'invalid_type':
          return iss.input === undefined || iss.input === null || iss.input === ''
            ? 'Este campo es obligatorio'
            : iss.expected === 'number' || iss.expected === 'int'
              ? 'Debe ser un número'
              : 'Valor no válido';
        case 'too_small': {
          const min = Number(iss.minimum);
          if (iss.origin === 'string') {
            return min <= 1 ? 'Este campo es obligatorio' : `Mínimo ${min} caracteres`;
          }
          if (iss.origin === 'array') return `Selecciona al menos ${min}`;
          return iss.inclusive ? `Debe ser como mínimo ${min}` : `Debe ser mayor que ${min}`;
        }
        case 'too_big': {
          const max = Number(iss.maximum);
          if (iss.origin === 'string') return `Máximo ${max} caracteres`;
          if (iss.origin === 'array') return `Máximo ${max} elementos`;
          return iss.inclusive ? `Debe ser como máximo ${max}` : `Debe ser menor que ${max}`;
        }
        case 'invalid_format':
          return FORMATOS[iss.format] ?? 'Formato no válido';
        case 'invalid_value':
          return 'Selecciona una opción válida';
        case 'not_multiple_of':
          return 'Máximo 2 decimales';
        case 'unrecognized_keys':
          return 'Campos no permitidos';
        default:
          return undefined;
      }
    },
  });
}
