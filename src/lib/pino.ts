/**
 * Pino por cliente: el CSV mensual con el desglose cruzado de **tipo de madera
 * × cliente de destino**.
 *
 * A diferencia del histórico —una serie de totales— aquí cada mes es una
 * matriz, y todas las preguntas del negocio son cocientes sobre ella:
 *
 *   · de un tipo de madera, ¿qué parte se llevó un cliente?      celda / tipo
 *   · de todo lo que compró un cliente, ¿qué parte fue cada tipo? celda / cliente
 *   · ¿qué peso tuvo un mes dentro de su año?                     mes / año
 *
 * Por eso lo que se guarda es la matriz en crudo y no los totales: cualquier
 * total se vuelve a sumar a partir de las celdas, y así los porcentajes cuadran
 * siempre entre sí, sea cual sea el filtro puesto.
 *
 * Los tipos de madera y los clientes **no están escritos aquí**: se descubren
 * leyendo la cabecera del CSV. Añadir un cliente nuevo a la hoja no obliga a
 * tocar el código.
 */

import {
  MESES,
  lineasDelCsv,
  mesDesdeTexto,
  normalizar,
  numero,
  parseRow,
  separadorDe,
} from './csv';

export interface PinoTipo {
  id: string;
  label: string;
}

export interface PinoCliente {
  id: string;
  label: string;
}

export interface PinoRecord {
  anio: number;
  mes: string;
  mesIndex: number;
  /** `tn[tipo][cliente]`. Sólo las celdas con toneladas: lo ausente es cero. */
  tn: Record<string, Record<string, number>>;
  /** Suma de todas las celdas del mes. */
  total: number;
  /** El total que trae la propia hoja, para poder avisar si no cuadra. */
  totalDeclarado: number | null;
  notas: string;
}

export interface PinoDataset {
  registros: PinoRecord[];
  tipos: PinoTipo[];
  clientes: PinoCliente[];
  anios: number[];
  /** Los clientes que declara cada tipo, en el orden de las columnas. */
  clientesPorTipo: Record<string, string[]>;
}

/** El mes elegido en la gráfica. */
export interface PinoMes {
  anio: number;
  mesIndex: number;
}

/** Sobre qué se calculan los porcentajes de la matriz. */
export type PinoBase = 'tipo' | 'cliente' | 'total';

export interface PinoOptions {
  aniosVisibles: number[];
  tipoFoco: string | null;
  clienteFoco: string | null;
  mesFoco: PinoMes | null;
  base: PinoBase;
}

export interface SharedPino {
  csv: string;
  sourceName: string;
  options: PinoOptions;
}

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

const ETIQUETAS_TIPO: Record<string, string> = {
  puntal: 'Puntal',
  canter: 'Canter',
  rolla_gorda: 'Rolla gorda',
};

const ETIQUETAS_CLIENTE: Record<string, string> = {
  viana: 'Viana',
  finsa: 'Finsa',
  kronospan: 'Kronospan',
  intasa: 'Intasa',
  tome: 'Tomé',
  castro: 'Castro',
  ecos_largos: 'Ecos Largos',
  rodriguez: 'Rodríguez',
  lamelas: 'Lamelas',
  claradeiras: 'Claradeiras',
  europadeira: 'Europadeira',
  unidadeiras: 'Unidadeiras',
};

/**
 * En la rolla gorda la columna viene abreviada como `ecos`, pero el cliente es
 * el mismo de `canter_ecos_largos`: Ecos Largos es su nombre completo y
 * «canter» y «rolla gorda» son tipos de madera, no apellidos.
 */
const ALIAS_CLIENTE: Record<string, string> = { ecos: 'ecos_largos' };

/** `rolla_gorda` -> `Rolla gorda`, para lo que no esté en las tablas de arriba. */
function titular(id: string): string {
  const texto = id.replace(/_/g, ' ');
  return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
}

export const etiquetaTipo = (id: string) => ETIQUETAS_TIPO[id] ?? titular(id);
export const etiquetaCliente = (id: string) => ETIQUETAS_CLIENTE[id] ?? titular(id);

// ---------------------------------------------------------------------------
// Lectura del CSV
// ---------------------------------------------------------------------------

/**
 * Los tipos de madera se deducen de las columnas `total_<tipo>_calculado`, y se
 * quedan sólo los que además tienen columnas de detalle `<tipo>_<cliente>`. Así
 * `total_pino_calculado` —que es el gran total y no un tipo— se cae solo, sin
 * necesidad de tenerlo escrito en una lista negra.
 */
