import * as db from './db.js';
import { $, el, fechaCorta, moneda, perezosa } from './ui.js';

const forma = $('#pedido'), dialogo = $('#form-pedido'), contenedor = $('#lineas'), lista = $('#lista-pedidos'), filtro = $('#filtro-pedidos'), estado = $('#pedidos-estado'), errorForma = $('#pedido-error');
let pedidos = [], plantas = [], editando = null;

const avisar = (texto, error = false) => { estado.textContent = texto; estado.classList.toggle('error', error); };

async function cargar() {
  [plantas, pedidos] = await Promise.all([db.todas(), db.pedidos()]);
  dibujar();
}

function dibujar() {
  const ver = pedidos.filter((p) => !filtro.value || p.estado === filtro.value).sort((a, b) => b.fecha.localeCompare(a.fecha));
  lista.replaceChildren(...(ver.length ? ver.map(tarjeta) : [el('p', 'No hay pedidos aquí.', 'estado')]));
}

function tarjeta(p) {
  const art = el('article', '', `tarjeta pedido ${p.estado}`);
  const cuerpo = el('div');
  const piezas = el('ul', '', 'piezas');
  p.lineas.forEach((l) => piezas.append(el('li', `${l.cantidad} × ${l.planta} · ${moneda.format(l.precio ?? 0)}`)));
  const total = p.lineas.reduce((s, l) => s + l.cantidad, 0), importe = p.lineas.reduce((s, l) => s + l.cantidad * (l.precio ?? 0), 0);
  cuerpo.append(el('h3', p.cliente), piezas, el('p', `${total} planta(s) · ${moneda.format(importe)} · ${fechaCorta.format(new Date(p.fecha))}${p.fechaEntrega ? ` · entregado ${fechaCorta.format(new Date(p.fechaEntrega))}` : ''}`, 'datos'));
  if (p.notas) cuerpo.append(el('p', p.notas, 'datos'));
  const acciones = el('div', '', 'acciones');
  const boton = (texto, accion, clase = '') => { const b = el('button', texto, clase); b.type = 'button'; b.addEventListener('click', accion); acciones.append(b); };
  if (p.estado === 'pendiente') {
    boton('Entregado', () => cambiarEstado(p, 'entregado'));
    boton('Cancelar', () => confirm(`¿Cancelar el pedido de ${p.cliente}? Sus plantas vuelven al inventario.`) && cambiarEstado(p, 'cancelado'), 'peligro');
  } else boton('Reabrir', () => cambiarEstado(p, 'pendiente'));
  boton('Editar', () => abrir(p));
  cuerpo.append(acciones);
  art.append(cuerpo);
  return art;
}

async function cambiarEstado(p, nuevo) {
  try { await db.guardarPedido({ ...p, estado: nuevo }); avisar(''); } catch (e) { avisar(e.message, true); }
}

// ---- Formulario ----
// Lo que se puede apartar de una planta: lo que queda más lo que este mismo pedido ya tiene apartado.
const apartadoAqui = (id) => (editando && editando.estado !== 'cancelado' ? editando.lineas.filter((l) => l.plantaId === id).reduce((s, l) => s + l.cantidad, 0) : 0);

