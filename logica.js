// Cálculos puros (sin pantalla ni base de datos): cuentas de paquetes, estadísticas y los datos que se completan al actualizar.
export const POCAS = 5;
export const nivel = (n) => (n <= 0 ? 'agotada' : n <= POCAS ? 'pocas' : 'bien');

// El historial empieza con lo que ya había: un movimiento "inicial" por cada planta con existencias.
export const movimientosIniciales = (plantas, fecha = new Date().toISOString()) => plantas
  .filter((p) => p.existencias > 0)
  .map((p) => ({ fecha, plantaId: p.id, planta: p.nombre, tipo: 'inicial', cantidad: p.existencias, precio: p.precio, costo: p.costo }));

// Los pedidos anteriores no guardaron precio ni costo: se les pone el valor de hoy y se marcan como estimados.
export const completarPedidos = (pedidos, plantas) => {
  const por = new Map(plantas.map((p) => [p.id, p]));
  return pedidos.map((x) => ({
    ...x,
    lineas: x.lineas.map((l) => (l.precio !== undefined && l.costo !== undefined ? l
      : { ...l, precio: por.get(l.plantaId)?.precio ?? 0, costo: por.get(l.plantaId)?.costo ?? 0, estimado: true })),
    ...(x.estado === 'entregado' && !x.fechaEntrega ? { fechaEntrega: x.fecha } : {})
  }));
};

// Una venta es cada línea de un pedido ENTREGADO, con el precio y costo que tenía ese día.
export const ventas = (pedidos) => pedidos.filter((p) => p.estado === 'entregado').flatMap((p) => p.lineas.map((l) => ({
  fecha: p.fechaEntrega ?? p.fecha, plantaId: l.plantaId, planta: l.planta, cantidad: l.cantidad,
  ingreso: l.cantidad * l.precio, costo: l.cantidad * l.costo, estimado: !!l.estimado
})));

export function agrupar(v, clave) {
  const g = new Map();
  for (const x of v) {
    const k = clave(x), a = g.get(k) ?? { clave: k, ingreso: 0, costo: 0, piezas: 0 };
    a.ingreso += x.ingreso; a.costo += x.costo; a.piezas += x.cantidad;
    g.set(k, a);
  }
  return [...g.values()].map((a) => ({ ...a, ganancia: a.ingreso - a.costo }));
}
export const total = (v) => agrupar(v, () => 'todo')[0] ?? { clave: 'todo', ingreso: 0, costo: 0, piezas: 0, ganancia: 0 };

export const mesDe = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Lo que hay ahora en el inventario (las plantas archivadas no cuentan).
export function resumenInventario(plantas) {
  const activas = plantas.filter((p) => !p.archivada);
  return {
    total: activas.length,
    agotadas: activas.filter((p) => p.existencias <= 0).length,
    pocas: activas.filter((p) => nivel(p.existencias) === 'pocas').length,
    costo: activas.reduce((s, p) => s + p.existencias * p.costo, 0),
    venta: activas.reduce((s, p) => s + p.existencias * p.precio, 0)
  };
}

// Cuenta de un paquete = solo lo que pasó con las plantas que tiene dentro (cada una con su propio costo y precio).
// Una planta puede estar en varios paquetes; cada paquete es una "lente", así que el total del vivero nunca se cuenta doble.
export function cuentaPaquete(paquete, plantas, movs, pedidos) {
  const miembros = plantas.filter((p) => p.paquetes?.includes(paquete.id));
  const todas = ventas(pedidos);
  const detalle = miembros.map((p) => {
    const invertido = movs.filter((m) => m.plantaId === p.id && (m.tipo === 'inicial' || m.tipo === 'entrada')).reduce((s, m) => s + m.cantidad * m.costo, 0);
    const t = total(todas.filter((x) => x.plantaId === p.id));
    return { planta: p, invertido, vendido: t.ingreso, piezasVendidas: t.piezas, ganancia: t.ganancia, quedan: p.existencias, valorRestante: p.existencias * p.precio };
  });
  const vivas = detalle.filter((d) => !d.planta.archivada);
  const suma = (campo, lista = detalle) => lista.reduce((s, d) => s + d[campo], 0);
  const invertido = suma('invertido'), vendido = suma('vendido');
  return {
    detalle, plantas: vivas.length, invertido, vendido, piezasVendidas: suma('piezasVendidas'), ganancia: suma('ganancia'),
    recuperado: invertido ? vendido / invertido : 0, quedan: suma('quedan', vivas), valorRestante: suma('valorRestante', vivas),
    estimado: todas.some((x) => x.estimado && miembros.some((p) => p.id === x.plantaId))
  };
}
