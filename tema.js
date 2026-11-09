// Tema de color: se guarda en este dispositivo. El index.html lo aplica antes de pintar (sin parpadeo); aquí se elige y se recuerda.
import { $, el } from './ui.js';

const CLAVE = 'palfor-tema';
// [id, nombre, descripción, muestras: fondo · superficie · acento]
const TEMAS = [
  ['auto', 'Automático', 'Sigue al teléfono', ['#f4f3ec', '#121a15', '#668957']],
  ['claro', 'Bosque', 'Claro y verde', ['#f4f3ec', '#fbfaf5', '#668957']],
  ['oceano', 'Océano', 'Claro y azul', ['#eef3f6', '#f7fafc', '#3b82a6']],
  ['atardecer', 'Atardecer', 'Claro y cálido', ['#f7efe8', '#fdf8f3', '#d9693f']],
  ['oscuro', 'Oscuro', 'Verde suave', ['#121a15', '#1a241d', '#7fb069']],
  ['tron', 'Tron', 'Neón cian', ['#02070b', '#06121a', '#00e5ff']],
  ['synthwave', 'Synthwave', 'Neón magenta', ['#0b0220', '#150636', '#ff2bd6']]
];
const oscuro = matchMedia('(prefers-color-scheme: dark)');
const guardado = () => { try { return localStorage.getItem(CLAVE) || 'claro'; } catch { return 'claro'; } };

function aplicar(id) {
  document.documentElement.dataset.tema = id === 'auto' ? (oscuro.matches ? 'oscuro' : 'claro') : id;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--page').trim();
  if (color) document.querySelector('meta[name=theme-color]')?.setAttribute('content', color); // barra del navegador en el teléfono
}

function dibujar() {
  const actual = guardado();
  $('#temas').replaceChildren(...TEMAS.map(([id, nombre, nota, colores]) => {
    const b = el('button', '', 'tema');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(id === actual));
    const muestras = el('span', '', 'muestras');
    colores.forEach((c) => { const i = el('i'); i.style.background = c; muestras.append(i); });
    b.append(muestras, el('strong', nombre), el('span', nota));
    b.addEventListener('click', () => {
      try { localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento: el tema dura hasta cerrar la app */ }
      aplicar(id);
      dibujar();
    });
    return b;
  }));
}

oscuro.addEventListener('change', () => { if (guardado() === 'auto') aplicar('auto'); });
aplicar(guardado());
dibujar();
