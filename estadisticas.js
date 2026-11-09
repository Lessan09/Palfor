import * as db from './db.js';
import { $, el, moneda, perezosa } from './ui.js';
import { agrupar, cuentaPaquete, mesDe, resumenInventario, total, ventas } from './logica.js';

const mesLargo = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const cajas = (destino, datos) => destino.replaceChildren(...datos.map(([valor, texto]) => { const c = el('div', '', 'estadistica'); c.append(el('strong', String(valor)), el('span', texto)); return c; }));
const filas = (destino, datos, vacio) => destino.replaceChildren(...(datos.length ? datos.map(([izq, der]) => { const f = el('div', '', 'dato-fila'); f.append(el('span', izq), el('strong', der)); return f; } ) : [el('p', vacio, 'estado')]));

// Desde cuándo cuenta el periodo elegido (inicio del mes actual, de hace 2 meses, o todo).
const desde = (periodo) => { const h = new Date(); return periodo === 'todo' ? '' : new Date(h.getFullYear(), h.getMonth() - (periodo === '3' ? 2 : 0), 1).toISOString(); };
const pct = (n) => `${Math.round(n * 100)} %`;

async function cargar() {
  const [plantas, paquetes, categorias, pedidos, movs] = await Promise.all([db.todas(), db.paquetes(), db.categorias(), db.pedidos(), db.todosMovimientos()]);
  const inv = resumenInventario(plantas);
  cajas($('#est-inventario'), inv.total ? [[inv.total, 'Plantas'], [inv.agotadas, 'Agotadas'], [inv.pocas, 'Con pocas'], [moneda.format(inv.costo), 'Inventario a costo'], [moneda.format(inv.venta), 'Inventario a precio']] : []);

  const todas = ventas(pedidos), inicio = desde($('#periodo').value);
  const v = todas.filter((x) => x.fecha >= inicio), t = total(v);
  cajas($('#est-ventas'), [[moneda.format(t.ingreso), 'Vendido'], [moneda.format(t.ganancia), 'Ganancia'], [t.piezas, 'Plantas vendidas'], [t.ingreso ? pct(t.ganancia / t.ingreso) : '—', 'Margen']]);
  $('#est-estimado').hidden = !v.some((x) => x.estimado);

  const vacio = 'Sin ventas en este periodo. Las ventas cuentan cuando un pedido pasa a “Entregado”.';
  filas($('#est-top'), agrupar(v, (x) => x.plantaId).sort((a, b) => b.piezas - a.piezas).slice(0, 5).map((g) => [v.find((x) => x.plantaId === g.clave).planta, `${g.piezas} · ${moneda.format(g.ingreso)}`]), vacio);
  const categoriaDe = new Map(plantas.map((p) => [p.id, p.categoria]));
  const nombreCat = (clave) => categorias.find((c) => c.clave === clave)?.nombre ?? clave ?? 'Sin categoría';
  filas($('#est-categorias'), agrupar(v, (x) => nombreCat(categoriaDe.get(x.plantaId))).sort((a, b) => b.ingreso - a.ingreso).map((g) => [g.clave, `${g.piezas} · ${moneda.format(g.ingreso)}`]), vacio);
  filas($('#est-paquetes'), paquetes.map((pq) => ({ pq, c: cuentaPaquete(pq, plantas, movs, pedidos) })).sort((a, b) => b.c.vendido - a.c.vendido)
    .map(({ pq, c }) => [pq.nombre, `vendido ${moneda.format(c.vendido)} · ganancia ${moneda.format(c.ganancia)} · quedan ${c.quedan}`]), 'Todavía no hay paquetes.');
  filas($('#est-meses'), agrupar(todas, (x) => mesDe(x.fecha)).sort((a, b) => b.clave.localeCompare(a.clave)).slice(0, 12).map((g) => {
    const [a, m] = g.clave.split('-').map(Number);
    return [mesLargo.format(new Date(a, m - 1, 1)), `${g.piezas} · ${moneda.format(g.ingreso)} · ganancia ${moneda.format(g.ganancia)}`];
  }), 'Todavía no hay ventas.');
}

$('#periodo').addEventListener('change', () => cargar().catch(() => {}));
perezosa('estadisticas', cargar);
