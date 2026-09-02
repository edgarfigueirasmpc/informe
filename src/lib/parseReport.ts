/**
 * Traducción del PDF a `Report`.
 *
 * El PDF no tiene estructura de tabla: son cadenas sueltas con coordenadas.
 * La reconstrucción se apoya en dos hechos estables del generador:
 *  - Las celdas de una misma fila comparten la coordenada Y.
 *  - Cada columna arranca siempre en la misma X, cabecera incluida.
 *
 * Esta capa es pura (no toca pdf.js) para poder probarla sin navegador.
 */

import type { ClientRecord, Report, ReportHeader, Species } from './model';
import { clientKey, fixEncoding, isNumeric, normalizeSpace, parseNumber } from './text';

export interface TextItem {
  x: number;
  y: number;
  text: string;
}

export interface PageText {
  items: TextItem[];
}

export interface ParseResult {
  report: Report;
  warnings: string[];
}

export class ParseError extends Error {}

interface Row {
  y: number;
  cells: TextItem[];
}

/** Secciones que nos interesan y especie a la que suman. */
const SECTIONS: { match: RegExp; species: Species }[] = [
  { match: /^eucaliptos?$/i, species: 'eucalipto' },
  { match: /^pinos?$/i, species: 'pino' },
  { match: /^otras\s+especies$/i, species: 'otras' },
];

const TOTALS_ROW = /^totales?$/i;

/** Tolerancia vertical para considerar que dos cadenas van en la misma fila. */
const ROW_TOLERANCE = 2.5;

function buildRows(items: TextItem[]): Row[] {
  const clean = items
    .map((it) => ({ ...it, text: fixEncoding(it.text).replace(/\s+/g, ' ').trim() }))
    .filter((it) => it.text.length > 0);

  const rows: Row[] = [];
  for (const item of clean.sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= ROW_TOLERANCE);
    if (row) {
      row.cells.push(item);
    } else {
      rows.push({ y: item.y, cells: [item] });
    }
  }

  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

function pickNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m ? parseNumber(m[1]) : null;
}

function parseHeader(rows: Row[], warnings: string[]): ReportHeader {
  const text = rows.map((r) => r.cells.map((c) => c.text).join(' ')).join('\n');

  const periodo = text.match(/Filtro\s+del\s+(\S+)\s+al\s+(\S+)/i);
  const totalMes = pickNumber(text, /Total\s+mes:\s*([\d.,-]+)/i);
  // "día"/"días" pueden llegar con el acento roto: no se exige la í.
  const diasTrabajados = pickNumber(text, /D\S*as?\s+trabajados:\s*([\d.,-]+)/i);
  const diasRestantes = pickNumber(text, /D\S*as?\s+laborables\s+restantes:\s*([\d.,-]+)/i);
  const mediaDia = pickNumber(text, /Media\s+por\s+d\S*a:\s*([\d.,-]+)/i);
  const estimacion = pickNumber(text, /Estimado\s+restante:\s*([\d.,-]+)/i);
  const totalDiaAnterior = pickNumber(text, /Total\s+d\S*a\s+anterior:\s*([\d.,-]+)/i);

  if (totalMes === null) {
    throw new ParseError(
      'No se encuentra "Total mes" en el PDF. ¿Es el informe de pesos diarios acumulado?',
    );
  }
  if (diasTrabajados === null || diasTrabajados <= 0) {
    throw new ParseError('No se encuentra un número válido de días trabajados en el PDF.');
  }
  if (diasRestantes === null) {
    warnings.push('No se han encontrado los días laborables restantes; se asume 0.');
  }
  if (mediaDia === null) {
    warnings.push('No se encuentra la media por día; se calcula a partir del total.');
  }

  const dTrab = diasTrabajados;
  const dRest = diasRestantes ?? 0;

  return {
    desde: periodo?.[1] ?? '',
    hasta: periodo?.[2] ?? '',
    diasTrabajados: dTrab,
    diasRestantes: dRest,
    totalMes,
    totalDiaAnterior: totalDiaAnterior ?? 0,
    mediaDia: mediaDia ?? totalMes / dTrab,
    estimacionMes: estimacion ?? (mediaDia ?? totalMes / dTrab) * (dTrab + dRest),
  };
}

