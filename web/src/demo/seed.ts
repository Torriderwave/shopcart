import type { Departamento, EstadoPedido } from '@shopcart/contracts';
import {
  DAY,
  addMs,
  gtDate,
  next,
  nowIso,
  round2,
  setBuilding,
  type DDireccion,
  type DProducto,
  type DUsuario,
  type DVariante,
  type State,
} from './db';
import { actorDe, auditar, disponible, mover, registrarPedido, variantePorId } from './rules';

/* Datos 100 % ficticios: marcas, personas y correos inventados (dominio .local, sin buzón real).
   Las fotos son las del catálogo del sitio; el orden de los productos sigue al de las fotos. */

const DOMINIO = 'shopcart-demo.local';
/** Las fotos viven bajo la ruta base de la demo (p. ej. /demos/shopcart/). */
const BASE: string = (import.meta.env as { BASE_URL?: string } | undefined)?.BASE_URL ?? '/';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIAS = [
  ['Vestuario', 'Prendas de diario con corte y tela pensados para el clima del país'],
  ['Zapatería', 'Calzado casual, deportivo y de vestir'],
  ['Complementos', 'Mochilas, gorras, lentes y otros detalles'],
  ['Casa y Mesa', 'Luz, cerámica y textiles para el hogar'],
  ['Electrónica', 'Audio, carga y dispositivos de uso diario'],
  ['Aire Libre', 'Equipo para entrenar y salir a moverse'],
] as const;

type Tipo = 'T' | 'N' | 'C' | 'D' | 'K';
const VARIANTES: Record<Tipo, { cod: string; atributos: Record<string, string>; delta: number }[]> =
  {
    T: ['S', 'M', 'L', 'XL'].map((t) => ({ cod: t, atributos: { Talla: t }, delta: 0 })),
    N: ['37', '39', '41', '43'].map((n) => ({ cod: n, atributos: { Número: n }, delta: 0 })),
    C: [
      { cod: 'AZU', atributos: { Color: 'Azul' }, delta: 0 },
      { cod: 'ARE', atributos: { Color: 'Arena' }, delta: 0 },
      { cod: 'TER', atributos: { Color: 'Terracota' }, delta: 0 },
    ],
    D: [
      { cod: 'LIN', atributos: { Acabado: 'Lino' }, delta: 0 },
      { cod: 'CAR', atributos: { Acabado: 'Carbón' }, delta: 0 },
    ],
    K: [
      { cod: '32G', atributos: { Memoria: '32 GB' }, delta: 0 },
      { cod: '96G', atributos: { Memoria: '96 GB' }, delta: 70 },
      { cod: '192G', atributos: { Memoria: '192 GB' }, delta: 160 },
    ],
  };

// [categoría, nombre, precio base, tipo de variante] — la posición coincide con /productos/NN.jpg
const PRODUCTOS: [number, string, number, Tipo][] = [
  [1, 'Camisa de lino Ceibal', 175, 'T'],
  [1, 'Camiseta Pima Lunaria', 85, 'T'],
  [1, 'Pantalón sarga Tecolote', 239, 'T'],
  [1, 'Jean recto Añil Sur', 269, 'T'],
  [1, 'Sudadera Neblina', 219, 'T'],
  [1, 'Rompevientos Chaquira', 319, 'T'],
  [1, 'Vestido Marea Corta', 249, 'T'],
  [1, 'Polo piqué Alborada', 139, 'T'],
  [2, 'Tenis Tizate Blanco', 389, 'N'],
  [2, 'Zapato Brogue Candelaria', 529, 'N'],
  [2, 'Botín Tamarindo', 479, 'N'],
  [2, 'Sandalia Remanso', 179, 'N'],
  [2, 'Mocasín Gamuza Sereno', 415, 'N'],
  [2, 'Zapatilla Pluma Trail', 445, 'N'],
  [3, 'Mochila Quetzal 22 L', 209, 'C'],
  [3, 'Gorra Cuatro Vientos', 65, 'C'],
  [3, 'Cinturón Cuero Alcázar', 115, 'C'],
  [3, 'Billetera Delgada Ónix', 95, 'C'],
  [3, 'Bufanda Merino Ventisca', 85, 'C'],
  [3, 'Lentes Polar Atardecer', 149, 'C'],
  [3, 'Bandolera Vereda', 179, 'C'],
  [4, 'Lámpara de mesa Fogata', 169, 'D'],
  [4, 'Juego de 4 tazas Barro Fino', 95, 'D'],
  [4, 'Cojín tejido Telar', 55, 'D'],
  [4, 'Manta térmica Brasero', 145, 'D'],
  [4, 'Jarrón soplado Gota', 125, 'D'],
  [4, 'Espejo circular Luna 50', 189, 'D'],
  [4, 'Organizador de escritorio Orden', 85, 'D'],
  [5, 'Audífonos Bluetooth Eco', 335, 'K'],
  [5, 'Cargador rápido USB-C Rayo', 119, 'K'],
  [5, 'Memoria USB Aleación', 75, 'K'],
  [5, 'Parlante portátil Brisa', 285, 'K'],
  [5, 'Reloj inteligente Pulso', 679, 'K'],
  [5, 'Batería externa 10 000 mAh Faro', 179, 'K'],
  [6, 'Balón de fútbol Cancha', 159, 'C'],
  [6, 'Tapete de yoga Raíz', 135, 'C'],
  [6, 'Botella térmica 750 ml Cumbre', 105, 'C'],
  [6, 'Guantes de entrenamiento Agarre', 85, 'C'],
  [6, 'Cuerda para saltar Ritmo', 45, 'C'],
  [6, 'Set de 3 bandas elásticas Resorte', 75, 'C'],
];

