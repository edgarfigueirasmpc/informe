/**
 * El generador del informe escribe el PDF en UTF-8 pero declara una fuente
 * con codificación cp1252, así que los acentos llegan como mojibake:
 * "SERRAÇAO" viaja como "SERRAÃ‡AO". Aquí se deshace ese doble encoding.
 */

/** Códigos cp1252 que no coinciden con latin-1, mapeados a su byte original. */
const CP1252_TO_BYTE = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function toByte(cp: number): number | null {
  const mapped = CP1252_TO_BYTE.get(cp);
  if (mapped !== undefined) return mapped;
  return cp <= 0xff ? cp : null;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function decodeBytes(bytes: number[]): string | null {
  try {
    return decoder.decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * Deshace el mojibake carácter a carácter, dejando intacto lo que ya está bien.
 *
 * Caso especial: pdf.js descarta los caracteres sin glifo en la fuente, y el
 * byte 0xAD (guion blando) es justo el único código cp1252 visible-pero-vacío
 * del rango de continuación UTF-8. Por eso "Días" llega como "DÃas", con el
 * 0xAD perdido por el camino: cuando aparece un byte inicial huérfano se
 * reconstruye asumiendo que lo que faltaba era ese 0xAD.
 */
export function fixEncoding(input: string): string {
  if (!/[\u0080-\uffff]/.test(input)) return input;

  const chars = [...input];
  let out = '';

  for (let i = 0; i < chars.length; i++) {
    const byte = toByte(chars[i].codePointAt(0)!);

    if (byte === null || byte < 0xc2 || byte > 0xef) {
      out += chars[i];
      continue;
    }

    const needed = byte < 0xe0 ? 1 : 2;
    const tail: number[] = [];
    for (let k = 1; k <= needed; k++) {
      const b = i + k < chars.length ? toByte(chars[i + k].codePointAt(0)!) : null;
      if (b === null || b < 0x80 || b > 0xbf) break;
      tail.push(b);
    }

    if (tail.length === needed) {
      const decoded = decodeBytes([byte, ...tail]);
      if (decoded !== null) {
        out += decoded;
        i += needed;
        continue;
      }
    }

    // Secuencia rota: reconstruimos con el guion blando desaparecido.
    if (needed === 1) {
      const repaired = decodeBytes([byte, 0xad]);
      if (repaired !== null) {
        out += repaired;
        continue;
      }
    }

    out += chars[i];
  }

  return out;
}

/** Limpia espacios repetidos y de los extremos. */
export function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Clave de comparación de clientes: sin acentos, sin puntuación, en mayúsculas. */
export function clientKey(name: string): string {
  return normalizeSpace(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Convierte a número admitiendo formato español e inglés.
 * "1.234,56" y "1,234.56" dan lo mismo; "3682.54" y "25" también.
 *
 * **Un punto solo es siempre decimal.** El generador del PDF escribe las
 * toneladas sin separador de millares —`1955.82`, no `1.955,82`—, así que
 * cuando aparece un único punto lo que va detrás son décimas, por muchas que
 * sean: leer `538.744` como quinientos treinta y ocho mil es equivocarse por
 * mil. Varios puntos sí agrupan millares, porque un número no puede llevar dos
 * comas decimales.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Manda el separador que aparece más a la derecha.
    normalized =
      lastComma > lastDot
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Una sola coma: decimal, salvo que sea agrupación de miles (1,234).
    normalized = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    normalized = s.indexOf('.') === lastDot ? s : s.replace(/\./g, '');
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function isNumeric(raw: string): boolean {
  return parseNumber(raw) !== null;
}
