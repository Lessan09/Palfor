// Datos en IndexedDB del propio dispositivo. Las fotos se guardan como Blob dentro de cada planta.
import { completarPedidos, impactoBorrado, movimientosIniciales } from './logica.js';

const PLANTAS = 'plantas', PEDIDOS = 'pedidos', PAQUETES = 'paquetes', CATEGORIAS = 'categorias', MOVS = 'movimientos';
const TODAS = [PLANTAS, PEDIDOS, PAQUETES, CATEGORIAS, MOVS];
const CATEGORIAS_BASE = [['frutal', 'Frutal'], ['maderable', 'Maderable'], ['ornato', 'Ornato'], ['palmera', 'Palmera'], ['otra', 'Otra']].map(([clave, nombre]) => ({ clave, nombre }));
let abierta;

function abrir() {
  abierta ??= new Promise((ok, fallo) => {
    const peticion = indexedDB.open('palfor', 3);
    // Solo se AGREGAN tablas: plantas y pedidos no se tocan, salvo completar los pedidos viejos con su precio.
    // Si algo falla aquí, IndexedDB deshace todo y la base se queda como estaba.
    peticion.onupgradeneeded = (e) => {
      const bd = peticion.result, tx = peticion.transaction;
      for (const n of [PLANTAS, PEDIDOS]) if (!bd.objectStoreNames.contains(n)) bd.createObjectStore(n, { keyPath: 'id', autoIncrement: true });
      if (e.oldVersion >= 3) return;
      bd.createObjectStore(PAQUETES, { keyPath: 'id', autoIncrement: true });
      bd.createObjectStore(CATEGORIAS, { keyPath: 'clave' });
      const movs = bd.createObjectStore(MOVS, { keyPath: 'id', autoIncrement: true });
      CATEGORIAS_BASE.forEach((c) => tx.objectStore(CATEGORIAS).put(c));
      tx.objectStore(PLANTAS).getAll().onsuccess = (ev) => {
        const plantas = ev.target.result, ped = tx.objectStore(PEDIDOS);
        movimientosIniciales(plantas).forEach((m) => movs.add(m));
        ped.getAll().onsuccess = (ev2) => completarPedidos(ev2.target.result, plantas).forEach((p) => ped.put(p));
      };
    };
    peticion.onblocked = () => dispatchEvent(new Event('palfor:bloqueada')); // otra ventana de Palfor sigue abierta con la versión anterior
    peticion.onsuccess = () => {
      const bd = peticion.result;
      dispatchEvent(new Event('palfor:desbloqueada'));
      bd.onversionchange = () => { bd.close(); abierta = undefined; }; // otra pestaña con una versión más nueva: no la bloqueamos
      ok(bd);
    };
    peticion.onerror = () => fallo(peticion.error);
  }).catch((e) => { abierta = undefined; throw e; });
  return abierta;
}

// Cada escritura exitosa avisa a la pantalla (inventario, pedidos, estadísticas, aviso de respaldo) para que se actualice.
const cambio = () => dispatchEvent(new Event('palfor:cambio'));
const ahora = () => new Date().toISOString();

// durability 'strict': la transacción solo se da por buena cuando el disco ya confirmó la escritura.
async function transaccion(modo, tiendas, trabajo) {
  const t = (await abrir()).transaction(tiendas, modo, { durability: 'strict' });
  return new Promise((ok, fallo) => {
    const resultado = trabajo(t);
    t.oncomplete = () => { if (modo === 'readwrite') cambio(); ok(resultado?.result); };
    t.onerror = (e) => fallo(e.target.error ?? t.error);
    t.onabort = () => fallo(t.error ?? new Error('La operación se canceló.'));
  });
}

