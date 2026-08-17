/**
 * Lo común a los CSV que se cargan a mano: partirlos respetando las comillas,
 * leer números escritos a la española y comparar nombres sin acentos ni cajas.
 *
 * Vive aparte porque hay dos lectores —el histórico mensual y el pino por
 * cliente— y los dos vienen del mismo sitio: hojas de cálculo exportadas a
 * mano, con separador de coma o de punto y coma según quién las guardó.
 */

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/** Sin acentos, sin mayúsculas y sin espacios de sobra: para comparar nombres. */
export const normalizar = (valor: string) =>
  valor
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Quita el BOM, unifica los saltos de línea y descarta las filas en blanco. */
export function lineasDelCsv(csv: string): string[] {
  return csv.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter(Boolean);
}

/** El separador se deduce de la cabecera: el punto y coma manda si aparece. */
export function separadorDe(cabecera: string): string {
  return cabecera.includes(';') ? ';' : ',';
}

export function parseRow(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let celda = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];
    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === separador && !entreComillas) {
      celdas.push(celda.trim());
      celda = '';
    } else {
      celda += caracter;
    }
  }

  celdas.push(celda.trim());
  return celdas;
}

/** Devuelve null —y no cero— cuando la celda está vacía o no es un número. */
export function numero(valor: string | undefined): number | null {
  if (!valor?.trim()) return null;
  const limpio = valor.trim().replace(/\s/g, '').replace(',', '.');
  const resultado = Number(limpio);
  return Number.isFinite(resultado) ? resultado : null;
}

/** El índice del mes escrito con letra, o -1 si no se reconoce. */
export function mesDesdeTexto(raw: string): number {
  const buscado = normalizar(raw ?? '');
  return MESES.findIndex((mes) => normalizar(mes) === buscado);
}