// ---------------------------------------------------------------------------
// Tablas de especies
// ---------------------------------------------------------------------------

type ColumnKind = 'q1' | 'q2' | 'total' | 'cupo';

interface Column {
  x: number;
  kind: ColumnKind;
}

function classifyHeaderCell(text: string): ColumnKind | null {
  if (/cupo/i.test(text)) return 'cupo';
  if (/\b1\s*.?\s*quincena/i.test(text)) return 'q1';
  if (/\b2\s*.?\s*quincena/i.test(text)) return 'q2';
  if (/^total\b/i.test(text)) return 'total';
  return null;
}

/**
 * Columnas de las tablas de una sola especie (Eucalipto, Pinos), donde la
 * cabecera cabe en una única fila: 1ª Quincena · 2ª Quincena · Total · Cupo.
 */
function columnsFromHeader(headerRow: Row): Column[] {
  const cols: Column[] = [];
  for (const cell of headerRow.cells) {
    const kind = classifyHeaderCell(cell.text);
    if (kind) cols.push({ x: cell.x, kind });
  }
  return cols.sort((a, b) => a.x - b.x);
}

/**
 * Columnas de "Otras Especies": la cabecera se parte en varias líneas y no se
 * puede leer, pero la rejilla es siempre la misma —siete especies × (1ª, 2ª,
 * Total)—, así que se deduce de la fila de totales, que sí tiene todas las
 * celdas, y se clasifica por posición.
 */
function columnsFromGrid(gridRow: Row, warnings: string[]): Column[] {
  const xs = gridRow.cells.filter((c) => isNumeric(c.text)).map((c) => c.x).sort((a, b) => a - b);
  if (xs.length === 0) return [];
  if (xs.length % 3 !== 0) {
    warnings.push(
      `La tabla "Otras Especies" tiene ${xs.length} columnas numéricas, que no son múltiplo de 3; ` +
        'puede que el desglose por especie no se lea bien.',
    );
  }
  return xs.map((x, i) => ({ x, kind: (['q1', 'q2', 'total'] as const)[i % 3] }));
}

function nearestColumn(cols: Column[], x: number): Column | null {
  let best: Column | null = null;
  let bestDist = Infinity;
  for (const col of cols) {
    const d = Math.abs(col.x - x);
    if (d < bestDist) {
      bestDist = d;
      best = col;
    }
  }
  // Más de media columna de distancia significa que no es una celda de datos.
  return bestDist <= 40 ? best : null;
}

interface SectionRow {
  name: string;
  total: number;
  cupo: number | null;
}

function parseDataRow(row: Row, cols: Column[]): SectionRow | null {
  const firstColX = cols[0].x;
  const nameCells = row.cells.filter((c) => c.x < firstColX - 5);
  const name = normalizeSpace(nameCells.map((c) => c.text).join(' '));
  if (!name) return null;

  let total = 0;
  let cupo: number | null = null;

  for (const cell of row.cells) {
    if (cell.x < firstColX - 5) continue;
    const value = parseNumber(cell.text);
    if (value === null) continue;
    const col = nearestColumn(cols, cell.x);
    if (!col) continue;
    if (col.kind === 'total') total += value;
    else if (col.kind === 'cupo') cupo = (cupo ?? 0) + value;
  }

  return { name, total, cupo };
}

interface Section {
  species: Species;
  rows: SectionRow[];
  /** Fila "Totales" del PDF, para contrastar. */
  totals: SectionRow | null;
}

