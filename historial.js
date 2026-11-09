import * as db from './db.js';
import { $, listaPaginada, perezosa } from './ui.js';

const sel = $('#historial-paquete');
let plantas = [], reiniciar;

// Con un paquete elegido, solo se ven los movimientos de las plantas que tiene dentro.
const idsPlantas = () => {
  const id = Number(sel.value);
  return id ? new Set(plantas.filter((p) => p.paquetes?.includes(id)).map((p) => p.id)) : undefined;
};

async function cargar() {
  const [paq, pl] = await Promise.all([db.paquetes(), db.todas()]);
  plantas = pl;
  const actual = sel.value;
  sel.replaceChildren(new Option('Todos', ''), ...[...paq].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((p) => new Option(p.nombre, String(p.id))));
  sel.value = [...sel.options].some((o) => o.value === actual) ? actual : '';
  reiniciar = listaPaginada($('#historial-lista'), $('#historial-mas'), (antes) => db.movimientos({ plantaIds: idsPlantas(), antes }));
  await reiniciar();
}

sel.addEventListener('change', () => reiniciar?.().catch(() => {}));
perezosa('historial', cargar);
