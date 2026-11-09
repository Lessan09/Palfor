// Guarda la app en el dispositivo para abrirla sin conexión. Al cambiar cualquier archivo, sube la versión.
const VERSION = 'palfor-11';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'main.js', 'db.js', 'inventario.js', 'pedidos.js', 'respaldo.js', 'paquetes.js', 'estadisticas.js', 'historial.js', 'categorias.js', 'logica.js', 'ui.js', 'tema.js', 'clima.js', 'calculadora.js', 'calc-logica.js',
  'manifest.webmanifest', 'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/icono-maskable-512.png', 'iconos/logo-orquidea.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  // Solo archivos propios; el clima (otro origen) lo maneja clima.js con su propia copia.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? fetch(e.request)));
});
