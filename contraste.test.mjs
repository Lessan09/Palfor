// node app/contraste.test.mjs — verifica que cada tema tenga texto legible (contraste WCAG AA ≥ 4.5) en los pares que usa la app.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./estilos.css', import.meta.url), 'utf8');
const variables = (selector) => {
  const i = css.indexOf(selector + ' {');
  return i < 0 ? {} : Object.fromEntries([...css.slice(i, css.indexOf('}', i)).matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
};
const base = variables(':root');
const temas = { bosque: {}, ...Object.fromEntries(['oceano', 'atardecer', 'oscuro', 'tron', 'synthwave'].map((t) => [t, variables(`:root[data-tema=${t}]`)])) };

const luz = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const solido = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v ?? '');

const PARES = [['ink', 'surface'], ['ink', 'page'], ['ink', 'campo'], ['ink', 'pocas-bg'], ['ink', 'agotada-bg'], ['muted', 'surface'], ['muted', 'page'], ['muted', 'campo'],
  ['muted', 'pocas-bg'], ['muted', 'agotada-bg'], ['on-acento', 'green'], ['green-dark', 'surface'], ['green-dark', 'realce'], ['green-dark', 'suave'], ['green', 'surface'],
  ['rojo', 'surface'], ['rojo', 'campo'], ['aviso-ink', 'aviso-bg'], ['ambar-fuerte', 'pocas-bg'], ['rojo-fuerte', 'agotada-bg']];
const MINIMO = 4.5;
const fallos = [];
let revisados = 0;
for (const [tema, ov] of Object.entries(temas)) {
  const v = { ...base, ...ov };
  const pares = tema === 'synthwave' ? [...PARES, ['on-acento', '#7a5cff']] : PARES; // el botón de Synthwave es un degradado magenta → violeta
  for (const [fg, bg] of pares) {
    const a = fg.startsWith('#') ? fg : v[fg], b = bg.startsWith('#') ? bg : v[bg];
    if (!solido(a) || !solido(b)) { fallos.push(`${tema}: falta o no es color sólido ${fg}/${bg}`); continue; }
    revisados++;
    const r = contraste(a, b);
    if (r < MINIMO) fallos.push(`${tema}: ${fg} ${a} sobre ${bg} ${b} = ${r.toFixed(2)}`);
  }
}
if (fallos.length) { console.error(`contraste: ${fallos.length} problema(s)\n  ` + fallos.join('\n  ')); process.exit(1); }
console.log(`contraste: ${revisados} pares revisados en ${Object.keys(temas).length} temas, todos ≥ ${MINIMO}`);
