import type {
  Atributos,
  CambiarEstadoInput,
  Checkout,
  CrearDevolucionInput,
  Devolucion,
  EstadoPedido,
  ListarPedidosAdminQuery,
  ListarPedidosQuery,
  MetodoEnvio,
  PedidoDetalle,
  PedidoResumen,
  PedidoResumenAdmin,
} from '@shopcart/contracts';
import { executeSp, iso, p, pageRows, T, type Row, type SpResult } from '../../shared/db';
import { toCarrito } from '../../shared/carrito';

function parseAtributos(json: unknown): Atributos {
  try {
    return JSON.parse(String(json)) as Atributos;
  } catch {
    return {};
  }
}

const toResumen = (r: Row): PedidoResumen => ({
  idPedido: r.idPedido as number,
  numeroPedido: r.numeroPedido as string,
  fechaCreacion: iso(r.fechaCreacion),
  estadoCodigo: r.estadoCodigo as EstadoPedido,
  estadoNombre: r.estadoNombre as string,
  total: Number(r.total),
  cantidadItems: Number(r.cantidadItems ?? 0),
});

const toResumenAdmin = (r: Row): PedidoResumenAdmin => ({
  ...toResumen(r),
  idUsuario: r.idUsuario as number,
  clienteNombre: r.clienteNombre as string,
  clienteCorreo: r.clienteCorreo as string,
});

function toDetalle(rs: Row[][]): PedidoDetalle {
  const h = rs[0]![0]!;
  const devLineas = rs[4] ?? [];
  const acc = rs[5]![0]!;
  const devoluciones: Devolucion[] = (rs[3] ?? []).map((d) => ({
    idDevolucion: d.idDevolucion as number,
    motivo: d.motivo as string,
    montoTotal: Number(d.montoTotal),
    fecha: iso(d.fecha),
    usuario: d.usuario as string,
    lineas: devLineas
      .filter((l) => l.idDevolucion === d.idDevolucion)
      .map((l) => ({
        idPedidoLinea: l.idPedidoLinea as number,
        sku: l.sku as string,
        cantidad: l.cantidad as number,
        montoReembolso: Number(l.montoReembolso),
      })),
  }));
  return {
    idPedido: h.idPedido as number,
    numeroPedido: h.numeroPedido as string,
    fechaCreacion: iso(h.fechaCreacion),
    estadoCodigo: h.estadoCodigo as EstadoPedido,
    estadoNombre: h.estadoNombre as string,
    cliente: {
      idUsuario: h.idUsuario as number,
      nombre: h.clienteNombre as string,
      correo: h.clienteCorreo as string,
    },
    direccion: {
      destinatario: h.dirDestinatario as string,
      linea1: h.dirLinea1 as string,
      linea2: (h.dirLinea2 as string | null) ?? null,
      ciudad: h.dirCiudad as string,
      departamento: h.dirDepartamento as string,
      codigoPostal: (h.dirCodigoPostal as string | null) ?? null,
      telefono: h.dirTelefono as string,
    },
    metodoEnvio: h.metodoEnvioNombre as string,
    cuponCodigo: (h.cuponCodigo as string | null) ?? null,
    subtotal: Number(h.subtotal),
    descuento: Number(h.descuento),
    costoEnvio: Number(h.costoEnvio),
    total: Number(h.total),
    iva: Number(h.iva),
    montoDevuelto: Number(h.montoDevuelto),
    cantidadItems: Number(h.cantidadItems ?? 0),
    reutilizado: Boolean(h.reutilizado),
    lineas: (rs[1] ?? []).map((l) => ({
      idPedidoLinea: l.idPedidoLinea as number,
      sku: l.sku as string,
      nombreProducto: l.nombreProducto as string,
      atributos: parseAtributos(l.atributosJson),
      cantidad: l.cantidad as number,
      cantidadDevuelta: Number(l.cantidadDevuelta),
      precioUnitario: Number(l.precioUnitario),
      descuentoLinea: Number(l.descuentoLinea),
      totalLinea: Number(l.totalLinea),
    })),
    historial: (rs[2] ?? []).map((x) => ({
      estadoAnteriorCodigo: (x.estadoAnteriorCodigo as string | null) ?? null,
      estadoAnteriorNombre: (x.estadoAnteriorNombre as string | null) ?? null,
      estadoNuevoCodigo: x.estadoNuevoCodigo as string,
      estadoNuevoNombre: x.estadoNuevoNombre as string,
      usuario: x.usuario as string,
      nota: (x.nota as string | null) ?? null,
      fecha: iso(x.fecha),
    })),
    devoluciones,
    acciones: {
      puedeCancelar: Boolean(acc.puedeCancelar),
      puedeDevolver: Boolean(acc.puedeDevolver),
      transiciones: (rs[6] ?? []).map((t) => t.codigo as EstadoPedido),
    },
  };
}

const detalle = (r: SpResult): PedidoDetalle => toDetalle(r.recordsets);

// ── Envío y checkout ──────────────────────────────────────────────────────────

