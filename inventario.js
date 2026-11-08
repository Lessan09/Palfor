import * as db from './db.js';

const $ = (s) => document.querySelector(s);
const POCAS = 5;
const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const lista = $('#lista'), estado = $('#estado'), dialogo = $('#formulario'), forma = $('#planta');
const zona = $('#zona-foto'), entradaFoto = $('#foto'), previa = $('#foto-previa'), textoFoto = $('#foto-texto');
let plantas = [], urls = [], editando = null, fotoNueva; // fotoNueva: undefined = sin cambio, null = quitar, Blob = nueva

const el = (tag, texto = '', clase = '') => Object.assign(document.createElement(tag), { textContent: texto, className: clase });
const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nivel = (n) => (n <= 0 ? 'agotada' : n <= POCAS ? 'pocas' : 'bien');
const avisar = (texto, error = false) => { estado.textContent = texto; estado.classList.toggle('error', error); };

async function cargar() {
  plantas = await db.todas();
  dibujar();
}

function dibujar() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const termino = normalizar($('#buscar').value.trim()).split(/\s+/).filter(Boolean);
  const visibles = plantas
    .filter((p) => { const t = normalizar([p.nombre, p.cientifico, p.categoria, p.lote, p.ubicacion].join(' ')); return termino.every((w) => t.includes(w)); })
    .sort((a, b) => a.existencias - b.existencias || a.nombre.localeCompare(b.nombre, 'es')); // lo urgente primero

  const agotadas = plantas.filter((p) => p.existencias <= 0);
  const aviso = $('#aviso-agotadas');
  aviso.hidden = !agotadas.length;
  aviso.textContent = `Agotadas: ${agotadas.map((p) => p.nombre).join(', ')}`;

  const pocas = plantas.filter((p) => p.existencias > 0 && p.existencias <= POCAS).length;
  const costo = plantas.reduce((s, p) => s + p.existencias * p.costo, 0);
  const venta = plantas.reduce((s, p) => s + p.existencias * p.precio, 0);
  const dinero = (n) => moneda.format(n);
  const estadisticas = plantas.length ? [
    [visibles.length === plantas.length ? plantas.length : `${visibles.length}/${plantas.length}`, 'Plantas'], [agotadas.length, 'Agotadas'], [pocas, 'Con pocas'],
    [dinero(costo), 'Inventario a costo'], [dinero(venta), 'Inventario a precio']] : [];
  $('#resumen').replaceChildren(...estadisticas.map(([valor, texto]) => {
    const caja = el('div', '', 'estadistica');
    caja.append(el('strong', String(valor)), el('span', texto));
    return caja;
  }));

  if (!visibles.length) {
    lista.replaceChildren(el('p', plantas.length ? 'Ninguna planta coincide con la búsqueda.' : 'Todavía no hay plantas. Toca “+ Planta” o restaura un respaldo.', 'estado'));
    return;
  }
  const campo = $('#agrupar').value;
  const grupos = new Map();
  visibles.forEach((p) => {
    const clave = campo ? (p[campo] || (campo === 'ubicacion' ? 'Sin ubicación' : 'Sin categoría')) : '';
    grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
  });
  lista.replaceChildren(...[...grupos].sort(([a], [b]) => a.localeCompare(b, 'es')).flatMap(([clave, items]) =>
    [...(clave ? [el('h3', `${clave} (${items.length})`, 'grupo')] : []), ...items.map(tarjeta)]));
}

function tarjeta(p) {
  const art = el('article', '', `tarjeta ${nivel(p.existencias)}`);
  if (p.foto) {
    const url = URL.createObjectURL(p.foto);
    urls.push(url);
    const img = el('img');
    Object.assign(img, { src: url, alt: p.nombre, loading: 'lazy' });
    art.append(img);
  } else art.append(el('div', '🌱', 'sinfoto'));

  const cuerpo = el('div');
  const titulo = el('h3', p.nombre);
  if (p.cientifico) titulo.append(el('small', p.cientifico));
  cuerpo.append(titulo, el('p', [p.categoria, p.ubicacion, p.lote, moneda.format(p.precio)].filter(Boolean).join(' · '), 'datos'));

  const fila = el('div', '', 'existencias');
  const menos = el('button', '−'), mas = el('button', '+');
  menos.type = mas.type = 'button';
  menos.setAttribute('aria-label', `Quitar una ${p.nombre}`);
  mas.setAttribute('aria-label', `Agregar una ${p.nombre}`);
  menos.disabled = p.existencias <= 0;
  menos.addEventListener('click', () => ajustar(p, -1));
  mas.addEventListener('click', () => ajustar(p, 1));
  const etiqueta = { agotada: 'AGOTADA', pocas: 'POCAS', bien: '' }[nivel(p.existencias)];
  const acciones = el('div', '', 'acciones');
  const editar = el('button', 'Editar'), borrar = el('button', 'Borrar', 'peligro');
  editar.type = borrar.type = 'button';
  editar.addEventListener('click', () => abrirFormulario(p));
  borrar.addEventListener('click', () => eliminar(p));
  acciones.append(editar, borrar);
  fila.append(menos, el('strong', String(p.existencias)), mas, el('span', etiqueta, 'datos'), acciones);
  cuerpo.append(fila);
  art.append(cuerpo);
  return art;
}