function fila(l = {}) {
  const f = el('div', '', 'linea');
  const sel = el('select');
  sel.required = true;
  sel.setAttribute('aria-label', 'Planta');
  // Cada opción lleva el precio y costo de la planta: el precio se propone en la línea y el costo se guarda con la venta.
  const opcion = (id, nombre, texto, p) => { const o = Object.assign(el('option', texto), { value: id }); Object.assign(o.dataset, { nombre, precio: p?.precio ?? l.precio ?? 0, costo: p?.costo ?? l.costo ?? 0 }); return o; };
  const validas = plantas.filter((p) => (!p.archivada && p.existencias + apartadoAqui(p.id) > 0) || p.id === l.plantaId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  sel.append(...validas.map((p) => opcion(p.id, p.nombre, `${p.nombre} (disponibles ${p.existencias + apartadoAqui(p.id)})`, p)));
  if (l.plantaId !== undefined && !plantas.some((p) => p.id === l.plantaId)) sel.append(opcion(l.plantaId, l.planta, `${l.planta} (ya no existe)`));
  if (!sel.options.length) sel.append(opcion('', '', 'No hay plantas con existencias'));
  sel.value = l.plantaId ?? sel.options[0].value;
  const cantidad = Object.assign(document.createElement('input'), { type: 'number', min: 1, step: 1, value: l.cantidad ?? 1, required: true, inputMode: 'numeric' });
  cantidad.setAttribute('aria-label', 'Cantidad');
  const precio = Object.assign(document.createElement('input'), { type: 'number', min: 0, step: 0.01, required: true, inputMode: 'decimal', value: l.precio ?? sel.selectedOptions[0].dataset.precio });
  precio.setAttribute('aria-label', 'Precio de venta por pieza');
  sel.addEventListener('change', () => { precio.value = sel.selectedOptions[0].dataset.precio; });
  f.dataset.plantaOriginal = l.plantaId ?? '';
  f.dataset.costoOriginal = l.costo ?? '';
  const quitar = el('button', '×');
  quitar.type = 'button';
  quitar.setAttribute('aria-label', 'Quitar esta planta');
  quitar.addEventListener('click', () => f.remove());
  f.append(sel, cantidad, precio, quitar);
  contenedor.append(f);
}

async function abrir(p = null) {
  plantas = await db.todas(); // siempre con lo último, aunque la lista de pedidos aún esté cargando
  editando = p;
  forma.reset();
  contenedor.replaceChildren();
  errorForma.textContent = '';
  $('#pedido-titulo').textContent = p ? 'Editar pedido' : 'Nuevo pedido';
  $('#pedido-borrar').hidden = !p;
  if (p) { forma.elements.cliente.value = p.cliente; forma.elements.estado.value = p.estado; forma.elements.notas.value = p.notas ?? ''; p.lineas.forEach(fila); } else fila();
  dialogo.showModal();
}

forma.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cliente = forma.elements.cliente.value.trim();
  const juntas = new Map(); // dos filas de la misma planta con el mismo precio se suman en una
  for (const f of contenedor.children) {
    const [sel, cant, prec] = f.querySelectorAll('select, input');
    if (sel.value === '') continue;
    const id = Number(sel.value), cantidad = Number(cant.value), precio = Number(prec.value), op = sel.selectedOptions[0].dataset;
    const costo = String(id) === f.dataset.plantaOriginal && f.dataset.costoOriginal !== '' ? Number(f.dataset.costoOriginal) : Number(op.costo); // el costo de una línea ya guardada no cambia
    const k = `${id}|${precio}|${costo}`;
    juntas.set(k, { plantaId: id, planta: op.nombre, cantidad: (juntas.get(k)?.cantidad ?? 0) + cantidad, precio, costo });
  }
  const lineas = [...juntas.values()];
  const error = !cliente ? 'Escribe el nombre del cliente.'
    : !lineas.length ? 'Agrega al menos una planta.'
    : lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1) ? 'Las cantidades deben ser números enteros de 1 o más.'
    : lineas.some((l) => !Number.isFinite(l.precio) || l.precio < 0) ? 'El precio debe ser cero o más.' : '';
  if (error) { errorForma.textContent = error; return; }
  const pedido = { ...(editando ?? {}), cliente, lineas, estado: forma.elements.estado.value, notas: forma.elements.notas.value.trim(), fecha: editando?.fecha ?? new Date().toISOString() };
  try { await db.guardarPedido(pedido); dialogo.close(); avisar('Pedido guardado.'); } catch (err) { errorForma.textContent = err.message; }
});

$('#pedido-borrar').addEventListener('click', async () => {
  if (!confirm(`¿Borrar el pedido de ${editando.cliente}? No se puede deshacer${editando.estado === 'cancelado' ? '.' : '; sus plantas vuelven al inventario.'}`)) return;
  try { await db.borrarPedido(editando.id); dialogo.close(); avisar('Pedido borrado.'); } catch (err) { errorForma.textContent = err.message; }
});
$('#otra-linea').addEventListener('click', () => fila());
$('#pedido-cerrar').addEventListener('click', () => dialogo.close());
$('#nuevo-pedido').addEventListener('click', () => abrir());
filtro.addEventListener('change', dibujar);
perezosa('pedidos', cargar, (e) => avisar(e.message, true));
