import * as db from './db.js';
import { $, el, listaPaginada, moneda, normalizar, perezosa } from './ui.js';
import { cuentaPaquete, nombresRepetidos } from './logica.js';

const contenedor = $('#burbujas'), estado = $('#paquetes-estado'), detalleDlg = $('#detalle-paquete'), formDlg = $('#form-paquete'), forma = $('#paquete');
let plantas = [], paquetes = [], urls = [], abierto = null, editando = null; // abierto = id del paquete cuyo detalle se está viendo

const avisar = (texto, error = false) => { estado.textContent = texto; estado.classList.toggle('error', error); };
const pct = (n) => `${Math.round(n * 100)} %`;

async function cargar() {
  [plantas, paquetes] = await Promise.all([db.todas(), db.paquetes()]);
  dibujar();
  if (abierto !== null) await detalle();
}

// Cada paquete es una burbuja como las carpetas del celular: un mosaico con las fotos de sus plantas.
function dibujar() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  if (!paquetes.length) { contenedor.replaceChildren(el('p', 'Aún no hay paquetes. Crea el primero con “+ Nuevo paquete”.', 'estado')); return; }
  contenedor.replaceChildren(...[...paquetes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((pq) => {
    const miembros = plantas.filter((p) => p.paquetes?.includes(pq.id) && !p.archivada);
    const mosaico = el('div', '', 'mosaico');
    for (let i = 0; i < 4; i++) {
      const p = miembros[i];
      if (p?.foto) { const url = URL.createObjectURL(p.foto); urls.push(url); mosaico.append(Object.assign(el('img'), { src: url, alt: '', loading: 'lazy' })); }
      else mosaico.append(el('span', p ? '🌱' : ''));
    }
    const b = el('button', '', 'burbuja');
    b.type = 'button';
    b.append(mosaico, el('strong', pq.nombre), el('span', `${miembros.length} planta(s) · quedan ${miembros.reduce((s, p) => s + p.existencias, 0)}`, 'datos'));
    b.addEventListener('click', () => abrirDetalle(pq.id));
    return b;
  }));
}

// ---- Detalle de un paquete: su cuenta, sus plantas y su historial ----
async function abrirDetalle(id) {
  abierto = id;
  if (!paquetes.some((x) => x.id === id)) [plantas, paquetes] = await Promise.all([db.todas(), db.paquetes()]); // paquete recién creado
  await detalle();
  if (!detalleDlg.open && abierto !== null) detalleDlg.showModal();
}

