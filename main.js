import './inventario.js';
import './clima.js';
import './calculadora.js';

const vistas = [...document.querySelectorAll('.vista')];
const botones = [...document.querySelectorAll('.pestanas button')];
botones.forEach((b) => b.addEventListener('click', () => {
  vistas.forEach((v) => { v.hidden = v.id !== b.dataset.vista; });
  botones.forEach((o) => (o === b ? o.setAttribute('aria-current', 'page') : o.removeAttribute('aria-current')));
}));

const conexion = document.querySelector('#conexion');
const mostrarConexion = () => { conexion.textContent = navigator.onLine ? 'En línea' : 'Sin conexión'; };
addEventListener('online', mostrarConexion);
addEventListener('offline', mostrarConexion);
mostrarConexion();

navigator.storage?.persist?.(); // pide que el navegador no borre los datos si falta espacio
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
