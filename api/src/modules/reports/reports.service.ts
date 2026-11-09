import ExcelJS from 'exceljs';
import {
  PAGE_SIZE_MAX,
  type CarritoAbandonado,
  type EntradaBitacora,
  type Kpis,
  type ListarBitacoraQuery,
  type RangoQuery,
  type ReporteEvento,
  type TopProducto,
  type TopProductosQuery,
  type VentaCategoria,
  type VentaPeriodo,
  type VentasQuery,
} from '@shopcart/contracts';
import { config } from '../../shared/config';
import { alEjecutarSp } from '../../shared/db';
import * as repo from './reports.repository';

// Solo Administrador (ruta + SP). Las reglas de cálculo viven en la BD.
// La caché de ventas vive aquí. Se suelta cuando executeSp corre un SP que
// cambia pedidos o cierra un carrito; ningún otro módulo importa este archivo.

export interface CacheResult<T> {
  valor: T;
  cache: 'HIT' | 'MISS';
}

type Alcance = ReporteEvento['alcance'];

const TTL_VENTAS_MS = 5 * 60_000;

/** SP de otros módulos que cambian lo que muestran estos reportes. */
const SP_ALCANCE: Record<string, Alcance> = {
  SP_Pedidos_CrearPedido: 'todo',
  SP_Pedidos_Cancelar: 'ventas',
  SP_Pedidos_CrearDevolucion: 'ventas',
  SP_Carrito_AgregarLinea: 'carritos',
  SP_Carrito_ActualizarCantidad: 'carritos',
  SP_Carrito_EliminarLinea: 'carritos',
  SP_Carrito_AplicarCupon: 'carritos',
  SP_Carrito_QuitarCupon: 'carritos',
  SP_Carrito_FusionarInvitadoAUsuario: 'carritos',
};

interface Entrada {
  valor: unknown;
  expira: number;
  gen: number;
}

let genVentas = 0;
const store = new Map<string, Entrada>();
const oyentes: ((alcance: Alcance) => void)[] = [];

function invalidar(alcance: Alcance): void {
  if (alcance !== 'carritos') {
    genVentas += 1;
    store.clear();
  }
  for (const fn of oyentes) fn(alcance);
}

alEjecutarSp((nombre) => {
  const alcance = SP_ALCANCE[nombre];
  if (alcance) invalidar(alcance);
});

/** El stream del dashboard se entera sin que este servicio conozca HTTP. */
export function alCambiarReportes(fn: (alcance: Alcance) => void): void {
  oyentes.push(fn);
}

function conCache<T>(partes: unknown[], cargar: () => Promise<T>): Promise<CacheResult<T>> {
  const clave = JSON.stringify(partes);
  const ahora = Date.now();
  const previo = store.get(clave);
  if (previo && previo.expira > ahora && previo.gen === genVentas) {
    return Promise.resolve({ valor: previo.valor as T, cache: 'HIT' });
  }
  const gen = genVentas;
  return cargar().then((valor) => {
    if (gen === genVentas) store.set(clave, { valor, expira: Date.now() + TTL_VENTAS_MS, gen });
    return { valor, cache: 'MISS' as const };
  });
}

export const kpis = (idSesion: number, q: RangoQuery): Promise<CacheResult<Kpis>> =>
  conCache(['kpis', q], () => repo.kpis(idSesion, q));

export const ventasPorPeriodo = (
  idSesion: number,
  q: VentasQuery,
): Promise<CacheResult<VentaPeriodo[]>> =>
  conCache(['ventas', q], () => repo.ventasPorPeriodo(idSesion, q));

export const ventasPorCategoria = (
  idSesion: number,
  q: RangoQuery,
): Promise<CacheResult<VentaCategoria[]>> =>
  conCache(['categoria', q], () => repo.ventasPorCategoria(idSesion, q));

export const topProductos = (
  idSesion: number,
  q: TopProductosQuery,
): Promise<CacheResult<TopProducto[]>> =>
  conCache(['top', q], () => repo.topProductos(idSesion, q));

/** Sin caché: un carrito entra al reporte por el reloj, no por una escritura. */
export const carritosAbandonados = (
  idSesion: number,
  page: number,
  pageSize: number,
): Promise<{ items: CarritoAbandonado[]; total: number }> =>
  repo.carritosAbandonados(idSesion, config.CARRITO_ABANDONADO_MIN, page, pageSize);

export const listarBitacora = (
  idSesion: number,
  q: ListarBitacoraQuery,
): Promise<{ items: EntradaBitacora[]; total: number }> => repo.listarBitacora(idSesion, q);

// ── Excel: mismas cifras que el dashboard, armadas aquí para no abrir otro archivo ──

const DINERO = '#,##0.00';

function encabezado(hoja: ExcelJS.Worksheet): void {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075F49' } };
  fila.alignment = { vertical: 'middle' };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: hoja.columnCount },
  };
}

function dinero(fila: ExcelJS.Row, columnas: number[]): void {
  for (const c of columnas) fila.getCell(c).numFmt = DINERO;
}

