import { notifications } from '@mantine/notifications';
import { ApiError } from './api/client';

export const notifyOk = (message: string): void => {
  notifications.show({ color: 'green', title: 'Listo', message });
};

export const notifyError = (error: unknown, title = 'No se pudo completar'): void => {
  notifications.show({
    color: 'red',
    title,
    message: error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.',
    autoClose: 7000,
  });
};