export async function listarMetodosEnvio(): Promise<MetodoEnvio[]> {
  const r = await executeSp('SP_MetodosEnvio_Listar');
  return (r.recordsets[0] ?? []).map((m) => ({
    idMetodoEnvio: m.idMetodoEnvio as number,
    nombre: m.nombre as string,
    costo: Number(m.costo),
    montoMinimo: m.montoMinimo === null ? null : Number(m.montoMinimo),
    diasEstimados: m.diasEstimados as number,
  }));
}

function toCheckout(r: SpResult): Checkout {
  return {
    carrito: toCarrito(r.recordsets),
    opcionesEnvio: (r.recordsets[2] ?? []).map((o) => ({
      idMetodoEnvio: o.idMetodoEnvio as number,
      nombre: o.nombre as string,
      diasEstimados: o.diasEstimados as number,
      costo: Number(o.costo),
      aplica: Boolean(o.aplica),
      total: Number(o.total),
      iva: Number(o.iva),
    })),
  };
}

export async function iniciarCheckout(idSesion: number, minutos: number): Promise<Checkout> {
  return toCheckout(
    await executeSp('SP_Pedidos_IniciarCheckout', {
      IDUsuarioSesion: p(T.Int, idSesion),
      ReservaMinutos: p(T.Int, minutos),
    }),
  );
}

export async function obtenerCheckout(idSesion: number): Promise<Checkout> {
  return toCheckout(
    await executeSp('SP_Pedidos_ObtenerCheckout', { IDUsuarioSesion: p(T.Int, idSesion) }),
  );
}

export async function cancelarCheckout(idSesion: number): Promise<void> {
  await executeSp('SP_Pedidos_CancelarCheckout', { IDUsuarioSesion: p(T.Int, idSesion) });
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

export async function crearPedido(
  idSesion: number,
  idDireccion: number,
  idMetodoEnvio: number,
  totalEsperado: number,
  llave: string,
): Promise<PedidoDetalle> {
  return detalle(
    await executeSp('SP_Pedidos_CrearPedido', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDDireccion: p(T.Int, idDireccion),
      IDMetodoEnvio: p(T.Int, idMetodoEnvio),
      TotalEsperado: p(T.Decimal(18, 2), totalEsperado),
      LlaveIdempotencia: p(T.UniqueIdentifier, llave),
    }),
  );
}

export async function obtenerPorId(idSesion: number, idPedido: number): Promise<PedidoDetalle> {
  return detalle(
    await executeSp('SP_Pedidos_ObtenerPorId', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDPedido: p(T.Int, idPedido),
    }),
  );
}

export async function listarPorUsuario(
  idSesion: number,
  q: ListarPedidosQuery,
): Promise<{ items: PedidoResumen[]; total: number }> {
  const r = await executeSp('SP_Pedidos_ListarPorUsuario', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Estado: p(T.NVarChar(20), q.estado ?? null),
    Desde: p(T.NVarChar(10), q.desde ?? null),
    Hasta: p(T.NVarChar(10), q.hasta ?? null),
    Numero: p(T.NVarChar(30), q.numero ?? null),
    OrdenarPor: p(T.NVarChar(20), q.sort.campo),
    Direccion: p(T.NVarChar(4), q.sort.direccion),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toResumen), total };
}

export async function listarAdmin(
  idSesion: number,
  q: ListarPedidosAdminQuery,
): Promise<{ items: PedidoResumenAdmin[]; total: number }> {
  const r = await executeSp('SP_Pedidos_ListarAdmin', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Estado: p(T.NVarChar(20), q.estado ?? null),
    Desde: p(T.NVarChar(10), q.desde ?? null),
    Hasta: p(T.NVarChar(10), q.hasta ?? null),
    Numero: p(T.NVarChar(30), q.numero ?? null),
    Cliente: p(T.NVarChar(100), q.cliente ?? null),
    OrdenarPor: p(T.NVarChar(20), q.sort.campo),
    Direccion: p(T.NVarChar(4), q.sort.direccion),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toResumenAdmin), total };
}

export async function cambiarEstado(
  idSesion: number,
  idPedido: number,
  i: CambiarEstadoInput,
): Promise<PedidoDetalle> {
  return detalle(
    await executeSp('SP_Pedidos_CambiarEstado', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDPedido: p(T.Int, idPedido),
      Estado: p(T.NVarChar(20), i.estado),
      Nota: p(T.NVarChar(500), i.nota ?? null),
    }),
  );
}

export async function cancelar(
  idSesion: number,
  idPedido: number,
  motivo: string,
): Promise<PedidoDetalle> {
  return detalle(
    await executeSp('SP_Pedidos_Cancelar', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDPedido: p(T.Int, idPedido),
      Motivo: p(T.NVarChar(500), motivo),
    }),
  );
}

export async function crearDevolucion(
  idSesion: number,
  idPedido: number,
  i: CrearDevolucionInput,
): Promise<PedidoDetalle> {
  return detalle(
    await executeSp('SP_Pedidos_CrearDevolucion', {
      IDUsuarioSesion: p(T.Int, idSesion),
      IDPedido: p(T.Int, idPedido),
      Motivo: p(T.NVarChar(500), i.motivo),
      LineasJson: p(T.NVarChar(T.MAX), JSON.stringify(i.lineas)),
    }),
  );
}