function tiposDeLaCabecera(cabeceras: string[]): string[] {
  const candidatos = cabeceras
    .map((cabecera) => /^total_(.+)_calculado$/.exec(cabecera)?.[1])
    .filter((id): id is string => Boolean(id));

  return [...new Set(candidatos)].filter((id) =>
    cabeceras.some(
      (cabecera) =>
        cabecera.startsWith(`${id}_`) &&
        !cabecera.startsWith('total_') &&
        !cabecera.startsWith('porcentaje_'),
    ),
  );
}

interface Columna {
  indice: number;
  tipo: string;
  cliente: string;
}

function columnasDeDetalle(cabeceras: string[], tipos: string[]): Columna[] {
  const columnas: Columna[] = [];

  cabeceras.forEach((cabecera, indice) => {
    if (cabecera.startsWith('total_') || cabecera.startsWith('porcentaje_')) return;

    // Gana el prefijo más largo, por si algún día un tipo es prefijo de otro.
    const tipo = tipos
      .filter((id) => cabecera.startsWith(`${id}_`))
      .sort((a, b) => b.length - a.length)[0];
    if (!tipo) return;

    const bruto = cabecera.slice(tipo.length + 1);
    if (!bruto) return;
    columnas.push({ indice, tipo, cliente: ALIAS_CLIENTE[bruto] ?? bruto });
  });

  return columnas;
}

export function parsePinoCsv(csv: string): PinoDataset {
  const lineas = lineasDelCsv(csv);
  if (lineas.length < 2) throw new Error('El CSV no contiene datos de pino por cliente.');

  const separador = separadorDe(lineas[0]);
  const cabeceras = parseRow(lineas[0], separador).map(normalizar);
  const indice = (nombre: string) => cabeceras.indexOf(nombre);

  if (indice('anio') === -1 || indice('mes') === -1) {
    throw new Error('El CSV debe incluir las columnas anio y mes.');
  }

  const tiposIds = tiposDeLaCabecera(cabeceras);
  const columnas = columnasDeDetalle(cabeceras, tiposIds);

  if (columnas.length === 0) {
    throw new Error(
      'No se han encontrado columnas de cliente. Se esperan columnas del tipo ' +
        '«puntal_finsa» junto a su «total_puntal_calculado».',
    );
  }

  const registros: PinoRecord[] = [];

  for (const linea of lineas.slice(1)) {
    const celdas = parseRow(linea, separador);
    const anio = numero(celdas[indice('anio')]);
    const mesIndex = mesDesdeTexto(celdas[indice('mes')] ?? '');
    if (anio === null || mesIndex < 0) continue;

    const tn: Record<string, Record<string, number>> = {};
    let total = 0;
    let hayDato = false;

    for (const columna of columnas) {
      const valor = numero(celdas[columna.indice]);
      if (valor === null) continue;
      hayDato = true;
      // Los ceros no se guardan: un cliente que no compró un tipo ese mes no
      // tiene que ocupar sitio ni aparecer en las leyendas.
      if (valor <= 0) continue;
      (tn[columna.tipo] ??= {})[columna.cliente] =
        (tn[columna.tipo]?.[columna.cliente] ?? 0) + valor;
      total += valor;
    }

    // Los meses futuros de la hoja vienen en blanco: son huecos, no ceros.
    if (!hayDato) continue;

    registros.push({
      anio,
      mes: MESES[mesIndex],
      mesIndex,
      tn,
      total,
      totalDeclarado: indice('total_pino_calculado') === -1
        ? null
        : numero(celdas[indice('total_pino_calculado')]),
      notas: indice('notas') === -1 ? '' : (celdas[indice('notas')] ?? '').trim(),
    });
  }

  if (registros.length === 0) throw new Error('No se ha encontrado ninguna fila con toneladas.');

  registros.sort((a, b) => a.anio - b.anio || a.mesIndex - b.mesIndex);

  // Los clientes se listan en el orden en que aparecen las columnas, que es el
  // de la hoja: quien la mantiene ya los tiene puestos en un orden con sentido.
  const clientesPorTipo: Record<string, string[]> = {};
  for (const tipo of tiposIds) clientesPorTipo[tipo] = [];
  const clientes: string[] = [];

  for (const columna of columnas) {
    const lista = clientesPorTipo[columna.tipo];
    if (lista && !lista.includes(columna.cliente)) lista.push(columna.cliente);
    if (!clientes.includes(columna.cliente)) clientes.push(columna.cliente);
  }

  return {
    registros,
    tipos: tiposIds.map((id) => ({ id, label: etiquetaTipo(id) })),
    clientes: clientes.map((id) => ({ id, label: etiquetaCliente(id) })),
    anios: [...new Set(registros.map((registro) => registro.anio))].sort((a, b) => a - b),
    clientesPorTipo,
  };
}