async function detalle() {
  const pq = paquetes.find((x) => x.id === abierto);
  if (!pq) { if (detalleDlg.open) detalleDlg.close(); return; }
  const [movs, peds] = await Promise.all([db.todosMovimientos(), db.pedidos()]);
  const c = cuentaPaquete(pq, plantas, movs, peds);
  $('#paq-nombre').textContent = pq.nombre;
  $('#paq-notas').textContent = pq.notas ?? '';
  $('#paq-notas').hidden = !pq.notas;
  $('#paq-estimado').hidden = !c.estimado;
  $('#paq-cuenta').replaceChildren(...[
    [c.plantas, 'Plantas'], [moneda.format(c.invertido), 'Invertido'], [moneda.format(c.vendido), 'Vendido'], [moneda.format(c.ganancia), 'Ganancia'],
    [pct(c.recuperado), 'Recuperado'], [c.quedan, 'Quedan'], [moneda.format(c.valorRestante), 'Valor de lo que queda']
  ].map(([valor, texto]) => { const caja = el('div', '', 'estadistica'); caja.append(el('strong', String(valor)), el('span', texto)); return caja; }));

  // Mini-cuenta de cada planta del paquete (con su propio costo y precio).
  const filas = [...c.detalle].sort((a, b) => a.planta.nombre.localeCompare(b.planta.nombre, 'es')).map((d) => {
    const art = el('article', '', `planta-paq${d.planta.archivada ? ' archivada' : ''}`);
    const cuerpo = el('div');
    cuerpo.append(
      el('h4', d.planta.nombre + (d.planta.archivada ? ' (archivada)' : '')),
      el('p', `Quedan ${d.quedan} · costo ${moneda.format(d.planta.costo)} · precio ${moneda.format(d.planta.precio)}`, 'datos'),
      el('p', `Invertido ${moneda.format(d.invertido)} · vendido ${moneda.format(d.vendido)} (${d.piezasVendidas}) · ganancia ${moneda.format(d.ganancia)}`, 'datos')
    );
    const quitar = el('button', 'Quitar', 'peligro');
    quitar.type = 'button';
    quitar.title = 'Sacar del paquete (la planta se conserva en el inventario)';
    quitar.addEventListener('click', () => cambiarMembresia(d.planta.id, (ids) => ids.filter((x) => x !== pq.id)));
    art.append(cuerpo, quitar);
    return art;
  });
  $('#paq-plantas').replaceChildren(...(filas.length ? filas : [el('p', 'Este paquete está vacío: agrega plantas existentes o crea una nueva.', 'estado')]));

  const repetidos = nombresRepetidos(plantas);
  const disponibles = plantas.filter((p) => !p.archivada && !p.paquetes?.includes(pq.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('#paq-existente').replaceChildren(...(disponibles.length ? disponibles.map((p) => new Option(`${p.nombre}${repetidos.has(normalizar(p.nombre)) ? ` · ${moneda.format(p.precio)}${p.lote ? ` · lote ${p.lote}` : ''}` : ''} (${p.existencias})`, String(p.id))) : [new Option('No hay más plantas para agregar', '')]));
  $('#paq-agregar').disabled = !disponibles.length;

  const ids = new Set(c.detalle.map((d) => d.planta.id));
  listaPaginada($('#paq-historial'), $('#paq-mas'), (antes) => db.movimientos({ plantaIds: ids, antes }))(true).catch(() => {});
}

async function cambiarMembresia(plantaId, cambiar) {
  try { await db.actualizarPlanta(plantaId, (p) => ({ paquetes: cambiar(p.paquetes ?? []) })); } catch (e) { avisar(e.message, true); }
}

$('#paq-agregar').addEventListener('click', () => {
  const id = Number($('#paq-existente').value);
  if (id) cambiarMembresia(id, (ids) => [...new Set([...ids, abierto])]);
});
$('#paq-nueva').addEventListener('click', () => dispatchEvent(new CustomEvent('palfor:nueva-planta', { detail: { paqueteId: abierto } })));
$('#paq-editar').addEventListener('click', () => abrirFormulario(paquetes.find((x) => x.id === abierto)));
$('#paq-cerrar').addEventListener('click', () => detalleDlg.close());
detalleDlg.addEventListener('close', () => { abierto = null; });

// ---- Crear / editar paquete ----
function abrirFormulario(pq = null) {
  editando = pq;
  forma.reset();
  $('#paquete-titulo').textContent = pq ? 'Editar paquete' : 'Nuevo paquete';
  $('#paquete-error').textContent = '';
  $('#paquete-borrar').hidden = !pq;
  if (pq) { forma.elements.nombre.value = pq.nombre; forma.elements.notas.value = pq.notas ?? ''; }
  formDlg.showModal();
}

forma.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = forma.elements.nombre.value.trim();
  const error = !nombre ? 'Escribe el nombre del paquete.'
    : paquetes.some((x) => x.id !== editando?.id && normalizar(x.nombre) === normalizar(nombre)) ? 'Ya existe un paquete con ese nombre.' : '';
  if (error) { $('#paquete-error').textContent = error; return; }
  try {
    const id = await db.guardarPaquete({ ...(editando ?? {}), nombre, notas: forma.elements.notas.value.trim() });
    formDlg.close();
    if (!editando) await abrirDetalle(id); // un paquete nuevo se abre de una vez para meterle plantas
  } catch (err) { $('#paquete-error').textContent = err.message; }
});
$('#paquete-borrar').addEventListener('click', async () => {
  if (!confirm(`¿Borrar el paquete "${editando.nombre}"? Sus plantas NO se borran: solo dejan de pertenecer al paquete.`)) return;
  try { await db.borrarPaquete(editando.id); formDlg.close(); detalleDlg.close(); avisar('Paquete borrado.'); } catch (err) { $('#paquete-error').textContent = err.message; }
});
$('#paquete-cancelar').addEventListener('click', () => formDlg.close());
$('#nuevo-paquete').addEventListener('click', () => abrirFormulario());
perezosa('paquetes', cargar, (e) => avisar(e.message, true));