async function ajustar(p, delta) {
  try { await db.guardar({ ...p, existencias: Math.max(0, p.existencias + delta) }); } catch (e) { avisar(`No se pudo guardar: ${e.message}`, true); }
}

async function eliminar(p) {
  const apartadas = (await db.pedidos()).filter((x) => x.plantaId === p.id && x.estado === 'pendiente').length;
  const aviso = apartadas ? `\n\nOjo: tiene ${apartadas} pedido(s) pendiente(s); al borrarla no podrás devolver su stock.` : '';
  if (!confirm(`¿Borrar "${p.nombre}" y sus existencias? No se puede deshacer (guarda un respaldo antes si dudas).${aviso}`)) return;
  try { await db.borrar(p.id); avisar('Planta borrada.'); } catch (e) { avisar(`No se pudo borrar: ${e.message}`, true); }
}

// ---- Formulario y foto ----
function mostrarFoto(blob) {
  if (previa.src) URL.revokeObjectURL(previa.src);
  previa.hidden = !blob;
  previa.removeAttribute('src');
  if (blob) previa.src = URL.createObjectURL(blob);
  textoFoto.textContent = blob ? 'Toca o arrastra otra foto para cambiarla' : 'Arrastra una foto aquí o toca para elegir / tomar una';
}

function abrirFormulario(p = null) {
  editando = p;
  fotoNueva = undefined;
  forma.reset();
  $('#form-titulo').textContent = p ? 'Editar planta' : 'Nueva planta';
  $('#form-error').textContent = '';
  for (const [clave, valor] of Object.entries(p ?? {})) { const campo = forma.elements.namedItem(clave); if (campo && clave !== 'foto') campo.value = valor ?? ''; }
  mostrarFoto(p?.foto ?? null);
  dialogo.showModal();
}

// Reduce la foto antes de guardarla: una de 12 MP ocuparía varios MB del dispositivo.
async function reducir(archivo) {
  if (!archivo.type.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
  const imagen = await createImageBitmap(archivo);
  const k = Math.min(1, 1024 / Math.max(imagen.width, imagen.height));
  const lienzo = Object.assign(document.createElement('canvas'), { width: Math.round(imagen.width * k), height: Math.round(imagen.height * k) });
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  return new Promise((ok, fallo) => lienzo.toBlob((b) => (b ? ok(b) : fallo(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.82));
}

async function recibirFoto(archivo) {
  if (!archivo) return;
  try { fotoNueva = await reducir(archivo); mostrarFoto(fotoNueva); $('#form-error').textContent = ''; } catch (e) { $('#form-error').textContent = e.message; }
}

zona.addEventListener('click', (e) => { if (e.target !== entradaFoto) entradaFoto.click(); });
zona.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entradaFoto.click(); } });
entradaFoto.addEventListener('change', () => { recibirFoto(entradaFoto.files[0]); entradaFoto.value = ''; });
['dragenter', 'dragover'].forEach((n) => zona.addEventListener(n, (e) => { e.preventDefault(); zona.classList.add('sobre'); }));
['dragleave', 'drop'].forEach((n) => zona.addEventListener(n, () => zona.classList.remove('sobre')));
zona.addEventListener('drop', (e) => { e.preventDefault(); recibirFoto(e.dataTransfer.files[0]); });

forma.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(forma);
  const numero = (c) => Number(f.get(c));
  const planta = {
    nombre: f.get('nombre').trim(), cientifico: f.get('cientifico').trim(), categoria: f.get('categoria'),
    precio: numero('precio'), costo: numero('costo'), existencias: Math.trunc(numero('existencias')),
    lote: f.get('lote').trim(), ubicacion: f.get('ubicacion').trim(), notas: f.get('notas').trim(),
    foto: fotoNueva === undefined ? editando?.foto ?? null : fotoNueva
  };
  if (editando) planta.id = editando.id; // sin id, IndexedDB asigna uno nuevo
  const error = !planta.nombre ? 'Escribe el nombre.'
    : [planta.precio, planta.costo, planta.existencias].some((n) => !Number.isFinite(n) || n < 0) ? 'Precio, costo y existencias deben ser cero o más.'
    : planta.lote && plantas.some((p) => p.id !== planta.id && normalizar(p.lote) === normalizar(planta.lote)) ? 'Ya existe una planta con ese código de lote.' : '';
  if (error) { $('#form-error').textContent = error; return; }
  try { await db.guardar(planta); dialogo.close(); avisar('Planta guardada.'); } catch (err) { $('#form-error').textContent = `No se pudo guardar: ${err.message}`; }
});
$('#cancelar').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('close', () => { if (previa.src) URL.revokeObjectURL(previa.src); });

$('#nueva').addEventListener('click', () => abrirFormulario());
$('#buscar').addEventListener('input', dibujar);
$('#agrupar').addEventListener('change', dibujar);
addEventListener('palfor:cambio', () => cargar().catch((e) => avisar(e.message, true)));
cargar().catch((e) => avisar(`No se pudo abrir los datos de este dispositivo: ${e.message}`, true));
