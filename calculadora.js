import { inicial, teclear } from './calc-logica.js';

const TECLAS = ['C', '←', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '±', '0', '.', '='];
const pantalla = document.querySelector('#calc-pantalla');
const operacion = document.querySelector('#calc-operacion');
let estado = inicial();

function dibujar() {
  pantalla.textContent = estado.pantalla;
  operacion.textContent = estado.op ? `${estado.acumulado} ${estado.op}` : '';
}

document.querySelector('#calc-teclas').replaceChildren(...TECLAS.map((t) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = t;
  b.setAttribute('aria-label', { '÷': 'dividir', '×': 'multiplicar', '-': 'restar', '+': 'sumar', '=': 'igual', 'C': 'borrar todo', '←': 'borrar un dígito', '±': 'cambiar signo', '%': 'porcentaje' }[t] || t);
  if ('÷×-+'.includes(t)) b.className = 'op';
  if (t === '=') b.className = 'igual';
  b.addEventListener('click', () => { estado = teclear(estado, t); dibujar(); });
  return b;
}));

// Teclado físico en computadora o tablet con teclado.
document.addEventListener('keydown', (e) => {
  if (document.querySelector('#calculadora').hidden || e.target.closest('input, textarea, select')) return;
  const mapa = { '*': '×', '/': '÷', Enter: '=', Backspace: '←', Escape: 'C', ',': '.' };
  const t = mapa[e.key] ?? e.key;
  if (TECLAS.includes(t)) { e.preventDefault(); estado = teclear(estado, t); dibujar(); }
});