// Operación de varios pasos: `fallar(mensaje)` cancela TODO, así nunca queda un pedido sin su descuento de stock (ni al revés).
async function operar(trabajo) {
  const t = (await abrir()).transaction([PLANTAS, PEDIDOS, MOVS], 'readwrite', { durability: 'strict' });
  return new Promise((ok, fallo) => {
    let motivo;
    const fallar = (m) => { motivo = m; t.abort(); };
    t.oncomplete = () => { cambio(); ok(); };
    t.onerror = t.onabort = () => fallo(motivo ? new Error(motivo) : t.error);
    trabajo(t.objectStore(PLANTAS), t.objectStore(PEDIDOS), t.objectStore(MOVS), fallar);
  });
}

// ---- Plantas ----
export const todas = () => transaccion('readonly', [PLANTAS], (t) => t.objectStore(PLANTAS).getAll());

// Toda variación de existencias deja un movimiento. Opciones:
//  base      = existencias que tenía el formulario al abrirse: se suma solo la diferencia sobre lo guardado ahora (no pisa cambios hechos mientras tanto)
//  tipo      = 'entrada' (compra), 'baja' o 'correccion' (error de captura: no cuenta como inversión)
//  recostear = el costo cambió y se corrige también en las compras y ventas anteriores de esta planta
export const guardarPlanta = (planta, { base, tipo, recostear } = {}) => transaccion('readwrite', [PLANTAS, MOVS, PEDIDOS], (t) => {
  const s = t.objectStore(PLANTAS), m = t.objectStore(MOVS), ped = t.objectStore(PEDIDOS);
  const anotar = (id, delta) => delta && m.add({ fecha: ahora(), plantaId: id, planta: planta.nombre, tipo: tipo ?? (delta > 0 ? 'entrada' : 'baja'), cantidad: delta, precio: planta.precio, costo: planta.costo });
  if (planta.id === undefined) { s.add(planta).onsuccess = (e) => anotar(e.target.result, planta.existencias); return; }
  s.get(planta.id).onsuccess = (e) => {
    const previa = e.target.result?.existencias ?? 0;
    const nuevo = Math.max(0, previa + planta.existencias - (base ?? previa));
    s.put({ ...planta, existencias: nuevo });
    anotar(planta.id, nuevo - previa);
    if (!recostear) return;
    m.getAll().onsuccess = (ev) => ev.target.result.filter((x) => x.plantaId === planta.id && (x.tipo === 'inicial' || x.tipo === 'entrada')).forEach((x) => m.put({ ...x, costo: planta.costo }));
    ped.getAll().onsuccess = (ev) => ev.target.result.filter((p) => p.lineas.some((l) => l.plantaId === planta.id))
      .forEach((p) => ped.put({ ...p, lineas: p.lineas.map((l) => (l.plantaId === planta.id ? { ...l, costo: planta.costo } : l)) }));
  };
});

// Botones + y −: lee la planta dentro de la transacción para no pisar cambios hechos desde otra pantalla.
export const ajustarStock = (id, delta) => transaccion('readwrite', [PLANTAS, MOVS], (t) => {
  const s = t.objectStore(PLANTAS);
  s.get(id).onsuccess = (e) => {
    const p = e.target.result;
    const real = p ? Math.max(0, p.existencias + delta) - p.existencias : 0;
    if (!real) return;
    s.put({ ...p, existencias: p.existencias + real });
    t.objectStore(MOVS).add({ fecha: ahora(), plantaId: id, planta: p.nombre, tipo: real > 0 ? 'entrada' : 'baja', cantidad: real, precio: p.precio, costo: p.costo });
  };
});

// Cambia solo algunos campos (paquetes, archivada) sobre lo que hay guardado, sin tocar existencias.
export const actualizarPlanta = (id, cambiar) => transaccion('readwrite', [PLANTAS], (t) => {
  const s = t.objectStore(PLANTAS);
  s.get(id).onsuccess = (e) => { if (e.target.result) s.put({ ...e.target.result, ...cambiar(e.target.result) }); };
});

