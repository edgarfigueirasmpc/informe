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
 * Los clientes y los tipos de madera salen de la cabecera del CSV, no de una
 * lista escrita aquí: añadir un cliente —o un tipo nuevo— a la hoja no obliga a
 * tocar el código. Tampoco hace falta que la hoja traiga los totales: se suman
 * desde el detalle, que es lo único que permite repartir por cliente.
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
  eucalipto: 'Eucalipto',
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
  costa_iberica: 'Costa Ibérica',
  navigator_setubal: 'Navigator Setúbal',
  navigator_foz: 'Navigator Foz',
  bosques: 'Bosques',
  clamadeiras: 'Clamadeiras',
  euromadeira: 'Euromadeira',
  unimadeiras: 'Unimadeiras',

  // Como se escribían en las primeras hojas. Se quedan para que los enlaces
  // repartidos entonces —que llevan el CSV de aquel día dentro— sigan
  // enseñando nombres y no identificadores.
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
 * De dónde salen los tipos de madera. Dos vías, y en este orden:
 *
 * 1. **Los que ya conocemos por su nombre** —los de `ETIQUETAS_TIPO`— se
 *    reconocen, no se deducen. Es lo que evita que un mes en el que la rolla
 *    gorda sólo tenga un cliente se lea «rolla» + «gorda castro».
 * 2. **El resto se deduce de la forma de la cabecera**, mirando dónde se abren
 *    los nombres en abanico:
 *
 *        puntal_viana  puntal_finsa  puntal_kronospan  -> `puntal` se abre en tres
 *        rolla_gorda_castro  rolla_gorda_lamelas       -> `rolla` sólo sigue por
 *                                                         `gorda`; el corte va
 *                                                         detrás de `rolla_gorda`
 *
 *    Se baja mientras el nombre no tenga más que un camino por delante y se
 *    para en cuanto se abre o en cuanto algún cliente termina ahí. Como el
 *    último trozo no se consume nunca, un `tabla_costa_iberica` solitario se
 *    lee «tabla» + «costa ibérica», y no «tabla costa» + «ibérica».
 *
 * Lo que **no** hace falta para nada es que la hoja traiga columnas de totales:
 * los totales son justo lo que sobra, porque el programa los suma. Una hoja que
 * los lleve se entra igual, y si no cuadran con el detalle se avisa.
 */
const METADATOS = ['anio', 'mes', 'notas'];

/** Las columnas que llevan toneladas, sin los totales ni los porcentajes. */
function esDetalle(cabecera: string): boolean {
  return (
    !METADATOS.includes(cabecera) &&
    !cabecera.startsWith('total_') &&
    !cabecera.startsWith('porcentaje_') &&
    cabecera.includes('_')
  );
}

/** Lo que cuelga de un nombre a medio leer: cuántos acaban ahí y por dónde sigue. */
function ramas(sufijos: string[][]) {
  let hojas = 0;
  const grupos = new Map<string, string[][]>();

  for (const sufijo of sufijos) {
    if (sufijo.length <= 1) {
      hojas += 1;
      continue;
    }
    const grupo = grupos.get(sufijo[0]) ?? [];
    grupo.push(sufijo.slice(1));
    grupos.set(sufijo[0], grupo);
  }

  return { hojas, grupos, caminos: hojas + grupos.size };
}

/** Los tipos que salen de mirar por dónde se abre la cabecera. */
function tiposDeducidos(columnas: string[]): string[] {
  const tipos: string[] = [];

  function bajar(prefijo: string[], sufijos: string[][]) {
    const { hojas, grupos } = ramas(sufijos);

    if (prefijo.length > 0) {
      const [unico] = [...grupos.values()];
      // El nombre del tipo sigue sólo si no hay más que un camino y lo que hay
      // detrás se abre de verdad: si no, lo que queda es el nombre del cliente.
      const sigue = hojas === 0 && grupos.size === 1 && ramas(unico).caminos > 1;
      if (!sigue) {
        tipos.push(prefijo.join('_'));
        return;
      }
    }

    for (const [cabeza, resto] of grupos) bajar([...prefijo, cabeza], resto);
  }

  bajar([], columnas.map((columna) => columna.split('_')));
  return tipos;
}

function tiposDeLaCabecera(cabeceras: string[]): string[] {
  const detalle = cabeceras.filter(esDetalle);
  const empieza = (columna: string, tipo: string) => columna.startsWith(`${tipo}_`);

  const conocidos = Object.keys(ETIQUETAS_TIPO).filter((tipo) =>
    detalle.some((columna) => empieza(columna, tipo)),
  );
  const porDeducir = detalle.filter(
    (columna) => !conocidos.some((tipo) => empieza(columna, tipo)),
  );

  // Se devuelven en el orden en que aparecen en la hoja: es el que ha elegido
  // quien la mantiene y el que se verá en los filtros y en la matriz.
  return [...new Set([...conocidos, ...tiposDeducidos(porDeducir)])].sort(
    (a, b) =>
      detalle.findIndex((columna) => empieza(columna, a)) -
      detalle.findIndex((columna) => empieza(columna, b)),
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
    if (!esDetalle(cabecera)) return;

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
      'No se han encontrado columnas de cliente. Se esperan columnas con el tipo de ' +
        'madera por delante, del estilo de «puntal_finsa» o «rolla_gorda_lamelas».',
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
