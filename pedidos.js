import * as db from './db.js';

const $ = (s) => document.querySelector(s);
const forma = $('#pedido'), dialogo = $('#form-pedido'), contenedor = $('#lineas'), lista = $('#lista-pedidos'), filtro = $('#filtro-pedidos'), estado = $('#pedidos-estado'), errorForma = $('#pedido-error');
const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let pedidos = [], plantas = [], editando = null;

const el = (tag, texto = '', clase = '') => Object.assign(document.createElement(tag), { textContent: texto, className: clase });
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
  p.lineas.forEach((l) => piezas.append(el('li', `${l.cantidad} × ${l.planta}`)));
  const total = p.lineas.reduce((s, l) => s + l.cantidad, 0);
  cuerpo.append(el('h3', p.cliente), piezas, el('p', `${total} planta(s) · ${fecha.format(new Date(p.fecha))}`, 'datos'));
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
  const opcion = (id, nombre, texto) => { const o = Object.assign(el('option', texto), { value: id }); o.dataset.nombre = nombre; return o; };
  const validas = plantas.filter((p) => p.existencias + apartadoAqui(p.id) > 0 || p.id === l.plantaId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  sel.append(...validas.map((p) => opcion(p.id, p.nombre, `${p.nombre} (disponibles ${p.existencias + apartadoAqui(p.id)})`)));
  if (l.plantaId !== undefined && !plantas.some((p) => p.id === l.plantaId)) sel.append(opcion(l.plantaId, l.planta, `${l.planta} (ya no existe)`));
  if (!sel.options.length) sel.append(opcion('', '', 'No hay plantas con existencias'));
  sel.value = l.plantaId ?? sel.options[0].value;
  const cantidad = Object.assign(document.createElement('input'), { type: 'number', min: 1, step: 1, value: l.cantidad ?? 1, required: true, inputMode: 'numeric' });
  cantidad.setAttribute('aria-label', 'Cantidad');
  const quitar = el('button', '×');
  quitar.type = 'button';
  quitar.setAttribute('aria-label', 'Quitar esta planta');
  quitar.addEventListener('click', () => f.remove());
  f.append(sel, cantidad, quitar);
  contenedor.append(f);
}

function abrir(p = null) {
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
  const juntas = new Map(); // dos filas de la misma planta se suman en una
  for (const f of contenedor.children) {
    const [sel, cant] = f.querySelectorAll('select, input');
    if (sel.value === '') continue;
    const id = Number(sel.value), cantidad = Number(cant.value);
    juntas.set(id, { plantaId: id, planta: sel.selectedOptions[0].dataset.nombre, cantidad: (juntas.get(id)?.cantidad ?? 0) + cantidad });
  }
  const lineas = [...juntas.values()];
  const error = !cliente ? 'Escribe el nombre del cliente.'
    : !lineas.length ? 'Agrega al menos una planta.'
    : lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1) ? 'Las cantidades deben ser números enteros de 1 o más.' : '';
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
addEventListener('palfor:cambio', () => cargar().catch((e) => avisar(e.message, true)));
cargar().catch((e) => avisar(e.message, true));