const PERSONAS: [string, string, Departamento, string][] = [
  ['Dalia Quintero Soto', 'dalia.quintero', 'Guatemala', 'Guatemala'],
  ['Mateo Solórzano Rey', 'mateo.solorzano', 'Sacatepéquez', 'Antigua Guatemala'],
  ['Ernesto Villalba Ruiz', 'ernesto.villalba', 'Quetzaltenango', 'Quetzaltenango'],
  ['Marisol Echeverría Paz', 'marisol.echeverria', 'Guatemala', 'Mixco'],
  ['Tadeo Barrientos Luna', 'tadeo.barrientos', 'Escuintla', 'Escuintla'],
  ['Ximena Arrazola Peña', 'ximena.arrazola', 'Guatemala', 'Villa Nueva'],
  ['Gael Montenegro Ríos', 'gael.montenegro', 'Alta Verapaz', 'Cobán'],
  ['Odalys Caballero Mena', 'odalys.caballero', 'Chimaltenango', 'Chimaltenango'],
  ['Ivo Santacruz Ortiz', 'ivo.santacruz', 'Petén', 'Flores'],
  ['Noelia Altamirano Vera', 'noelia.altamirano', 'Izabal', 'Puerto Barrios'],
  ['Rodrigo Esquivel Lara', 'rodrigo.esquivel', 'Guatemala', 'Guatemala'],
  ['Brenda Ocampo Salas', 'brenda.ocampo', 'Huehuetenango', 'Huehuetenango'],
  ['Ulises Fontanar Cruz', 'ulises.fontanar', 'Zacapa', 'Zacapa'],
];

/** Cuentas de la demo: se entra con un clic, sin contraseña. */
export const CUENTAS_DEMO = {
  Cliente: `dalia.quintero@${DOMINIO}`,
  Operador: `bruno.ardiles@${DOMINIO}`,
  Administrador: `irene.castellanos@${DOMINIO}`,
} as const;

