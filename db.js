// Datos en IndexedDB del propio dispositivo. Las fotos se guardan como Blob dentro de cada planta.
const PLANTAS = 'plantas', PEDIDOS = 'pedidos';
let abierta;

function abrir() {
  abierta ??= new Promise((ok, fallo) => {
    const peticion = indexedDB.open('palfor', 2);
    peticion.onupgradeneeded = () => { // de la versión 1 conserva las plantas y solo crea pedidos
      for (const n of [PLANTAS, PEDIDOS]) if (!peticion.result.objectStoreNames.contains(n)) peticion.result.createObjectStore(n, { keyPath: 'id', autoIncrement: true });
    };
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => fallo(peticion.error);
  });
  return abierta;
}

// Cada escritura exitosa avisa a la pantalla (inventario, pedidos, aviso de respaldo) para que se actualice.
const cambio = () => dispatchEvent(new Event('palfor:cambio'));

// durability 'strict': la transacción solo se da por buena cuando el disco ya confirmó la escritura.
async function transaccion(modo, tiendas, trabajo) {
  const t = (await abrir()).transaction(tiendas, modo, { durability: 'strict' });
  return new Promise((ok, fallo) => {
    const resultado = trabajo(t);
    t.oncomplete = () => { if (modo === 'readwrite') cambio(); ok(resultado?.result); };
    t.onerror = t.onabort = () => fallo(t.error);
  });
}

// Operación de varios pasos: `fallar(mensaje)` cancela TODO, así nunca queda un pedido sin su descuento de stock (ni al revés).
async function operar(trabajo) {
  const t = (await abrir()).transaction([PLANTAS, PEDIDOS], 'readwrite', { durability: 'strict' });
  return new Promise((ok, fallo) => {
    let motivo;
    const fallar = (m) => { motivo = m; t.abort(); };
    t.oncomplete = () => { cambio(); ok(); };
    t.onerror = t.onabort = () => fallo(motivo ? new Error(motivo) : t.error);
    trabajo(t.objectStore(PLANTAS), t.objectStore(PEDIDOS), fallar);
  });
}

export const todas = () => transaccion('readonly', [PLANTAS], (t) => t.objectStore(PLANTAS).getAll());
export const guardar = (planta) => transaccion('readwrite', [PLANTAS], (t) => t.objectStore(PLANTAS).put(planta));
export const borrar = (id) => transaccion('readwrite', [PLANTAS], (t) => t.objectStore(PLANTAS).delete(id));
export const pedidos = () => transaccion('readonly', [PEDIDOS], (t) => t.objectStore(PEDIDOS).getAll());

// Un pedido es { cliente, lineas: [{ plantaId, planta, cantidad }], estado, notas, fecha }. Mientras no esté cancelado, aparta stock.
// Crear, editar, cambiar de estado o borrar pasan por aquí: se compara lo apartado ANTES con lo de DESPUÉS y solo se mueve la diferencia, todo en una transacción.
const aparta = (p) => (p && p.estado !== 'cancelado' ? p.lineas : []);
const cambiarPedido = (id, despues) => operar((plantas, ped, fallar) => {
  if (despues && (!despues.lineas?.length || despues.lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1))) return fallar('Cada pedido necesita al menos una planta con cantidad entera de 1 o más.');
  const aplicar = (antes) => {
    const dif = new Map(); // plantaId → piezas que hay que descontar de más (negativo = se devuelven)
    for (const [lineas, signo] of [[aparta(antes), -1], [aparta(despues), 1]]) for (const l of lineas) dif.set(l.plantaId, (dif.get(l.plantaId) ?? 0) + signo * l.cantidad);
    for (const [plantaId, d] of dif) {
      if (!d) continue;
      plantas.get(plantaId).onsuccess = (e) => {
        const p = e.target.result;
        if (!p) return d > 0 ? fallar('Una planta del pedido ya no existe.') : undefined; // si se borró, no hay a dónde devolver
        if (d > p.existencias) return fallar(`Solo quedan ${p.existencias} disponibles de ${p.nombre}.`);
        plantas.put({ ...p, existencias: p.existencias - d });
      };
    }
    if (despues) ped.put(despues); else ped.delete(id);
  };
  if (id === undefined) return aplicar();
  ped.get(id).onsuccess = (e) => (e.target.result ? aplicar(e.target.result) : fallar('El pedido ya no existe.'));
});
export const guardarPedido = (pedido) => cambiarPedido(pedido.id, pedido);
export const borrarPedido = (id) => cambiarPedido(id, null);

// Respaldo: las fotos viajan como data URL dentro de un JSON, con una huella SHA-256 para detectar archivos dañados.
const aDataUrl = (blob) => new Promise((ok, fallo) => {
  const lector = new FileReader();
  lector.onload = () => ok(lector.result);
  lector.onerror = () => fallo(lector.error);
  lector.readAsDataURL(blob);
});
const huella = async (texto) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function exportar() {
  const contenido = {
    plantas: await Promise.all((await todas()).map(async (p) => ({ ...p, foto: p.foto ? await aDataUrl(p.foto) : null }))),
    pedidos: await pedidos()
  };
  return JSON.stringify({ app: 'palfor', version: 2, creado: new Date().toISOString(), sha256: await huella(JSON.stringify(contenido)), ...contenido });
}

// Valida TODO el archivo antes de tocar nada. Acepta respaldos antiguos (versión 1, sin pedidos).
export async function leer(texto) {
  const invalido = new Error('El archivo no es un respaldo de Palfor.');
  let datos;
  try { datos = JSON.parse(texto); } catch { throw invalido; }
  if (datos?.app !== 'palfor' || !Array.isArray(datos.plantas) || (datos.pedidos !== undefined && !Array.isArray(datos.pedidos))) throw invalido;
  if (datos.sha256 && datos.sha256 !== await huella(JSON.stringify({ plantas: datos.plantas, pedidos: datos.pedidos }))) throw new Error('El respaldo está dañado o fue modificado; no se restauró nada.');
  const ped = datos.pedidos ?? [];
  if (!datos.plantas.every((p) => typeof p?.nombre === 'string' && Number.isFinite(p.existencias)) || !ped.every((x) => typeof x?.cliente === 'string' && Array.isArray(x.lineas) && x.lineas.every((l) => l.cantidad > 0))) throw new Error('El respaldo tiene datos incompletos; no se restauró nada.');
  const plantas = await Promise.all(datos.plantas.map(async (p) => ({
    ...p, foto: typeof p.foto === 'string' && p.foto.startsWith('data:image/') ? await (await fetch(p.foto)).blob() : null
  })));
  return { plantas, pedidos: ped };
}

// Reemplaza todo en una sola transacción: o entra el respaldo completo o no cambia nada.
export async function reemplazar({ plantas, pedidos: ped }) {
  await transaccion('readwrite', [PLANTAS, PEDIDOS], (t) => {
    for (const [nombre, items] of [[PLANTAS, plantas], [PEDIDOS, ped]]) { const s = t.objectStore(nombre); s.clear(); items.forEach((i) => s.put(i)); }
  });
  return plantas.length;
}
