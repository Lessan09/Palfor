import './inventario.js';
import './pedidos.js';
import './respaldo.js';
import './clima.js';
import './calculadora.js';

const $ = (s) => document.querySelector(s);
const vistas = [...document.querySelectorAll('.vista')];
const botones = [...document.querySelectorAll('.pestanas button')];
botones.forEach((b) => b.addEventListener('click', () => {
  vistas.forEach((v) => { v.hidden = v.id !== b.dataset.vista; });
  botones.forEach((o) => (o === b ? o.setAttribute('aria-current', 'page') : o.removeAttribute('aria-current')));
}));

const conexion = document.querySelector('#conexion');
const mostrarConexion = () => { conexion.textContent = navigator.onLine ? 'En línea' : 'Sin conexión'; conexion.classList.toggle('sin', !navigator.onLine); };
addEventListener('online', mostrarConexion);
addEventListener('offline', mostrarConexion);
mostrarConexion();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Botón de instalar: usa el aviso nativo si el navegador lo ofrece; si no, explica cómo hacerlo a mano.
const instalar = $('#instalar');
let oferta;
if (!matchMedia('(display-mode: standalone)').matches && !navigator.standalone) instalar.hidden = false;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); oferta = e; });
addEventListener('appinstalled', () => { instalar.hidden = true; });
instalar.addEventListener('click', async () => {
  if (oferta) { oferta.prompt(); await oferta.userChoice; oferta = null; return; }
  alert('Tu navegador no ofrece instalar con un botón. Abre el menú ⋮ (o Compartir en iPhone) y elige "Instalar aplicación" o "Añadir a pantalla de inicio". Usa Chrome o Safari.');
});
