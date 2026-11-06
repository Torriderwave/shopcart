import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEPARTAMENTOS,
  DireccionInputSchema,
  type Direccion,
  type DireccionInput,
} from '@shopcart/contracts';
import { api, ApiError } from '../../shared/api/client';
import { zodValidate } from '../../shared/form';

export const useDirecciones = () =>
  useQuery({
    queryKey: ['direcciones'],
    queryFn: () => api<Direccion[]>('/me/direcciones'),
  });

export function useDireccionMutations() {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: ['direcciones'] });
  return {
    crear: useMutation({
      mutationFn: (d: DireccionInput) =>
        api<Direccion>('/me/direcciones', { method: 'POST', body: d }),
      onSuccess: refrescar,
    }),
    actualizar: useMutation({
      mutationFn: ({ id, d }: { id: number; d: DireccionInput }) =>
        api<Direccion>(`/me/direcciones/${id}`, { method: 'PUT', body: d }),
      onSuccess: refrescar,
    }),
    eliminar: useMutation({
      mutationFn: (id: number) => api<void>(`/me/direcciones/${id}`, { method: 'DELETE' }),
      onSuccess: refrescar,
    }),
  };
}

interface Valores {
  alias: string;
  destinatario: string;
  linea1: string;
  linea2: string;
  ciudad: string;
  departamento: string;
  codigoPostal: string;
  telefono: string;
  esPrincipal: boolean;
}

const vacio: Valores = {
  alias: '',
  destinatario: '',
  linea1: '',
  linea2: '',
  ciudad: '',
  departamento: '',
  codigoPostal: '',
  telefono: '',
  esPrincipal: false,
};

/** Formulario de dirección (alta y edición) con la misma validación que la API. */
export function DireccionForm({
  inicial,
  onSubmit,
  onCancel,
  enviando,
  etiquetaEnviar = 'Guardar dirección',
}: {
  inicial?: Direccion;
  onSubmit: (d: DireccionInput) => Promise<void>;
  onCancel?: () => void;
  enviando?: boolean;
  etiquetaEnviar?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Valores>({
    initialValues: inicial
      ? {
          alias: inicial.alias,
          destinatario: inicial.destinatario,
          linea1: inicial.linea1,
          linea2: inicial.linea2 ?? '',
          ciudad: inicial.ciudad,
          departamento: inicial.departamento,
          codigoPostal: inicial.codigoPostal ?? '',
          telefono: inicial.telefono,
          esPrincipal: inicial.esPrincipal,
        }
      : vacio,
    validate: zodValidate(DireccionInputSchema),
    validateInputOnBlur: true,
  });

  const enviar = form.onSubmit(async (v) => {
    setError(null);
    const parsed = DireccionInputSchema.parse({
      ...v,
      linea2: v.linea2.trim() || null,
      codigoPostal: v.codigoPostal.trim() || null,
    });
    try {
      await onSubmit(parsed);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDACION') form.setErrors(e.fieldErrors);
      else setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    }
  });

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Alias" placeholder="Casa, Oficina…" {...form.getInputProps('alias')} />
          <TextInput label="Destinatario" {...form.getInputProps('destinatario')} />
        </SimpleGrid>
        <TextInput
          label="Dirección"
          placeholder="Calle, avenida, número"
          {...form.getInputProps('linea1')}
        />
        <TextInput label="Referencia (opcional)" {...form.getInputProps('linea2')} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Ciudad" {...form.getInputProps('ciudad')} />
          <Select
            label="Departamento"
            placeholder="Selecciona"
            searchable
            data={[...DEPARTAMENTOS]}
            {...form.getInputProps('departamento')}
          />
          <TextInput label="Código postal (opcional)" {...form.getInputProps('codigoPostal')} />
          <TextInput label="Teléfono" type="tel" {...form.getInputProps('telefono')} />
        </SimpleGrid>
        <Checkbox
          label="Usar como dirección principal"
          {...form.getInputProps('esPrincipal', { type: 'checkbox' })}
        />
        <Group justify="flex-end">
          {onCancel && (
            <Button variant="default" onClick={onCancel} disabled={enviando}>
              Cancelar
            </Button>
          )}
          <Button type="submit" loading={enviando}>
            {etiquetaEnviar}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
