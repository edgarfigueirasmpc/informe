import {
  MESES,
  lineasDelCsv,
  mesDesdeTexto,
  normalizar,
  numero,
  parseRow,
  separadorDe,
} from './csv';

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
    mesFoco: null,
  };
}

export function parseHistoricalCsv(csv: string): HistoricalRecord[] {
  const lineas = lineasDelCsv(csv);
  if (lineas.length < 2) throw new Error('El CSV no contiene datos históricos.');

  const separador = separadorDe(lineas[0]);
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
    const mesIndex = mesDesdeTexto(celdas[indice('mes')] ?? '');

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
  if (valores.length === 0) return { media: 0 };

  const media = valores.reduce((total, valor) => total + valor, 0) / valores.length;
  return { media };
}