export function construirSeed(): State {
  const ahora = nowIso();
  const R = rng(20261120);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const s: State = {
    version: 1,
    fechaClave: gtDate(ahora),
    seq: {},
    refresh: null,
    usuarios: [],
    categorias: [],
    productos: [],
    variantes: [],
    imagenes: [],
    kardex: [],
    carritos: [],
    reservas: [],
    cupones: [],
    cuponUsos: [],
    direcciones: [],
    metodosEnvio: [],
    pedidos: [],
    bitacora: [],
  };
  setBuilding(s);
  const hace = (dias: number, horas = 0): string =>
    new Date(Date.now() - dias * DAY - horas * 3_600_000).toISOString();

  // Usuarios
  const nuevoUsuario = (
    nombre: string,
    correo: string,
    rol: DUsuario['rol'],
    activo = true,
    creado = hace(60),
  ) => {
    const u: DUsuario = { id: next('usuario'), nombre, correo, rol, activo, creado };
    s.usuarios.push(u);
    return u;
  };
  const admin = nuevoUsuario(
    'Irene Castellanos Vidal',
    CUENTAS_DEMO.Administrador,
    'Administrador',
  );
  const operador = nuevoUsuario('Bruno Ardiles Mena', CUENTAS_DEMO.Operador, 'Operador');
  nuevoUsuario('Luciana Pereda Ayala', `luciana.pereda@${DOMINIO}`, 'Operador');
  const clientes = PERSONAS.map(([nombre, user, depto, ciudad], i) => {
    const u = nuevoUsuario(nombre, `${user}@${DOMINIO}`, 'Cliente', true, hace(55 - i * 3));
    const d: DDireccion = {
      id: next('direccion'),
      idUsuario: u.id,
      alias: 'Casa',
      destinatario: nombre,
      linea1: `${3 + i}a calle ${10 + i * 2}-${20 + i} zona ${1 + (i % 12)}`,
      linea2: null,
      ciudad,
      departamento: depto,
      codigoPostal: null,
      telefono: `5550${String(1000 + i * 37).slice(0, 4)}`,
      esPrincipal: true,
    };
    s.direcciones.push(d);
    return u;
  });
  nuevoUsuario('Perla Zamudio Gil', `perla.zamudio@${DOMINIO}`, 'Cliente', false, hace(50));
  // La cuenta demo de cliente tiene una segunda dirección (para probar el selector del checkout).
  s.direcciones.push({
    id: next('direccion'),
    idUsuario: clientes[0]!.id,
    alias: 'Oficina',
    destinatario: clientes[0]!.nombre,
    linea1: 'Edificio Tzunún, oficina 4B, 7a avenida 12-30 zona 9',
    linea2: 'Recepción de lunes a viernes',
    ciudad: 'Guatemala',
    departamento: 'Guatemala',
    codigoPostal: '01009',
    telefono: '55509999',
    esPrincipal: false,
  });

  // Envíos
  s.metodosEnvio.push(
    { id: next('envio'), nombre: 'Envío sin costo', costo: 0, montoMinimo: 200, dias: 5 },
    { id: next('envio'), nombre: 'Entrega estándar', costo: 28, montoMinimo: null, dias: 5 },
    { id: next('envio'), nombre: 'Entrega express', costo: 48, montoMinimo: null, dias: 2 },
  );

  // Catálogo
  for (const [nombre, descripcion] of CATEGORIAS) {
    s.categorias.push({ id: next('categoria'), nombre, descripcion, activo: true });
    auditar(
      actorDe(admin),
      'Catálogo',
      'Categoría',
      s.seq.categoria!,
      'Alta',
      null,
      { nombre },
      hace(40),
    );
  }
  const productos: DProducto[] = [];
  PRODUCTOS.forEach(([cat, nombre, precio, tipo], i) => {
    const p: DProducto = {
      id: next('producto'),
      idCategoria: cat,
      nombre,
      descripcion: `${nombre}. Pieza de la colección de demostración: materiales cuidados y garantía de 30 días.`,
      activo: true,
      creado: hace(40 - Math.floor(i / 2)),
    };
    s.productos.push(p);
    productos.push(p);
    const nn = String(i + 1).padStart(2, '0');
    s.imagenes.push(
      {
        id: next('imagen'),
        idProducto: p.id,
        url: `${BASE}productos/${nn}.jpg`,
        orden: 0,
        esPrincipal: true,
      },
      {
        id: next('imagen'),
        idProducto: p.id,
        url: `${BASE}productos/${nn}b.jpg`,
        orden: 1,
        esPrincipal: false,
      },
    );
    for (const x of VARIANTES[tipo]) {
      const v: DVariante = {
        id: next('variante'),
        idProducto: p.id,
        sku: `DM${nn}-${x.cod}`,
        atributos: x.atributos,
        precio: round2(precio + x.delta),
        activo: true,
        fisica: 0,
        reservada: 0,
      };
      s.variantes.push(v);
    }
    auditar(actorDe(admin), 'Catálogo', 'Producto', p.id, 'Alta', null, { nombre }, p.creado);
  });

  // Stock inicial (solo por entradas, así el kardex cuadra); algunos casi agotados o sin stock.
  s.variantes.forEach((v, idx) => {
    const n = idx + 1;
    const qty = n % 23 === 0 ? 0 : n % 17 === 0 ? 4 : 90 + ((n * 41) % 160);
    if (qty > 0)
      mover(v, 'Entrada', qty, 'Stock inicial de la demostración', operador.nombre, null, hace(36));
  });

  // Cupones (códigos propios de la demo)
  const cup = (c: Omit<import('./db').DCupon, 'id' | 'usosTotalesActual'> & { usos?: number }) =>
    s.cupones.push({ id: next('cupon'), usosTotalesActual: c.usos ?? 0, ...c });
  const rango = (desdeDias: number, hastaDias: number) => ({
    vigenteDesde: new Date(Date.now() + desdeDias * DAY).toISOString(),
    vigenteHasta: new Date(Date.now() + hastaDias * DAY).toISOString(),
  });
  cup({
    codigo: 'DEMO10',
    tipo: 'Porcentaje',
    valor: 10,
    montoMinimo: 0,
    usosTotalesMax: 500,
    usosPorCliente: 3,
    idCategoria: null,
    ...rango(-60, 180),
    activo: true,
  });
  cup({
    codigo: 'CASA20',
    tipo: 'Porcentaje',
    valor: 20,
    montoMinimo: 150,
    usosTotalesMax: 200,
    usosPorCliente: 2,
    idCategoria: 4,
    ...rango(-30, 120),
    activo: true,
  });
  cup({
    codigo: 'AHORRA40',
    tipo: 'Fijo',
    valor: 40,
    montoMinimo: 250,
    usosTotalesMax: 300,
    usosPorCliente: 2,
    idCategoria: null,
    ...rango(-30, 120),
    activo: true,
  });
  cup({
    codigo: 'SONIDO75',
    tipo: 'Fijo',
    valor: 75,
    montoMinimo: 400,
    usosTotalesMax: 100,
    usosPorCliente: 1,
    idCategoria: 5,
    ...rango(-30, 120),
    activo: true,
  });
  cup({
    codigo: 'AGOTADO-DEMO',
    tipo: 'Porcentaje',
    valor: 15,
    montoMinimo: 0,
    usosTotalesMax: 5,
    usosPorCliente: 1,
    idCategoria: null,
    ...rango(-30, 120),
    activo: true,
    usos: 5,
  });
  cup({
    codigo: 'PROXIMO-DEMO',
    tipo: 'Porcentaje',
    valor: 25,
    montoMinimo: 0,
    usosTotalesMax: 50,
    usosPorCliente: 1,
    idCategoria: null,
    ...rango(10, 40),
    activo: true,
  });
  cup({
    codigo: 'CADUCADO-DEMO',
    tipo: 'Fijo',
    valor: 30,
    montoMinimo: 0,
    usosTotalesMax: 50,
    usosPorCliente: 1,
    idCategoria: null,
    ...rango(-90, -5),
    activo: true,
  });

  // Historial de pedidos de los últimos 30 días (cronológico, para que stock y kardex cuadren).
  const envios = s.metodosEnvio;
  const comprables = s.variantes;
  const total = 70;
  for (let i = 0; i < total; i++) {
    const diasAtras = 29.5 - (i / total) * 29.3;
    const fecha = hace(diasAtras, R() * 8);
    const cliente = i % 9 === 0 ? clientes[0]! : pick(clientes);
    const n = 1 + Math.floor(R() * 3);
    const lineas: { idVariante: number; cantidad: number; precio: number }[] = [];
    for (let k = 0; k < n; k++) {
      const v = pick(comprables);
      const cantidad = 1 + Math.floor(R() * 2);
      if (disponible(v) < cantidad || lineas.some((l) => l.idVariante === v.id)) continue;
      lineas.push({ idVariante: v.id, cantidad, precio: v.precio });
    }
    if (!lineas.length) continue;
    const sub = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const cupon = R() < 0.25 && sub >= 150 ? s.cupones[R() < 0.6 ? 0 : 2]! : null;
    const aplicable = cupon && cupon.usosTotalesActual < cupon.usosTotalesMax ? cupon : null;
    const dir = s.direcciones.find((d) => d.idUsuario === cliente.id && d.esPrincipal)!;
    const envio = sub >= 200 && R() < 0.7 ? envios[0]! : envios[1 + Math.floor(R() * 2)]!;
    const p = registrarPedido({
      usuario: cliente,
      direccion: dir,
      metodoEnvio: { nombre: envio.nombre, costo: envio.costo },
      cupon: aplicable,
      lineas,
      fecha,
      llave: null,
      liberaReserva: false,
    });
    // Avance del flujo según la antigüedad.
    const edad = diasAtras;
    const pasos: EstadoPedido[] = ['Preparando', 'Despachado', 'Entregado'];
    const alcanza = edad > 10 ? 3 : edad > 5 ? 2 : edad > 2 ? 1 : 0;
    let t = Date.parse(fecha);
    for (let k = 0; k < alcanza && R() < 0.97; k++) {
      t += 6 * 3_600_000;
      p.estado = pasos[k]!;
      p.historial.push({
        de: k === 0 ? 'Pagado' : pasos[k - 1]!,
        a: pasos[k]!,
        usuario: operador.nombre,
        nota: null,
        fecha: new Date(t).toISOString(),
      });
      auditar(
        actorDe(operador),
        'Pedidos',
        'Pedido',
        p.id,
        'Transicion',
        { estado: k === 0 ? 'Pagado' : pasos[k - 1] },
        { estado: pasos[k] },
        new Date(t).toISOString(),
      );
    }
    // Algunos cancelados (reintegran existencias) y devoluciones sobre entregados.
    if (p.estado === 'Pagado' && R() < 0.18) {
      for (const l of p.lineas)
        mover(
          variantePorId(l.idVariante)!,
          'Cancelacion',
          l.cantidad,
          'Cancelación del cliente',
          cliente.nombre,
          p.numero,
          addMs(fecha, 3_600_000),
        );
      p.estado = 'Cancelado';
      p.historial.push({
        de: 'Pagado',
        a: 'Cancelado',
        usuario: cliente.nombre,
        nota: 'Me equivoqué de talla',
        fecha: addMs(fecha, 3_600_000),
      });
    } else if (p.estado === 'Entregado' && R() < 0.14) {
      const l = p.lineas[0]!;
      const cant = l.cantidad;
      const monto = l.totalLinea;
      l.cantidadDevuelta = cant;
      const todas = p.lineas.every((x) => x.cantidadDevuelta === x.cantidad);
      mover(
        variantePorId(l.idVariante)!,
        'Devolucion',
        cant,
        'Devolución de cliente',
        operador.nombre,
        p.numero,
        addMs(fecha, 8 * 86_400_000),
      );
      p.devoluciones.push({
        id: next('devolucion'),
        motivo: 'El producto no era lo esperado',
        monto,
        fecha: addMs(fecha, 8 * 86_400_000),
        usuario: operador.nombre,
        lineas: [{ idPedidoLinea: l.id, sku: l.sku, cantidad: cant, monto }],
      });
      const a: EstadoPedido = todas ? 'DevueltoTotal' : 'DevueltoParcial';
      p.estado = a;
      p.historial.push({
        de: 'Entregado',
        a,
        usuario: operador.nombre,
        nota: null,
        fecha: addMs(fecha, 8 * 86_400_000),
      });
    }
  }
  // Carritos abandonados (clientes e invitados)
  const abandonado = (
    dueno: string,
    u: DUsuario | null,
    items: [number, number][],
    horas: number,
  ) => {
    s.carritos.push({
      id: next('carrito'),
      dueno,
      token: u ? null : dueno.slice(2),
      idUsuario: u?.id ?? null,
      lineas: items.map(([idVariante, cantidad]) => ({
        id: next('carritoLinea'),
        idVariante,
        cantidad,
      })),
      idCupon: null,
      actualizado: hace(0, horas),
    });
  };
  abandonado(
    `u:${clientes[3]!.id}`,
    clientes[3]!,
    [
      [5, 1],
      [60, 2],
    ],
    30,
  );
  abandonado(`u:${clientes[6]!.id}`, clientes[6]!, [[100, 1]], 52);
  abandonado(
    'g:6a1c0f52-3b1e-4d0e-9a55-0b6d1f6a9c01',
    null,
    [
      [12, 1],
      [13, 1],
    ],
    9,
  );
  abandonado('g:c3d8e4a7-71a2-4f5b-8b36-5d0a2b1f7e02', null, [[120, 3]], 75);

  setBuilding(null);
  return s;
}