// Borrar para siempre: la planta sale de TODAS las cuentas (historial, líneas de pedidos y ventas). Los pedidos que se queden sin plantas se borran.
export async function impactoPlanta(id) {
  const [movs, peds] = await Promise.all([todosMovimientos(), pedidos()]);
  return impactoBorrado(id, movs, peds);
}
export const borrarPlanta = (id) => transaccion('readwrite', [PLANTAS, PEDIDOS, MOVS], (t) => {
  t.objectStore(PLANTAS).delete(id);
  const m = t.objectStore(MOVS), ped = t.objectStore(PEDIDOS);
  m.getAll().onsuccess = (e) => e.target.result.filter((x) => x.plantaId === id).forEach((x) => m.delete(x.id));
  ped.getAll().onsuccess = (e) => e.target.result.filter((p) => p.lineas.some((l) => l.plantaId === id)).forEach((p) => {
    const resto = p.lineas.filter((l) => l.plantaId !== id);
    if (resto.length) ped.put({ ...p, lineas: resto }); else ped.delete(p.id);
  });
});

// ---- Paquetes ----
export const paquetes = () => transaccion('readonly', [PAQUETES], (t) => t.objectStore(PAQUETES).getAll());
export const guardarPaquete = (p) => transaccion('readwrite', [PAQUETES], (t) => t.objectStore(PAQUETES).put(p)); // devuelve el id
// Borrar un paquete NO borra sus plantas: solo se les quita la pertenencia.
export const borrarPaquete = (id) => transaccion('readwrite', [PAQUETES, PLANTAS], (t) => {
  t.objectStore(PAQUETES).delete(id);
  const s = t.objectStore(PLANTAS);
  s.getAll().onsuccess = (e) => e.target.result.filter((p) => p.paquetes?.includes(id)).forEach((p) => s.put({ ...p, paquetes: p.paquetes.filter((x) => x !== id) }));
});

// ---- Categorías ----
export const categorias = () => transaccion('readonly', [CATEGORIAS], (t) => t.objectStore(CATEGORIAS).getAll());
const clavede = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export async function agregarCategoria(nombre) {
  nombre = nombre.trim();
  const clave = clavede(nombre);
  if (!clave) throw new Error('Escribe un nombre con letras o números.');
  if ((await categorias()).some((c) => c.clave === clave)) throw new Error('Ya existe una categoría con ese nombre.');
  await transaccion('readwrite', [CATEGORIAS], (t) => t.objectStore(CATEGORIAS).put({ clave, nombre }));
}
export const renombrarCategoria = (clave, nombre) => transaccion('readwrite', [CATEGORIAS], (t) => t.objectStore(CATEGORIAS).put({ clave, nombre: nombre.trim() }));
export async function borrarCategoria(clave) {
  const usan = (await todas()).filter((p) => p.categoria === clave), archivadas = usan.filter((p) => p.archivada).length;
  if (usan.length) throw new Error(`No se puede borrar: la usan ${usan.length - archivadas} planta(s) activas y ${archivadas} archivadas. Cámbiales la categoría o bórralas (Inventario → Mostrar: Archivadas).`);
  await transaccion('readwrite', [CATEGORIAS], (t) => t.objectStore(CATEGORIAS).delete(clave));
}

// ---- Movimientos (historial) ----
export const todosMovimientos = () => transaccion('readonly', [MOVS], (t) => t.objectStore(MOVS).getAll());

// De lo más nuevo a lo más viejo, por páginas: `antes` es el id del último movimiento ya mostrado.
// `plantaIds` (un Set) limita el historial a las plantas de un paquete.
export async function movimientos({ plantaIds, antes, limite = 40 } = {}) {
  const t = (await abrir()).transaction([MOVS]);
  const salida = [];
  return new Promise((ok, fallo) => {
    const c = t.objectStore(MOVS).openCursor(antes === undefined ? null : IDBKeyRange.upperBound(antes, true), 'prev');
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur || salida.length >= limite) return;
      if (!plantaIds || plantaIds.has(cur.value.plantaId)) salida.push(cur.value);
      cur.continue();
    };
    t.oncomplete = () => ok(salida);
    t.onerror = t.onabort = () => fallo(t.error);
  });
}

