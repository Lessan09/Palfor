import './inventario.js';
import './paquetes.js';
import './pedidos.js';
import './estadisticas.js';
import './historial.js';
import './categorias.js';
import './respaldo.js';
import './clima.js';
import './calculadora.js';
import './tema.js';

const $ = (s) => document.querySelector(s);
const vistas = [...document.querySelectorAll('.vista')];
const fijos = [...document.querySelectorAll('.pestanas button[data-vista]')];
const menu = $('#menu'), botonMenu = $('#abrir-menu');
const delMenu = new Set([...menu.querySelectorAll('[data-vista]')].map((b) => b.dataset.vista));

// Barra de abajo = lo de todos los días; el menú ☰ guarda el resto. La pestaña ☰ se marca cuando se está en una vista del menú.
function mostrar(id, apilar = true) {
  vistas.forEach((v) => { v.hidden = v.id !== id; });
  fijos.forEach((b) => (b.dataset.vista === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (delMenu.has(id)) botonMenu.setAttribute('aria-current', 'page'); else botonMenu.removeAttribute('aria-current');
  scrollTo(0, 0);
  if (apilar && history.state?.vista !== id) history.pushState({ vista: id }, ''); // así el botón Atrás vuelve a la pantalla anterior
  dispatchEvent(new Event('palfor:vista')); // cada vista se carga solo cuando se muestra
}
history.replaceState({ vista: 'inventario' }, '');
addEventListener('popstate', (e) => mostrar(e.state?.vista ?? 'inventario', false));
addEventListener('palfor:bloqueada', () => { $('#aviso-bloqueo').hidden = false; });
addEventListener('palfor:desbloqueada', () => { $('#aviso-bloqueo').hidden = true; });
document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { menu.close(); mostrar(b.dataset.vista); }));
botonMenu.addEventListener('click', () => menu.showModal());
$('#menu-cerrar').addEventListener('click', () => menu.close());
menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });

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
