import { db, nowIso, persist } from './db';
import { barrerReservas, disponible, registrarPedido } from './rules';
import { emitirReportes, hayEscuchas } from './bus';

/** Una compra de otro cliente ficticio: el dashboard del administrador se mueve solo. */
export function ventaSimulada(): void {
  const s = db();
  const clientes = s.usuarios.filter(
    (u) => u.rol === 'Cliente' && u.activo && !u.correo.startsWith('dalia.'),
  );
  const cliente = clientes[Math.floor(Math.random() * clientes.length)];
  const v = s.variantes.filter((x) => x.activo && disponible(x) >= 2);
  const variante = v[Math.floor(Math.random() * v.length)];
  const dir = cliente && s.direcciones.find((d) => d.idUsuario === cliente.id && d.esPrincipal);
  const envio = s.metodosEnvio[1];
  if (!cliente || !variante || !dir || !envio) return;
  registrarPedido({
    usuario: cliente,
    direccion: dir,
    metodoEnvio: { nombre: envio.nombre, costo: envio.costo },
    cupon: null,
    lineas: [{ idVariante: variante.id, cantidad: 1, precio: variante.precio }],
    fecha: nowIso(),
    llave: null,
    liberaReserva: false,
  });
  persist();
  emitirReportes('ventas');
}

/** Equivalente al job de 60 s del servidor y a la actividad de otros compradores. */
export function iniciarTareas(): void {
  setInterval(() => {
    if (barrerReservas()) persist();
  }, 60_000);
  setInterval(() => {
    if (hayEscuchas()) ventaSimulada();
  }, 45_000);
}