// ---- Pedidos ----
export const pedidos = () => transaccion('readonly', [PEDIDOS], (t) => t.objectStore(PEDIDOS).getAll());

// Un pedido es { cliente, lineas: [{ plantaId, planta, cantidad, precio, costo }], estado, notas, fecha, fechaEntrega }.
// El precio y el costo de cada línea se guardan en el pedido: si después cambian en la planta, las ventas viejas no se mueven.
// Mientras no esté cancelado, aparta stock. Crear, editar, cambiar de estado o borrar pasan por aquí: se compara lo apartado ANTES
// con lo de DESPUÉS y solo se mueve la diferencia (y se anota en el historial), todo en una transacción.
const aparta = (p) => (p && p.estado !== 'cancelado' ? p.lineas : []);
// `sinStock`: el pedido se borra/cancela pero las plantas NO regresan al inventario (ya se entregaron y no volvieron).
const cambiarPedido = (id, despues, sinStock = false) => operar((plantas, ped, movs, fallar) => {
  if (despues && (!despues.lineas?.length || despues.lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1))) return fallar('Cada pedido necesita al menos una planta con cantidad entera de 1 o más.');
  if (despues && despues.lineas.some((l) => !Number.isFinite(l.precio) || l.precio < 0 || !Number.isFinite(l.costo) || l.costo < 0)) return fallar('El precio de cada planta debe ser cero o más.');
  const aplicar = (antes) => {
    const dif = new Map(); // plantaId → piezas que hay que descontar de más (negativo = se devuelven)
    if (!sinStock) for (const [lineas, signo] of [[aparta(antes), -1], [aparta(despues), 1]]) for (const l of lineas) dif.set(l.plantaId, (dif.get(l.plantaId) ?? 0) + signo * l.cantidad);
    const guardado = despues ? ped.put(despues) : ped.delete(id); // primero el pedido, así su id ya existe cuando se anotan los movimientos
    const fecha = ahora();
    for (const [plantaId, d] of dif) {
      if (!d) continue;
      plantas.get(plantaId).onsuccess = (e) => {
        const p = e.target.result;
        if (!p) return d > 0 ? fallar('Una planta del pedido ya no existe.') : undefined; // si se borró, no hay a dónde devolver
        if (d > p.existencias) return fallar(`Solo quedan ${p.existencias} disponibles de ${p.nombre}.`);
        plantas.put({ ...p, existencias: p.existencias - d });
        const linea = [...aparta(despues), ...aparta(antes)].find((l) => l.plantaId === plantaId);
        movs.add({ fecha, plantaId, planta: p.nombre, tipo: d > 0 ? 'pedido' : 'devolucion', cantidad: -d, precio: linea?.precio ?? p.precio, costo: linea?.costo ?? p.costo, pedidoId: despues ? guardado.result : id });
      };
    }
  };
  if (id === undefined) return aplicar();
  ped.get(id).onsuccess = (e) => (e.target.result ? aplicar(e.target.result) : fallar('El pedido ya no existe.'));
});
// La venta cuenta desde que el pedido pasa a "entregado": ahí se anota la fecha de entrega (y se quita si se reabre o cancela).
export const guardarPedido = ({ fechaEntrega, ...pedido }, { sinStock } = {}) => cambiarPedido(pedido.id, pedido.estado === 'entregado' ? { ...pedido, fechaEntrega: fechaEntrega ?? ahora() } : pedido, sinStock);
export const borrarPedido = (id, { sinStock } = {}) => cambiarPedido(id, null, sinStock);

