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

/** El separador se deduce de la cabecera: el punto y coma manda si aparece. */
export function separadorDe(cabecera: string): string {
  return cabecera.includes(';') ? ';' : ',';
}

export interface CsvLeido {
  /** La cabecera es la fila 0; las celdas vienen tal cual, sin recortar. */
  filas: string[][];
  separador: string;
}

/**
 * Lee un CSV entero respetando las comillas, **incluidos los saltos de línea
 * que haya dentro de ellas**. Por eso no se parte primero en líneas: una nota
 * escrita en dos renglones es una sola celda, y cortar por el salto la rompería
 * en dos filas y desplazaría todas las columnas que vinieran detrás.
 *
 * Se descartan las filas completamente vacías —las líneas en blanco del final
 * de casi todo fichero— y se normalizan los finales de línea de Windows.
 */
export function parseCsv(texto: string): CsvLeido {
  const limpio = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const separador = separadorDe(limpio.slice(0, limpio.indexOf('\n') + 1 || undefined));

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;

  const cerrarFila = () => {
    fila.push(celda);
    celda = '';
    if (fila.some((valor) => valor.trim() !== '')) filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < limpio.length; i += 1) {
    const caracter = limpio[i];

    if (entreComillas) {
      // Dos comillas seguidas dentro de un campo entrecomillado son una comilla.
      if (caracter === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else if (caracter === '"') {
        entreComillas = false;
      } else {
        celda += caracter;
      }
      continue;
    }

    if (caracter === '"') entreComillas = true;
    else if (caracter === separador) {
      fila.push(celda);
      celda = '';
    } else if (caracter === '\n') cerrarFila();
    else celda += caracter;
  }

  if (celda !== '' || fila.length > 0) cerrarFila();

  return { filas, separador };
}

/**
 * Escribe el CSV de vuelta. Entrecomilla sólo lo que lo necesita, duplica las
 * comillas de dentro y termina las líneas al estilo de Windows, que es lo que
 * esperan Excel y las hojas de cálculo de siempre.
 */
export function serializarCsv(filas: string[][], separador: string): string {
  const escapar = (celda: string) =>
    celda.includes(separador) || /["\n]/.test(celda)
      ? `"${celda.replace(/"/g, '""')}"`
      : celda;

  return filas.map((fila) => fila.map(escapar).join(separador)).join('\r\n') + '\r\n';
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
