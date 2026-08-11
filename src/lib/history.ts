export interface HistoricalRecord {
  mes: string;
  mesIndex: number;
  anio: number;
  total: number;
  eucalipto: number | null;
  setubal: number | null;
  pino: number | null;
  viana: number | null;
  notas: string;
}

export interface HistoricalOptions {
  aniosVisibles: number[];
  mostrarMedia: boolean;
  mostrarMediana: boolean;
  mesFoco: number | null;
}

export interface SharedHistorical {
  csv: string;
  sourceName: string;
  options: HistoricalOptions;
}

export function defaultHistoricalOptions(anios: number[]): HistoricalOptions {
  const preferidos = anios.filter((anio) => anio >= 2024 && anio <= 2026);
  return {
    aniosVisibles: preferidos.length > 0 ? preferidos : anios.slice(-3),
    mostrarMedia: true,
    mostrarMediana: false,
    mesFoco: null,
  };
}

const MESES = [
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

const normalizar = (valor: string) =>
  valor
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function parseRow(linea: string, separador: string): string[] {
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

function numero(valor: string | undefined): number | null {
  if (!valor?.trim()) return null;
  const limpio = valor.trim().replace(/\s/g, '').replace(',', '.');
  const resultado = Number(limpio);
  return Number.isFinite(resultado) ? resultado : null;
}

export function parseHistoricalCsv(csv: string): HistoricalRecord[] {
  const lineas = csv.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter(Boolean);
  if (lineas.length < 2) throw new Error('El CSV no contiene datos históricos.');

  const separador = lineas[0].includes(';') ? ';' : ',';
  const cabeceras = parseRow(lineas[0], separador).map(normalizar);
  const indice = (nombre: string) => cabeceras.indexOf(nombre);
  const obligatorias = ['mes', 'anio', 'tn_totales'];

  if (obligatorias.some((campo) => indice(campo) === -1)) {
    throw new Error('El CSV debe incluir las columnas mes, anio y tn_totales.');
  }

  const registros: HistoricalRecord[] = [];

  for (const linea of lineas.slice(1)) {
    const celdas = parseRow(linea, separador);
    const total = numero(celdas[indice('tn_totales')]);
    const anio = numero(celdas[indice('anio')]);
    const mesRaw = celdas[indice('mes')] ?? '';
    const mesIndex = MESES.findIndex((mes) => normalizar(mes) === normalizar(mesRaw));

    // Los meses futuros vacíos no son ceros: no deben dibujarse ni entrar en
    // los estadísticos.
    if (total === null && anio !== null && mesIndex >= 0) continue;
    if (total === null || anio === null || mesIndex < 0) continue;

    const campo = (nombre: string) => {
      const posicion = indice(nombre);
      return posicion === -1 ? null : numero(celdas[posicion]);
    };

    registros.push({
      mes: MESES[mesIndex],
      mesIndex,
      anio,
      total,
      eucalipto: campo('tn_eucalipto'),
      setubal: campo('setubal'),
      pino: campo('tn_pino'),
      viana: campo('viana'),
      notas: indice('notas') === -1 ? '' : (celdas[indice('notas')] ?? '').trim(),
    });
  }

  if (registros.length === 0) throw new Error('No se ha encontrado ninguna fila con toneladas.');
  return registros.sort((a, b) => a.anio - b.anio || a.mesIndex - b.mesIndex);
}

export function historicalStats(registros: HistoricalRecord[]) {
  const valores = registros.map((registro) => registro.total).sort((a, b) => a - b);
  if (valores.length === 0) return { media: 0, mediana: 0 };

  const media = valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const centro = Math.floor(valores.length / 2);
  const mediana =
    valores.length % 2 === 0 ? (valores[centro - 1] + valores[centro]) / 2 : valores[centro];
  return { media, mediana };
}

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
