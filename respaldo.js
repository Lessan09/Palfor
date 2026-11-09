import * as db from './db.js';

const $ = (s) => document.querySelector(s);
const ULTIMO = 'palfor-ultimo-respaldo', SIN_RESPALDO = 'palfor-sin-respaldo', DIA = 864e5;
const estado = $('#respaldo-estado'), aviso = $('#aviso-respaldo');
const avisar = (texto, error = false) => { estado.textContent = texto; estado.classList.toggle('error', error); };
const puedeCompartir = !!navigator.canShare?.({ files: [new File([''], 'a.json', { type: 'application/json' })] });

const archivo = async (prefijo) => new File([await db.exportar()], `${prefijo}-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
function descargar(f) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(f), download: f.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// El aviso aparece si nunca se ha respaldado, o si hay cambios sin respaldar desde hace más de un día.
async function revisar(error = '') {
  const [plantas, pedidos] = await Promise.all([db.todas(), db.pedidos()]);
  const pendiente = Number(localStorage.getItem(SIN_RESPALDO)) || 0;
  const nunca = !localStorage.getItem(ULTIMO);
  const texto = error || (!(plantas.length + pedidos.length) ? ''
    : nunca ? 'Todavía no has guardado ningún respaldo. Si se borran los datos del navegador, se pierde todo.'
    : pendiente && Date.now() - pendiente > DIA ? `Tienes cambios sin respaldar desde hace ${Math.floor((Date.now() - pendiente) / DIA)} día(s).` : '');
  aviso.hidden = !texto;
  aviso.querySelector('span').textContent = texto;
}

async function respaldar(compartir) {
  try {
    const f = await archivo('palfor-respaldo');
    if (compartir) {
      try { await navigator.share({ files: [f], title: 'Respaldo Palfor' }); } catch (e) { if (e.name === 'AbortError') return; throw e; }
    } else descargar(f);
    localStorage.setItem(ULTIMO, String(Date.now()));
    localStorage.removeItem(SIN_RESPALDO);
    avisar(compartir ? 'Respaldo enviado.' : 'Respaldo guardado en tus descargas.');
    revisar();
  } catch (e) {
    avisar(`No se pudo crear el respaldo: ${e.message}`, true);
    revisar(`No se pudo crear el respaldo: ${e.message}`);
  }
}

$('#exportar').addEventListener('click', () => respaldar(false));
$('#compartir').hidden = !puedeCompartir;
$('#compartir').addEventListener('click', () => respaldar(true));
$('#aviso-guardar').addEventListener('click', () => respaldar(puedeCompartir));

$('#importar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || !confirm('Restaurar reemplaza TODO lo que hay en este dispositivo (plantas, pedidos, paquetes e historial) por el respaldo. Antes se descargará una copia de lo actual. ¿Continuar?')) return;
  try {
    const datos = await db.leer(await f.text()); // si el archivo está mal, falla aquí sin tocar nada
    if ((await db.todas()).length + (await db.pedidos()).length) descargar(await archivo('palfor-antes-de-restaurar'));
    await db.reemplazar(datos);
    avisar(`Respaldo restaurado: ${datos.plantas.length} plantas, ${datos.pedidos.length} pedidos y ${datos.paquetes.length} paquetes.`);
  } catch (err) { avisar(`No se pudo restaurar: ${err.message}`, true); }
});

// Marca desde cuándo hay cambios sin respaldar.
addEventListener('palfor:cambio', () => {
  if (!localStorage.getItem(SIN_RESPALDO)) localStorage.setItem(SIN_RESPALDO, String(Date.now()));
  revisar();
});

navigator.storage?.persist?.().then((si) => {
  $('#proteccion').textContent = si ? 'Almacenamiento protegido: el navegador no borrará estos datos por falta de espacio.'
    : 'El navegador podría borrar estos datos si se llena el teléfono: guarda respaldos seguido.';
});
revisar();
