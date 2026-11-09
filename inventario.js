import * as db from './db.js';
import { $, el, moneda, normalizar, perezosa } from './ui.js';
import { nivel } from './logica.js';

const lista = $('#lista'), estado = $('#estado'), dialogo = $('#formulario'), forma = $('#planta');
const zona = $('#zona-foto'), entradaFoto = $('#foto'), previa = $('#foto-previa'), textoFoto = $('#foto-texto');
let plantas = [], paquetes = [], categorias = [], urls = [], editando = null, fotoNueva; // fotoNueva: undefined = sin cambio, null = quitar, Blob = nueva
let categoriaActiva = '';

const avisar = (texto, error = false) => { estado.textContent = texto; estado.classList.toggle('error', error); };
const nombreCategoria = (clave) => categorias.find((c) => c.clave === clave)?.nombre ?? clave;
const nombresPaquetes = (p) => (p.paquetes ?? []).map((id) => paquetes.find((x) => x.id === id)?.nombre).filter(Boolean);

async function cargar() {
  [plantas, paquetes, categorias] = await Promise.all([db.todas(), db.paquetes(), db.categorias()]);
  llenarFiltros();
  dibujar();
}

// Opciones que dependen de los datos: filtro de paquete y fila de categorías (se conserva lo elegido).
function llenarFiltros() {
  const sel = $('#filtro-paquete'), actual = sel.value;
  sel.replaceChildren(new Option('Todos', ''), ...[...paquetes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((p) => new Option(p.nombre, String(p.id))));
  sel.value = [...sel.options].some((o) => o.value === actual) ? actual : '';
  if (categoriaActiva && !categorias.some((c) => c.clave === categoriaActiva)) categoriaActiva = '';
  const activas = plantas.filter((p) => !p.archivada);
  const chip = (clave, texto, n) => {
    const b = el('button', `${texto} · ${n}`, 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(clave === categoriaActiva));
    b.addEventListener('click', () => { categoriaActiva = clave; llenarFiltros(); dibujar(); });
    return b;
  };
  $('#chips').replaceChildren(chip('', 'Todas', activas.length), ...[...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => chip(c.clave, c.nombre, activas.filter((p) => p.categoria === c.clave).length)));
}

function dibujar() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const verArchivadas = $('#mostrar').value === 'archivadas', paquete = Number($('#filtro-paquete').value) || null;
  const termino = normalizar($('#buscar').value.trim()).split(/\s+/).filter(Boolean);
  const visibles = plantas
    .filter((p) => !!p.archivada === verArchivadas)
    .filter((p) => !categoriaActiva || p.categoria === categoriaActiva)
    .filter((p) => !paquete || p.paquetes?.includes(paquete))
    .filter((p) => { const t = normalizar([p.nombre, p.cientifico, nombreCategoria(p.categoria), p.lote, p.ubicacion, ...nombresPaquetes(p)].join(' ')); return termino.every((w) => t.includes(w)); })
    .sort((a, b) => a.existencias - b.existencias || a.nombre.localeCompare(b.nombre, 'es')); // lo urgente primero

  const agotadas = plantas.filter((p) => !p.archivada && p.existencias <= 0);
  const aviso = $('#aviso-agotadas');
  aviso.hidden = !agotadas.length;
  aviso.textContent = `Agotadas: ${agotadas.map((p) => p.nombre).join(', ')}`;

  if (!visibles.length) {
    lista.replaceChildren(el('p', verArchivadas ? 'No hay plantas archivadas.' : plantas.some((p) => !p.archivada) ? 'Ninguna planta coincide con los filtros.' : 'Todavía no hay plantas. Toca “+ Agregar planta” o restaura un respaldo.', 'estado'));
    return;
  }
  const campo = $('#agrupar').value;
  const grupos = new Map();
  visibles.forEach((p) => {
    const clave = campo === 'categoria' ? nombreCategoria(p.categoria) || 'Sin categoría' : campo ? p[campo] || 'Sin ubicación' : '';
    grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
  });
  lista.replaceChildren(...[...grupos].sort(([a], [b]) => a.localeCompare(b, 'es')).flatMap(([clave, items]) =>
    [...(clave ? [el('h3', `${clave} (${items.length})`, 'grupo')] : []), ...items.map(tarjeta)]));
}

function tarjeta(p) {
  const art = el('article', '', `tarjeta ${nivel(p.existencias)}${p.archivada ? ' archivada' : ''}`);
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
  cuerpo.append(titulo, el('p', [nombreCategoria(p.categoria), p.ubicacion, p.lote, moneda.format(p.precio)].filter(Boolean).join(' · '), 'datos'));
  const etiquetas = nombresPaquetes(p);
  if (etiquetas.length) {
    const fila = el('p', '', 'etiquetas');
    etiquetas.forEach((n) => fila.append(el('span', `📦 ${n}`, 'etiqueta')));
    cuerpo.append(fila);
  }

  const fila = el('div', '', 'existencias');
  const acciones = el('div', '', 'acciones');
  const boton = (texto, accion, clase = '') => { const b = el('button', texto, clase); b.type = 'button'; b.addEventListener('click', accion); return b; };
  if (p.archivada) {
    fila.append(el('strong', String(p.existencias)));
    acciones.append(boton('Restaurar', () => archivar(p, false)));
  } else {
    const menos = boton('−', () => ajustar(p, -1)), mas = boton('+', () => ajustar(p, 1));
    menos.setAttribute('aria-label', `Quitar una ${p.nombre}`);
    mas.setAttribute('aria-label', `Agregar una ${p.nombre}`);
    menos.disabled = p.existencias <= 0;
    fila.append(menos, el('strong', String(p.existencias)), mas, el('span', { agotada: 'AGOTADA', pocas: 'POCAS', bien: '' }[nivel(p.existencias)], 'datos'));
    acciones.append(boton('Editar', () => abrirFormulario(p)), boton('Archivar', () => archivar(p, true), 'peligro'));
  }
  fila.append(acciones);
  cuerpo.append(fila);
  art.append(cuerpo);
  return art;
}

