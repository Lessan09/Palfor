import * as db from './db.js';
import { $, el, perezosa } from './ui.js';

const lista = $('#categorias-lista'), estado = $('#categorias-estado'), campo = $('#categoria-nombre');
const avisar = (texto, error = false) => { estado.textContent = texto; estado.classList.toggle('error', error); };

async function cargar() {
  const [categorias, plantas] = await Promise.all([db.categorias(), db.todas()]);
  lista.replaceChildren(...[...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => {
    const usos = plantas.filter((p) => p.categoria === c.clave).length;
    const art = el('article', '', 'planta-paq');
    const cuerpo = el('div');
    cuerpo.append(el('h4', c.nombre), el('p', `${usos} planta(s)`, 'datos'));
    const acciones = el('div', '', 'acciones');
    const boton = (texto, accion, clase = '') => { const b = el('button', texto, clase); b.type = 'button'; b.addEventListener('click', accion); return b; };
    const borrar = boton('Borrar', () => intentar(() => db.borrarCategoria(c.clave), 'Categoría borrada.'), 'peligro');
    borrar.disabled = usos > 0;
    borrar.title = usos ? 'Tiene plantas: cámbiales la categoría primero.' : '';
    acciones.append(boton('Renombrar', () => {
      const nombre = prompt('Nuevo nombre de la categoría:', c.nombre)?.trim();
      if (nombre && nombre !== c.nombre) intentar(() => db.renombrarCategoria(c.clave, nombre), 'Categoría renombrada.');
    }), borrar);
    art.append(cuerpo, acciones);
    return art;
  }));
}

async function intentar(accion, mensaje) {
  try { await accion(); avisar(mensaje); } catch (e) { avisar(e.message, true); }
}

$('#nueva-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = campo.value.trim();
  if (!nombre) { avisar('Escribe el nombre de la categoría.', true); return; }
  await intentar(() => db.agregarCategoria(nombre), 'Categoría agregada.');
  if (!estado.classList.contains('error')) campo.value = '';
});
perezosa('categorias', cargar, (e) => avisar(e.message, true));
