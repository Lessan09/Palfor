// Lógica de la calculadora, sin DOM. Estado: pantalla (texto), acumulado (número), op, nuevo (el próximo dígito reemplaza la pantalla).
export const inicial = () => ({ pantalla: '0', acumulado: null, op: null, nuevo: true });

const aplicar = (a, op, b) => {
  const r = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b;
  return Number.isFinite(r) ? String(+r.toPrecision(12)) : 'Error'; // toPrecision quita 0.1+0.2=0.30000000000000004
};

export function teclear(e, t) {
  if (e.pantalla === 'Error' && t !== 'C') return e;
  if (/^\d$/.test(t)) {
    const pantalla = e.nuevo || e.pantalla === '0' ? t : e.pantalla + t;
    return { ...e, pantalla: pantalla.length > 15 ? e.pantalla : pantalla, nuevo: false };
  }
  switch (t) {
    case '.': return e.nuevo ? { ...e, pantalla: '0.', nuevo: false } : e.pantalla.includes('.') ? e : { ...e, pantalla: e.pantalla + '.' };
    case 'C': return inicial();
    case '←': return e.nuevo || e.pantalla.length === 1 || /^-\d$/.test(e.pantalla) ? { ...e, pantalla: '0', nuevo: true } : { ...e, pantalla: e.pantalla.slice(0, -1) };
    case '±': return e.pantalla === '0' ? e : { ...e, pantalla: e.pantalla.startsWith('-') ? e.pantalla.slice(1) : '-' + e.pantalla };
    case '%': return { ...e, pantalla: aplicar(Number(e.pantalla), '÷', 100), nuevo: true };
    case '=': {
      if (e.op === null || e.nuevo) return e;
      return { pantalla: aplicar(e.acumulado, e.op, Number(e.pantalla)), acumulado: null, op: null, nuevo: true };
    }
    default: { // + - × ÷
      if (e.op !== null && !e.nuevo) {
        const pantalla = aplicar(e.acumulado, e.op, Number(e.pantalla));
        return { pantalla, acumulado: pantalla === 'Error' ? null : Number(pantalla), op: t, nuevo: true };
      }
      return { ...e, acumulado: Number(e.pantalla), op: t, nuevo: true };
    }
  }
}