// ---- Respaldo ----
// Las fotos viajan como data URL dentro de un JSON, con una huella SHA-256 para detectar archivos dañados.
const aDataUrl = (blob) => new Promise((ok, fallo) => {
  const lector = new FileReader();
  lector.onload = () => ok(lector.result);
  lector.onerror = () => fallo(lector.error);
  lector.readAsDataURL(blob);
});
const huella = async (texto) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function exportar() {
  let pedidas; // las 5 tablas se leen en UNA transacción, así el respaldo es una foto coherente
  await transaccion('readonly', TODAS, (t) => { pedidas = TODAS.map((n) => t.objectStore(n).getAll()); });
  const [plantas, ped, paq, cats, movs] = pedidas.map((r) => r.result);
  const contenido = {
    plantas: await Promise.all(plantas.map(async (p) => ({ ...p, foto: p.foto ? await aDataUrl(p.foto) : null }))),
    pedidos: ped, paquetes: paq, categorias: cats, movimientos: movs
  };
  return JSON.stringify({ app: 'palfor', version: 3, creado: ahora(), sha256: await huella(JSON.stringify(contenido)), ...contenido });
}

// Valida TODO el archivo antes de tocar nada. Acepta respaldos antiguos (versión 1 y 2): se les arma lo que les falta.
export async function leer(texto) {
  const invalido = new Error('El archivo no es un respaldo de Palfor.');
  let datos;
  try { datos = JSON.parse(texto); } catch { throw invalido; }
  const nuevo = datos?.version >= 3;
  const opcional = (k) => datos[k] === undefined || Array.isArray(datos[k]);
  if (datos?.app !== 'palfor' || !Array.isArray(datos.plantas) || !['pedidos', 'paquetes', 'categorias', 'movimientos'].every(opcional)) throw invalido;
  if (nuevo && !['pedidos', 'paquetes', 'categorias', 'movimientos'].every((k) => Array.isArray(datos[k]))) throw invalido;
  if (datos.sha256) {
    const contenido = nuevo ? { plantas: datos.plantas, pedidos: datos.pedidos, paquetes: datos.paquetes, categorias: datos.categorias, movimientos: datos.movimientos } : { plantas: datos.plantas, pedidos: datos.pedidos };
    if (datos.sha256 !== await huella(JSON.stringify(contenido))) throw new Error('El respaldo está dañado o fue modificado; no se restauró nada.');
  }
  const ped = datos.pedidos ?? [];
  const completo = datos.plantas.every((p) => typeof p?.nombre === 'string' && Number.isFinite(p.existencias))
    && ped.every((x) => typeof x?.cliente === 'string' && Array.isArray(x.lineas) && x.lineas.every((l) => l.cantidad > 0))
    && (datos.paquetes ?? []).every((x) => typeof x?.nombre === 'string')
    && (datos.categorias ?? []).every((x) => typeof x?.clave === 'string' && typeof x?.nombre === 'string')
    && (datos.movimientos ?? []).every((x) => Number.isFinite(x?.plantaId) && Number.isFinite(x?.cantidad));
  if (!completo) throw new Error('El respaldo tiene datos incompletos; no se restauró nada.');
  const plantas = await Promise.all(datos.plantas.map(async (p) => ({
    ...p, foto: typeof p.foto === 'string' && p.foto.startsWith('data:image/') ? await (await fetch(p.foto)).blob() : null
  })));
  return {
    plantas, pedidos: completarPedidos(ped, plantas), paquetes: nuevo ? datos.paquetes : [],
    categorias: nuevo ? datos.categorias : CATEGORIAS_BASE, movimientos: nuevo ? datos.movimientos : movimientosIniciales(plantas)
  };
}

// Reemplaza todo en una sola transacción: o entra el respaldo completo o no cambia nada.
export async function reemplazar(datos) {
  await transaccion('readwrite', TODAS, (t) => {
    for (const [nombre, items] of [[PLANTAS, datos.plantas], [PEDIDOS, datos.pedidos], [PAQUETES, datos.paquetes], [CATEGORIAS, datos.categorias], [MOVS, datos.movimientos]]) {
      const s = t.objectStore(nombre);
      s.clear();
      items.forEach((i) => s.put(i));
    }
  });
  return datos.plantas.length;
}
