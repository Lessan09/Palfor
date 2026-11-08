// Datos en IndexedDB del propio dispositivo. Las fotos se guardan como Blob dentro de cada planta.
const STORE = 'plantas';
let abierta;

function abrir() {
  abierta ??= new Promise((ok, fallo) => {
    const peticion = indexedDB.open('palfor', 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => fallo(peticion.error);
  });
  return abierta;
}

async function transaccion(modo, trabajo) {
  const db = await abrir();
  return new Promise((ok, fallo) => {
    const t = db.transaction(STORE, modo);
    const resultado = trabajo(t.objectStore(STORE));
    t.oncomplete = () => ok(resultado?.result);
    t.onerror = t.onabort = () => fallo(t.error);
  });
}

export const todas = () => transaccion('readonly', (s) => s.getAll());
export const guardar = (planta) => transaccion('readwrite', (s) => s.put(planta));
export const borrar = (id) => transaccion('readwrite', (s) => s.delete(id));

// Respaldo: las fotos viajan como data URL dentro de un JSON.
const aDataUrl = (blob) => new Promise((ok, fallo) => {
  const lector = new FileReader();
  lector.onload = () => ok(lector.result);
  lector.onerror = () => fallo(lector.error);
  lector.readAsDataURL(blob);
});

export async function exportar() {
  const plantas = await Promise.all((await todas()).map(async (p) => ({ ...p, foto: p.foto ? await aDataUrl(p.foto) : null })));
  return JSON.stringify({ app: 'palfor', version: 1, plantas });
}

export async function importar(texto) {
  const datos = JSON.parse(texto);
  if (datos?.app !== 'palfor' || !Array.isArray(datos.plantas)) throw new Error('El archivo no es un respaldo de Palfor.');
  const plantas = await Promise.all(datos.plantas.map(async (p) => ({
    ...p, foto: typeof p.foto === 'string' && p.foto.startsWith('data:image/') ? await (await fetch(p.foto)).blob() : null
  })));
  // Reemplaza todo en una sola transacción: o entra el respaldo completo o no cambia nada.
  await transaccion('readwrite', (s) => { s.clear(); plantas.forEach((p) => s.put(p)); });
  return plantas.length;
}