// ---------------------------------------------------------------------------
// Agregación
//
// Un único sumador para todo. Cada panel de la vista pide el mismo resumen con
// distintos filtros, de modo que ningún porcentaje se calcula dos veces por
// caminos distintos.
// ---------------------------------------------------------------------------

export interface PinoFiltro {
  tipo?: string | null;
  cliente?: string | null;
}

export interface PinoResumen {
  total: number;
  porTipo: Record<string, number>;
  porCliente: Record<string, number>;
  /** `matriz[tipo][cliente]`, ya filtrada. */
  matriz: Record<string, Record<string, number>>;
}

export function resumir(registros: PinoRecord[], filtro: PinoFiltro = {}): PinoResumen {
  const resumen: PinoResumen = { total: 0, porTipo: {}, porCliente: {}, matriz: {} };

  for (const registro of registros) {
    for (const [tipo, porCliente] of Object.entries(registro.tn)) {
      if (filtro.tipo && tipo !== filtro.tipo) continue;

      for (const [cliente, valor] of Object.entries(porCliente)) {
        if (filtro.cliente && cliente !== filtro.cliente) continue;

        resumen.total += valor;
        resumen.porTipo[tipo] = (resumen.porTipo[tipo] ?? 0) + valor;
        resumen.porCliente[cliente] = (resumen.porCliente[cliente] ?? 0) + valor;
        (resumen.matriz[tipo] ??= {})[cliente] = (resumen.matriz[tipo]?.[cliente] ?? 0) + valor;
      }
    }
  }

  return resumen;
}

/** Las toneladas de un mes concreto, con los filtros de tipo y cliente puestos. */
export function toneladas(registros: PinoRecord[], filtro: PinoFiltro = {}): number {
  return resumir(registros, filtro).total;
}

export const mismoMes = (a: PinoMes | null, b: PinoMes | null) =>
  a !== null && b !== null && a.anio === b.anio && a.mesIndex === b.mesIndex;

export const esMes = (registro: PinoRecord, mes: PinoMes | null) =>
  mes !== null && registro.anio === mes.anio && registro.mesIndex === mes.mesIndex;

/** Cociente a prueba de divisiones por cero: sin base no hay porcentaje. */
export function cuota(parte: number, total: number): number | null {
  return total > 0 ? parte / total : null;
}

/** Al abrir sin más se enseñan los últimos años, que son los que se comparan. */
export function defaultPinoOptions(anios: number[]): PinoOptions {
  return {
    aniosVisibles: anios.slice(-3),
    tipoFoco: null,
    clienteFoco: null,
    mesFoco: null,
    base: 'tipo',
  };
}

/**
 * Un enlace puede traer filtros que este CSV no conoce —otra hoja, otro año,
 * un cliente que ya no está—. En vez de enseñar una vista vacía sin explicar
 * por qué, se descartan los focos imposibles y se abre por lo que sí existe.
 */
export function sanearOpciones(dataset: PinoDataset, options: PinoOptions): PinoOptions {
  const visibles = options.aniosVisibles.filter((anio) => dataset.anios.includes(anio));
  const aniosVisibles =
    visibles.length > 0 ? visibles : defaultPinoOptions(dataset.anios).aniosVisibles;

  const conservado = <T extends { id: string }>(lista: T[], id: string | null) =>
    id !== null && lista.some((elemento) => elemento.id === id) ? id : null;

  const mesFoco =
    options.mesFoco !== null &&
    aniosVisibles.includes(options.mesFoco.anio) &&
    dataset.registros.some((registro) => esMes(registro, options.mesFoco))
      ? options.mesFoco
      : null;

  return {
    aniosVisibles,
    tipoFoco: conservado(dataset.tipos, options.tipoFoco),
    clienteFoco: conservado(dataset.clientes, options.clienteFoco),
    mesFoco,
    base: options.base,
  };
}
