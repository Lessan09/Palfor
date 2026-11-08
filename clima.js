// Pronóstico de Open-Meteo para Tapachula. Sin internet muestra el último guardado.
const LATITUD = 14.8933, LONGITUD = -92.2738; // shortcut: ubicación fija; si el vivero cambia de lugar, editar aquí
const CLAVE = 'palfor.clima';
const estado = document.querySelector('#clima-estado'), ahora = document.querySelector('#clima-ahora');
const dias = document.querySelector('#clima-dias'), consejo = document.querySelector('#clima-consejo');
const boton = document.querySelector('#actualizar-clima');

const CODIGOS = { 0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Niebla', 48: 'Niebla con escarcha',
  51: 'Llovizna ligera', 53: 'Llovizna', 55: 'Llovizna intensa', 61: 'Lluvia ligera', 63: 'Lluvia', 65: 'Lluvia intensa',
  80: 'Chubascos ligeros', 81: 'Chubascos', 82: 'Chubascos intensos', 95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta con granizo' };
const descripcion = (c) => CODIGOS[c] ?? 'Sin descripción';

function celda(etiqueta, valor) {
  const d = document.createElement('div');
  const s = document.createElement('span'), f = document.createElement('strong');
  s.textContent = etiqueta; f.textContent = valor;
  d.append(s, f);
  return d;
}

function mostrar(d) {
  const c = d.current, u = d.current_units;
  ahora.replaceChildren(celda('Temperatura', `${c.temperature_2m} ${u.temperature_2m}`), celda('Condición', descripcion(c.weather_code)),
    celda('Humedad', `${c.relative_humidity_2m} ${u.relative_humidity_2m}`), celda('Lluvia ahora', `${c.precipitation} ${u.precipitation}`),
    celda('Viento', `${c.wind_speed_10m} ${u.wind_speed_10m}`));
  dias.replaceChildren(...d.daily.time.map((fecha, i) => {
    const nombre = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric' }).format(new Date(`${fecha}T12:00:00`));
    return celda(nombre, `${d.daily.temperature_2m_min[i]}° / ${d.daily.temperature_2m_max[i]}° · 💧${d.daily.precipitation_probability_max[i] ?? '?'}%`);
  }));
  const lluvia = d.daily.precipitation_probability_max[0], calor = d.daily.temperature_2m_max[0];
  const texto = lluvia >= 60 ? 'Hoy es probable que llueva: quizá puedas saltarte el riego.'
    : calor >= 35 ? 'Calor fuerte hoy: riega temprano o al atardecer.' : '';
  consejo.hidden = !texto;
  consejo.textContent = texto;
}

async function cargar() {
  boton.disabled = true;
  estado.textContent = 'Consultando el pronóstico…';
  estado.classList.remove('error');
  const params = new URLSearchParams({ latitude: LATITUD, longitude: LONGITUD, timezone: 'auto', forecast_days: 5, wind_speed_unit: 'kmh',
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' });
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}.`);
    const d = await r.json();
    if (!d.current || !Array.isArray(d.daily?.time)) throw new Error('Respuesta inesperada del pronóstico.');
    mostrar(d);
    try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* sin espacio: se omite la copia */ }
    estado.textContent = `Actualizado ${new Date(d.current.time).toLocaleString('es-MX')}.`;
  } catch (e) {
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE)); } catch { /* copia dañada */ }
    if (guardado?.current && guardado.daily) {
      mostrar(guardado);
      estado.textContent = `Sin conexión. Último pronóstico guardado (${new Date(guardado.current.time).toLocaleString('es-MX')}).`;
    } else estado.textContent = 'Sin conexión y todavía no hay un pronóstico guardado. Se cargará cuando haya internet.';
    estado.classList.add('error');
  } finally { boton.disabled = false; }
}

boton.addEventListener('click', cargar);
window.addEventListener('online', cargar);
cargar();
