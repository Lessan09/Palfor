// Piezas de pantalla que comparten todas las vistas.
export const $ = (s) => document.querySelector(s);
export const el = (tag, texto = '', clase = '') => Object.assign(document.createElement(tag), { textContent: texto, className: clase });
export const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Recarga una vista solo cuando está a la vista: si cambian los datos con otra pantalla abierta, espera a que la abran.
// Así no se leen todas las plantas (con fotos) en cada cambio para pantallas que nadie está mirando.
export function perezosa(vistaId, cargar, alFallar = () => {}) {
  let sucio = true;
  const correr = () => {
    if (!sucio || document.getElementById(vistaId).hidden) return;
    sucio = false;
    cargar().catch(alFallar);
  };
  addEventListener('palfor:cambio', () => { sucio = true; correr(); });
  addEventListener('palfor:vista', correr);
  correr();
}

const ETIQUETAS = { inicial: 'Inventario inicial', entrada: 'Entrada', baja: 'Baja', pedido: 'Pedido', devolucion: 'Devolución' };
export function tarjetaMovimiento(m) {
  const art = el('article', '', 'movimiento');
  const cant = el('strong', `${m.cantidad > 0 ? '+' : ''}${m.cantidad}`, m.cantidad > 0 ? 'sube' : 'baja');
  const cuerpo = el('div');
  cuerpo.append(el('p', `${m.planta}`, 'mov-titulo'), el('p', `${ETIQUETAS[m.tipo] ?? m.tipo}${m.pedidoId ? ` #${m.pedidoId}` : ''} · ${fechaCorta.format(new Date(m.fecha))}`, 'datos'));
  art.append(cant, cuerpo);
  return art;
}

// Lista con "Ver más": `pedir(antesDelId)` trae una página y `limite` es el tamaño de página. Devuelve la función que reinicia la lista.
export function listaPaginada(contenedor, boton, pedir, limite = 40) {
  let ultimo;
  const cargar = async (reiniciar) => {
    const pagina = await pedir(reiniciar ? undefined : ultimo);
    if (reiniciar) contenedor.replaceChildren();
    pagina.forEach((m) => contenedor.append(tarjetaMovimiento(m)));
    if (pagina.length) ultimo = pagina.at(-1).id;
    boton.hidden = pagina.length < limite;
    if (!contenedor.children.length) contenedor.append(el('p', 'Todavía no hay movimientos.', 'estado'));
  };
  boton.onclick = () => cargar(false).catch(() => {});
  return () => cargar(true);
}
