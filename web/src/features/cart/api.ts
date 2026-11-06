import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgregarLineaInput, Carrito } from '@shopcart/contracts';
import { api, setCartToken } from '../../shared/api/client';
import { useSession } from '../../shared/auth/session';

/** Guarda el token del carrito de invitado que devuelve el servidor. */
function remember(c: Carrito): Carrito {
  if (c.tokenInvitado) setCartToken(c.tokenInvitado);
  return c;
}

export const useCart = () => {
  const { usuario, cargando } = useSession();
  return useQuery({
    queryKey: ['cart', usuario?.idUsuario ?? 'invitado'],
    queryFn: async () => remember(await api<Carrito>('/cart')),
    // El personal no tiene carrito (la API lo rechaza con 403).
    enabled: !cargando && usuario?.rol !== 'Operador' && usuario?.rol !== 'Administrador',
  });
};

/** Mutaciones del carrito: la respuesta ES el carrito; se escribe en caché sin refetch. */
export function useCartMutations() {
  const qc = useQueryClient();
  const { usuario } = useSession();
  const key = ['cart', usuario?.idUsuario ?? 'invitado'];
  const store = (c: Carrito) => {
    qc.setQueryData(key, remember(c));
    // Un cambio del carrito invalida el checkout en curso (totales / reserva).
    void qc.invalidateQueries({ queryKey: ['checkout'] });
  };
  return {
    agregar: useMutation({
      mutationFn: (input: AgregarLineaInput) =>
        api<Carrito>('/cart/items', { method: 'POST', body: input }),
      onSuccess: store,
    }),
    cantidad: useMutation({
      mutationFn: ({ id, cantidad }: { id: number; cantidad: number }) =>
        api<Carrito>(`/cart/items/${id}`, { method: 'PATCH', body: { cantidad } }),
      onSuccess: store,
    }),
    quitar: useMutation({
      mutationFn: (id: number) => api<Carrito>(`/cart/items/${id}`, { method: 'DELETE' }),
      onSuccess: store,
    }),
    aplicarCupon: useMutation({
      mutationFn: (codigo: string) =>
        api<Carrito>('/cart/coupon', { method: 'POST', body: { codigo } }),
      onSuccess: store,
    }),
    quitarCupon: useMutation({
      mutationFn: () => api<Carrito>('/cart/coupon', { method: 'DELETE' }),
      onSuccess: store,
    }),
  };
}