function hojaVentas(wb: ExcelJS.Workbook, nombre: string, filas: VentaPeriodo[]): void {
  const hoja = wb.addWorksheet(nombre);
  hoja.columns = [
    { header: 'Periodo', key: 'periodo', width: 16 },
    { header: 'Ventas netas (Q)', key: 'ventasNetas', width: 20 },
    { header: 'Pedidos', key: 'pedidos', width: 14 },
  ];
  for (const f of filas) dinero(hoja.addRow(f), [2]);
  encabezado(hoja);
}

async function todosLosCarritos(idSesion: number): Promise<CarritoAbandonado[]> {
  const items: CarritoAbandonado[] = [];
  let total = 0;
  let page = 1;
  do {
    const r = await carritosAbandonados(idSesion, page, PAGE_SIZE_MAX);
    total = r.total;
    items.push(...r.items);
    page += 1;
  } while (items.length < total && page <= 100);
  return items;
}

export async function exportarExcel(
  idSesion: number,
  q: RangoQuery,
): Promise<{ buffer: Buffer; nombre: string }> {
  const k = (await kpis(idSesion, q)).valor;
  const [dia, semana, mes, categorias, top] = await Promise.all([
    ventasPorPeriodo(idSesion, { ...q, agrupacion: 'dia' }),
    ventasPorPeriodo(idSesion, { ...q, agrupacion: 'semana' }),
    ventasPorPeriodo(idSesion, { ...q, agrupacion: 'mes' }),
    ventasPorCategoria(idSesion, q),
    topProductos(idSesion, { ...q, limite: 10 }),
  ]);
  const carritos = await todosLosCarritos(idSesion);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ShopCart';
  wb.created = new Date();
  hojaKpis(wb, k);
  hojaVentas(wb, 'Ventas por dia', dia.valor);
  hojaVentas(wb, 'Ventas por semana', semana.valor);
  hojaVentas(wb, 'Ventas por mes', mes.valor);
  hojaCategorias(wb, categorias.valor);
  hojaTop(wb, top.valor);
  hojaCarritos(wb, carritos);

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    nombre: `shopcart-reportes_${k.desde}_${k.hasta}.xlsx`,
  };
}

function hojaKpis(wb: ExcelJS.Workbook, k: Kpis): void {
  const hoja = wb.addWorksheet('KPIs');
  hoja.columns = [
    { header: 'Indicador', key: 'indicador', width: 28 },
    { header: 'Valor', key: 'valor', width: 22 },
  ];
  const filas: { indicador: string; valor: string | number; dinero?: boolean }[] = [
    { indicador: 'Desde', valor: k.desde },
    { indicador: 'Hasta', valor: k.hasta },
    { indicador: 'Ventas netas (Q)', valor: k.ventasNetas, dinero: true },
    { indicador: 'Pedidos', valor: k.pedidos },
    { indicador: 'Ticket promedio (Q)', valor: k.ticketPromedio, dinero: true },
    { indicador: 'Unidades', valor: k.unidades },
    { indicador: 'Monto devuelto (Q)', valor: k.montoDevuelto, dinero: true },
  ];
  for (const f of filas) {
    const fila = hoja.addRow({ indicador: f.indicador, valor: f.valor });
    if (f.dinero) dinero(fila, [2]);
  }
  encabezado(hoja);
  hoja.addRow([]);
  hoja.addRow(['Pedidos pagados, sin cancelados y restando devoluciones. Hora de Guatemala.']);
}

function hojaCategorias(wb: ExcelJS.Workbook, filas: VentaCategoria[]): void {
  const hoja = wb.addWorksheet('Por categoria');
  hoja.columns = [
    { header: 'Categoria', key: 'categoria', width: 28 },
    { header: 'Ventas netas (Q)', key: 'ventasNetas', width: 20 },
    { header: 'Unidades', key: 'unidades', width: 14 },
    { header: 'Pedidos', key: 'pedidos', width: 14 },
  ];
  for (const f of filas) dinero(hoja.addRow(f), [2]);
  encabezado(hoja);
}

function hojaTop(wb: ExcelJS.Workbook, filas: TopProducto[]): void {
  const hoja = wb.addWorksheet('Top productos');
  hoja.columns = [
    { header: 'Producto', key: 'producto', width: 36 },
    { header: 'Unidades', key: 'unidades', width: 14 },
    { header: 'Ventas netas (Q)', key: 'ventasNetas', width: 20 },
  ];
  for (const f of filas) dinero(hoja.addRow(f), [3]);
  encabezado(hoja);
}

function hojaCarritos(wb: ExcelJS.Workbook, filas: CarritoAbandonado[]): void {
  const hoja = wb.addWorksheet('Carritos abandonados');
  hoja.columns = [
    { header: 'Carrito', key: 'idCarrito', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Correo', key: 'correoCliente', width: 32 },
    { header: 'Items', key: 'items', width: 10 },
    { header: 'Subtotal (Q)', key: 'subtotal', width: 16 },
    { header: 'Ultima actividad', key: 'ultimaActividad', width: 24 },
  ];
  for (const f of filas) dinero(hoja.addRow(f), [5]);
  encabezado(hoja);
}
