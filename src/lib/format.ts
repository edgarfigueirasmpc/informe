// `useGrouping: 'always'` porque el español no separa los millares de los
// números de cuatro cifras, y en una columna de números eso descuadra la
// lectura: 3.397 y 15.467 tienen que alinearse igual.
const nf = (min: number, max: number) =>
  new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: 'always',
  });

const enteros = nf(0, 0);
const unDecimal = nf(1, 1);
const dosDecimales = nf(2, 2);
const flexible = nf(0, 2);

/** TN acumuladas y medias: dos decimales, como el PDF. */
export function tn(n: number): string {
  return dosDecimales.format(n);
}

/** Estimaciones: son proyecciones, los decimales sólo estorban. */
export function tnRedondo(n: number): string {
  return enteros.format(Math.round(n));
}

/** Para las casillas editables: sin ceros de relleno. */
export function tnEditable(n: number): string {
  return flexible.format(n);
}

/** Diferencia respecto al dato del informe, siempre con signo. */
export function delta(n: number, decimales = 0): string {
  const signo = n > 0 ? '+' : n < 0 ? '−' : '';
  const formato = decimales === 0 ? enteros : dosDecimales;
  return `${signo}${formato.format(Math.abs(n))}`;
}

export function porcentaje(n: number): string {
  return `${enteros.format(Math.round(n * 100))}%`;
}

/**
 * Cuotas de reparto. Por debajo del 10% se da un decimal: la diferencia entre
 * el 2% y el 2,4% de un año de suministro son cientos de toneladas, y
 * redondeando a entero media docena de clientes acaban empatados a «1%».
 * Devuelve una raya cuando no hay base sobre la que repartir.
 */
export function cuotaPct(n: number | null): string {
  if (n === null) return '—';
  const valor = n * 100;
  return `${(valor > 0 && valor < 10 ? unDecimal : enteros).format(valor)}%`;
}

/** "01-8-2026" -> "1 ago" */
export function fechaCorta(raw: string): string {
  const m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return raw;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(m[1])} ${meses[Number(m[2]) - 1] ?? m[2]}`;
}

export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