async function ajustar(p, delta) {
  try { await db.ajustarStock(p.id, delta); } catch (e) { avisar(`No se pudo guardar: ${e.message}`, true); }
}

// Archivar en vez de borrar: la planta sale del inventario, los totales y los pedidos nuevos, pero sus ventas e historial se conservan.
async function archivar(p, si) {
  if (si) {
    const pendientes = (await db.pedidos()).filter((x) => x.estado === 'pendiente' && x.lineas.some((l) => l.plantaId === p.id)).length;
    const aviso = pendientes ? `\n\nTiene ${pendientes} pedido(s) pendiente(s); seguirán funcionando.` : '';
    if (!confirm(`¿Archivar "${p.nombre}"? Dejará de aparecer en el inventario y en los totales, pero se conservan sus ventas y su historial. Podrás restaurarla en “Mostrar: Archivadas”.${aviso}`)) return;
  }
  try { await db.actualizarPlanta(p.id, () => ({ archivada: si })); avisar(si ? 'Planta archivada.' : 'Planta restaurada.'); } catch (e) { avisar(`No se pudo guardar: ${e.message}`, true); }
}

// ---- Formulario y foto ----
function mostrarFoto(blob) {
  if (previa.src) URL.revokeObjectURL(previa.src);
  previa.hidden = !blob;
  previa.removeAttribute('src');
  if (blob) previa.src = URL.createObjectURL(blob);
  textoFoto.textContent = blob ? 'Toca o arrastra otra foto para cambiarla' : 'Arrastra una foto aquí o toca para elegir / tomar una';
}

// `paqueteId`: al crear una planta desde un paquete, ya nace dentro de él.
async function abrirFormulario(p = null, paqueteId = null) {
  [paquetes, categorias] = await Promise.all([db.paquetes(), db.categorias()]);
  editando = p;
  fotoNueva = undefined;
  forma.reset();
  $('#form-titulo').textContent = p ? 'Editar planta' : 'Nueva planta';
  $('#form-error').textContent = '';
  const opciones = categorias.map((c) => new Option(c.nombre, c.clave));
  if (p?.categoria && !categorias.some((c) => c.clave === p.categoria)) opciones.push(new Option(p.categoria, p.categoria));
  $('#form-categoria').replaceChildren(...opciones);
  for (const [clave, valor] of Object.entries(p ?? {})) { const campo = forma.elements.namedItem(clave); if (campo && clave !== 'foto') campo.value = valor ?? ''; }
  const marcados = new Set(p?.paquetes ?? (paqueteId ? [paqueteId] : []));
  $('#form-paquetes').replaceChildren(...(paquetes.length ? paquetes.map((x) => {
    const etiqueta = el('label', '', 'casilla'), caja = Object.assign(document.createElement('input'), { type: 'checkbox', value: x.id, checked: marcados.has(x.id) });
    etiqueta.append(caja, document.createTextNode(` ${x.nombre}`));
    return etiqueta;
  }) : [el('p', 'Aún no hay paquetes; créalos en la pestaña Paquetes.', 'nota')]));
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
    ...(editando ?? {}), // lo que el formulario no muestra (archivada, etc.) se conserva
    nombre: f.get('nombre').trim(), cientifico: f.get('cientifico').trim(), categoria: f.get('categoria'),
    precio: numero('precio'), costo: numero('costo'), existencias: Math.trunc(numero('existencias')),
    lote: f.get('lote').trim(), ubicacion: f.get('ubicacion').trim(), notas: f.get('notas').trim(),
    paquetes: [...$('#form-paquetes').querySelectorAll('input:checked')].map((c) => Number(c.value)),
    foto: fotoNueva === undefined ? editando?.foto ?? null : fotoNueva
  };
  const otras = await db.todas();
  const error = !planta.nombre ? 'Escribe el nombre.'
    : [planta.precio, planta.costo, planta.existencias].some((n) => !Number.isFinite(n) || n < 0) ? 'Precio, costo y existencias deben ser cero o más.'
    : planta.lote && otras.some((p) => p.id !== planta.id && normalizar(p.lote) === normalizar(planta.lote)) ? 'Ya existe una planta con ese código de lote.' : '';
  if (error) { $('#form-error').textContent = error; return; }
  try { await db.guardarPlanta(planta); dialogo.close(); avisar('Planta guardada.'); } catch (err) { $('#form-error').textContent = `No se pudo guardar: ${err.message}`; }
});
$('#cancelar').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('close', () => { if (previa.src) URL.revokeObjectURL(previa.src); });

$('#nueva').addEventListener('click', () => abrirFormulario());
addEventListener('palfor:nueva-planta', (e) => abrirFormulario(null, e.detail?.paqueteId));
for (const id of ['#agrupar', '#mostrar', '#filtro-paquete']) $(id).addEventListener('change', dibujar);
$('#buscar').addEventListener('input', dibujar);
perezosa('inventario', cargar, (e) => avisar(`No se pudo abrir los datos de este dispositivo: ${e.message}`, true));
