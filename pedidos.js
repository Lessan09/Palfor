import * as db from './db.js';
import { $, el, fechaCorta, moneda, perezosa, preguntar } from './ui.js';
import { nombresRepetidos } from './logica.js';

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

const NOMBRE_ESTADO = { pendiente: 'Pendientes', entregado: 'Entregados', cancelado: 'Cancelados' };
async function cambiarEstado(p, nuevo) {
  try { await db.guardarPedido({ ...p, estado: nuevo }); avisar(`El pedido de ${p.cliente} pasó a “${NOMBRE_ESTADO[nuevo]}” (míralo en esa lista).`); } catch (e) { avisar(e.message, true); }
}

// Un pedido ya entregado: esas plantas salieron del vivero. Al cancelarlo o borrarlo se pregunta si regresan al inventario.
const devolucion = (p, accion) => preguntar('Este pedido ya se entregó', `Vas a ${accion} el pedido de ${p.cliente}. Su venta dejará de contarse en las estadísticas.\n\n¿Las plantas regresan al inventario?`,
  [['Sí, el cliente las devolvió', 'si', 'boton'], ['No, ya salieron del vivero', 'no'], ['Mejor no', null]]);

// ---- Formulario ----
// Lo que se puede apartar de una planta: lo que queda más lo que este mismo pedido ya tiene apartado.
const normalizado = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Total del pedido a la vista: así se entiende qué significan cantidad y precio.
function totalizar() {
  let piezas = 0, importe = 0;
  for (const f of contenedor.children) {
    const [, c, p] = f.querySelectorAll('select, input'), n = Number(c.value), precio = Number(p.value);
    if (n > 0 && Number.isFinite(precio)) { piezas += n; importe += n * precio; }
  }
  $('#pedido-total').textContent = `Total del pedido: ${moneda.format(importe)} · ${piezas} pieza(s)`;
}
contenedor.addEventListener('input', totalizar);
contenedor.addEventListener('change', totalizar);
const apartadoAqui = (id) => (editando && editando.estado !== 'cancelado' ? editando.lineas.filter((l) => l.plantaId === id).reduce((s, l) => s + l.cantidad, 0) : 0);

function fila(l = {}) {
  const f = el('div', '', 'linea');
  const sel = el('select');
  sel.required = true;
  sel.setAttribute('aria-label', 'Planta');
  // Cada opción lleva el precio y costo de la planta: el precio se propone en la línea y el costo se guarda con la venta.
  const repetidos = nombresRepetidos(plantas);
  // Si hay plantas con el mismo nombre se agrega su precio y lote para distinguirlas.
  const nombreOpcion = (p) => `${p.nombre}${repetidos.has(normalizado(p.nombre)) ? ` (${moneda.format(p.precio)}${p.lote ? `, lote ${p.lote}` : ''})` : ''}`;
  const opcion = (id, nombre, texto, p) => { const o = Object.assign(el('option', texto), { value: id }); Object.assign(o.dataset, { nombre, precio: p?.precio ?? l.precio ?? 0, costo: p?.costo ?? l.costo ?? 0 }); return o; };
  const validas = plantas.filter((p) => (!p.archivada && p.existencias + apartadoAqui(p.id) > 0) || p.id === l.plantaId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  sel.append(...validas.map((p) => opcion(p.id, p.nombre, `${nombreOpcion(p)} (disponibles ${p.existencias + apartadoAqui(p.id)})`, p)));
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
  quitar.addEventListener('click', () => { f.remove(); totalizar(); });
  const campo = (texto, control) => { const c = el('label', '', 'campo-linea'); c.append(el('span', texto), control); return c; };
  f.append(campo('Planta', sel), campo('Cantidad', cantidad), campo('Precio por pieza ($)', precio), quitar);
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
  totalizar();
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
  let sinStock = false;
  if (editando?.estado === 'entregado' && pedido.estado === 'cancelado') {
    const r = await devolucion(editando, 'cancelar');
    if (!r) return;
    sinStock = r === 'no';
  }
  try {
    await db.guardarPedido(pedido, { sinStock });
    dialogo.close();
    filtro.value = pedido.estado; // el pedido recién guardado se queda a la vista
    dibujar();
    avisar(`Pedido guardado (está en “${NOMBRE_ESTADO[pedido.estado]}”).`);
  } catch (err) { errorForma.textContent = err.message; }
});

$('#pedido-borrar').addEventListener('click', async () => {
  let sinStock = false;
  if (editando.estado === 'entregado') {
    const r = await devolucion(editando, 'borrar');
    if (!r) return;
    sinStock = r === 'no';
  } else if (!confirm(`¿Borrar el pedido de ${editando.cliente}? No se puede deshacer${editando.estado === 'cancelado' ? '.' : '; sus plantas vuelven al inventario.'}`)) return;
  try { await db.borrarPedido(editando.id, { sinStock }); dialogo.close(); avisar('Pedido borrado.'); } catch (err) { errorForma.textContent = err.message; }
});
$('#otra-linea').addEventListener('click', () => { fila(); totalizar(); });
$('#pedido-cerrar').addEventListener('click', () => dialogo.close());
$('#nuevo-pedido').addEventListener('click', () => abrir());
filtro.addEventListener('change', dibujar);
perezosa('pedidos', cargar, (e) => avisar(e.message, true));