function parseSection(species: Species, rows: Row[], warnings: string[]): Section {
  const headerIndex = rows.findIndex((r) => r.cells.some((c) => /^lugar$/i.test(c.text)));
  const body = rows.slice(headerIndex + 1);
  const totalsRow = body.find((r) => r.cells.some((c) => TOTALS_ROW.test(c.text))) ?? null;

  let cols: Column[] = [];
  if (headerIndex >= 0) cols = columnsFromHeader(rows[headerIndex]);
  if (cols.length === 0 && totalsRow) cols = columnsFromGrid(totalsRow, warnings);

  if (cols.length === 0) {
    warnings.push(`No se han podido identificar las columnas de la tabla "${species}".`);
    return { species, rows: [], totals: null };
  }

  const parsed: SectionRow[] = [];
  let totals: SectionRow | null = null;

  for (const row of body) {
    const isTotals = row.cells.some((c) => TOTALS_ROW.test(c.text));
    const data = parseDataRow(row, cols);
    if (!data) continue;
    if (isTotals) totals = data;
    else parsed.push(data);
  }

  return { species, rows: parsed, totals };
}

function splitSections(rows: Row[]): { species: Species; rows: Row[] }[] {
  const found: { species: Species; index: number }[] = [];

  rows.forEach((row, index) => {
    // El rótulo de sección va solo en su fila y pegado al margen izquierdo.
    if (row.cells.length !== 1) return;
    const section = SECTIONS.find((s) => s.match.test(row.cells[0].text));
    if (section) found.push({ species: section.species, index });
  });

  return found.map((s, i) => ({
    species: s.species,
    rows: rows.slice(s.index + 1, i + 1 < found.length ? found[i + 1].index : rows.length),
  }));
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export function parsePages(pages: PageText[], sourceFile: string): ParseResult {
  const warnings: string[] = [];
  const rows = pages.flatMap((page) => buildRows(page.items));

  const header = parseHeader(rows, warnings);
  const sections = splitSections(rows);

  if (sections.length === 0) {
    throw new ParseError('El PDF no contiene ninguna tabla de especies reconocible.');
  }

  const byClient = new Map<string, ClientRecord>();

  for (const { species, rows: sectionRows } of sections) {
    const section = parseSection(species, sectionRows, warnings);

    for (const row of section.rows) {
      const key = clientKey(row.name);
      if (!key) continue;
      let record = byClient.get(key);
      if (!record) {
        record = { name: row.name, tn: { pino: 0, eucalipto: 0, otras: 0 }, cupoPendiente: null };
        byClient.set(key, record);
      }
      record.tn[species] += row.total;
      if (row.cupo !== null) record.cupoPendiente = (record.cupoPendiente ?? 0) + row.cupo;
    }

    if (section.totals) {
      const suma = section.rows.reduce((acc, r) => acc + r.total, 0);
      const esperado = section.totals.total;
      if (Math.abs(suma - esperado) > 0.05) {
        warnings.push(
          `En "${species}" la suma de clientes (${suma.toFixed(2)} TN) no coincide con la fila ` +
            `de totales del PDF (${esperado.toFixed(2)} TN).`,
        );
      }
    }
  }

  const clients = [...byClient.values()].map((c) => ({
    ...c,
    tn: {
      pino: round3(c.tn.pino),
      eucalipto: round3(c.tn.eucalipto),
      otras: round3(c.tn.otras),
    },
    cupoPendiente: c.cupoPendiente === null ? null : round3(c.cupoPendiente),
  }));

  if (clients.length === 0) {
    throw new ParseError('No se ha encontrado ningún cliente en las tablas del PDF.');
  }

  return {
    report: {
      header,
      clients,
      publishedAt: new Date().toISOString(),
      sourceFile,
    },
    warnings,
  };
}

/**
 * Quita el ruido de la coma flotante al agregar los totales de las distintas
 * secciones. Se redondea a tres decimales y no a dos, porque el tercer decimal
 * del origen son kilos que sí están contados.
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
