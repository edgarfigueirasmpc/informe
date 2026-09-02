/**
 * Modelo de datos del informe y toda la aritmética de simulación.
 *
 * Reglas acordadas:
 *  - El resumen principal suma los clientes activos; los valores de la cabecera
 *    del PDF se conservan como contraste y trazabilidad.
 *  - Cada cliente toma exclusivamente la columna "Total" del PDF. Las dos
 *    quincenas se ignoran.
 *  - Al editar un cliente sólo se propaga la diferencia respecto a su valor
 *    original, igual que en el cálculo a mano: 15.464 + (3.780 − 1.260) = 17.984.
 */

export type Species = 'pino' | 'eucalipto' | 'otras';

export const SPECIES: Species[] = ['pino', 'eucalipto', 'otras'];

export const SPECIES_LABEL: Record<Species, string> = {
  pino: 'Pino',
  eucalipto: 'Eucalipto',
  otras: 'Otras',
};

/** Fila de cliente tal y como sale del PDF, ya agregada por especie. */
export interface ClientRecord {
  name: string;
  /** Columna "Total" del PDF, agregada por especie. */
  tn: Record<Species, number>;
  /** Columna "TN/Pendientes Cupo". null cuando el PDF no trae valor. */
  cupoPendiente: number | null;
}

/** Cabecera del PDF. Son los números que mandan. */
export interface ReportHeader {
  desde: string;
  hasta: string;
  diasTrabajados: number;
  diasRestantes: number;
  totalMes: number;
  totalDiaAnterior: number;
  mediaDia: number;
  /**
   * El PDF lo etiqueta "Estimado restante" pero el número que imprime es la
   * estimación del mes completo (media × días laborables totales). Lo tratamos
   * como tal, que es lo que dice el boceto.
   */
  estimacionMes: number;
}

/** Informe completo, tal cual se guarda en KV y se sirve a los compañeros. */
export interface Report {
  header: ReportHeader;
  clients: ClientRecord[];
  /** ISO 8601. Cuándo se subió el PDF. */
  publishedAt: string;
  /** Nombre del PDF de origen, para poder rastrear el dato. */
  sourceFile: string;
}

/** Ajustes manuales del usuario. Clave = nombre del cliente. */
export interface Overrides {
  /** TN/día simuladas por cliente. */
  clients: Record<string, number>;
  /** Clientes visibles que no participan en los totales calculados. */
  excludedClients?: string[];
  /** Días laborables restantes, si se quiere forzar otro escenario. */
  diasRestantes?: number;
}

export const EMPTY_OVERRIDES: Overrides = { clients: {}, excludedClients: [] };

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

export interface ClientView {
  name: string;
  /** Si participa en las cifras "Sumando clientes". */
  activo: boolean;
  /** Desglose por especie tal cual viene del PDF. No se simula. */
  tn: Record<Species, number>;
  /** Suma de las tres especies: el acumulado que imprime el informe. */
  totalBase: number;
  /**
   * Acumulado en uso: media en uso × días trabajados. Coincide con `totalBase`
   * mientras no se simule.
   *
   * Que el acumulado se mueva al simular no es un descuido, es la aritmética
   * del informe en papel: allí la estimación de Finsa a 180 TN/día era
   * 180 × 21 = 3.780, los 21 días del mes y no sólo los que faltan. Es decir,
   * la media simulada se aplica también a los días ya trabajados.
   */
  total: number;
  /** TN/día reales según el acumulado del PDF. */
  mediaBase: number;
  /** TN/día en uso (simuladas si hay override). */
  media: number;
  /** Estimación mensual con la media base. */
  estimacionBase: number;
  /** Estimación mensual con la media en uso. */
  estimacion: number;
  /** estimacion − estimacionBase. 0 si no hay override. */
  delta: number;
  editado: boolean;
  cupoPendiente: number | null;
  /** TN que se estima entregar en lo que queda de mes. */
  restanteEstimado: number;
  /**
   * Cobertura del cupo pendiente con lo que queda de mes.
   * null cuando el cliente no tiene cupo pendiente informado.
   */
  cupoRatio: number | null;
}

export interface SummaryView {
  /** Acumulado original que figura en la cabecera del PDF. */
  totalMes: number;
  /** Estimación que figura literalmente en la cabecera del PDF. */
  estimacionInforme: number;
  mediaBase: number;
  media: number;
  estimacionBase: number;
  estimacion: number;
  delta: number;
  diasTrabajados: number;
  diasRestantes: number;
  diasTotales: number;
  editado: boolean;

  /**
   * Las tres magnitudes principales del resumen, sumando únicamente los
   * clientes activos. Pueden diferir de la cabecera original del PDF.
   */
  sumaClientes: number;
  mediaClientes: number;
  estimacionClientes: number;
}

export interface ReportView {
  summary: SummaryView;
  clients: ClientView[];
  /** Especies con algún dato distinto de cero; las demás no se muestran. */
  speciesEnUso: Species[];
}

export function clientTotal(c: ClientRecord): number {
  return SPECIES.reduce((acc, s) => acc + (c.tn[s] || 0), 0);
}

/**
 * Quita el ruido de la coma flotante sin tocar el dato al sumar los totales de
 * varias especies. Se redondea a tres decimales y no a dos, porque el tercer
 * decimal del origen son kilos que sí están contados.
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeView(report: Report, overrides: Overrides): ReportView {
  const { header } = report;
  const diasTrabajados = header.diasTrabajados || 1;
  const diasRestantes = overrides.diasRestantes ?? header.diasRestantes;
  const diasTotales = diasTrabajados + diasRestantes;
  const excluidos = new Set(overrides.excludedClients ?? []);

  const clients: ClientView[] = report.clients.map((c) => {
    const totalBase = clientTotal(c);
    const mediaBase = totalBase / diasTrabajados;
    const override = overrides.clients[c.name];
    const media = override !== undefined && Number.isFinite(override) ? override : mediaBase;
    const estimacionBase = mediaBase * diasTotales;
    const estimacion = media * diasTotales;
    const restanteEstimado = media * diasRestantes;
    return {
      name: c.name,
      activo: !excluidos.has(c.name),
      tn: c.tn,
      totalBase: round3(totalBase),
      total: media * diasTrabajados,
      mediaBase,
      media,
      estimacionBase,
      estimacion,
      delta: estimacion - estimacionBase,
      editado: override !== undefined && override !== mediaBase,
      cupoPendiente: c.cupoPendiente,
      restanteEstimado,
      cupoRatio:
        c.cupoPendiente && c.cupoPendiente > 0 ? restanteEstimado / c.cupoPendiente : null,
    };
  });

  const deltaMedia = clients.reduce((acc, c) => acc + (c.media - c.mediaBase), 0);
  const mediaBase = header.mediaDia || header.totalMes / diasTrabajados;
  const media = mediaBase + deltaMedia;

  // La estimación base se recalcula en vez de usar la del PDF para que
  // responda al número de días laborables cuando se simula con otro calendario.
  const estimacionBase = mediaBase * diasTotales;
  const estimacion = media * diasTotales;

  const speciesEnUso = SPECIES.filter((s) =>
    report.clients.some((c) => (c.tn[s] || 0) !== 0),
  );
  const clientsActivos = clients.filter((c) => c.activo);

  return {
    summary: {
      totalMes: header.totalMes,
      estimacionInforme: header.estimacionMes,
      mediaBase,
      media,
      estimacionBase,
      estimacion,
      delta: estimacion - estimacionBase,
      diasTrabajados,
      diasRestantes,
      diasTotales,
      editado:
        clients.some((c) => c.editado) ||
        overrides.diasRestantes !== undefined ||
        excluidos.size > 0,

      // Las tres reaccionan a las simulaciones, porque la media simulada se
      // aplica a todo el mes, también a los días ya trabajados.
      // Redondeado porque ya no es una suma directa sino una recomposición
      // (media × días), y eso arrastra error de coma flotante: sin esto salen
      // 3872.5399999999995 donde el informe dice 3872,54.
      sumaClientes: round3(clientsActivos.reduce((acc, c) => acc + c.total, 0)),
      mediaClientes: clientsActivos.reduce((acc, c) => acc + c.media, 0),
      estimacionClientes: clientsActivos.reduce((acc, c) => acc + c.estimacion, 0),
    },
    // Orden de partida: lo que más pesa, arriba. La tabla puede cambiarlo.
    clients: ordenarClientes(clients, ORDEN_POR_DEFECTO),
    speciesEnUso: speciesEnUso.length ? speciesEnUso : ['pino'],
  };
}

// ---------------------------------------------------------------------------
// Ordenación
// ---------------------------------------------------------------------------

export type CampoOrden = 'nombre' | Species | 'total' | 'media' | 'estimacion' | 'cupo';

export interface Orden {
  campo: CampoOrden;
  /** De mayor a menor. Es lo que se quiere casi siempre con toneladas. */
  desc: boolean;
}

export const ORDEN_POR_DEFECTO: Orden = { campo: 'total', desc: true };

function valorDe(c: ClientView, campo: CampoOrden): number | null {
  switch (campo) {
    case 'nombre':
      return null;
    case 'total':
      return c.total;
    case 'media':
      return c.media;
    case 'estimacion':
      return c.estimacion;
    case 'cupo':
      return c.cupoPendiente;
    default:
      return c.tn[campo] || 0;
  }
}

/**
 * Ordena sin tocar el original. Los clientes sin cupo van siempre al final,
 * suba o baje la columna: un hueco no es ni mucho ni poco, y mezclarlo con los
 * ceros haría creer que tienen cupo agotado.
 */
export function ordenarClientes(clients: ClientView[], orden: Orden): ClientView[] {
  const signo = orden.desc ? -1 : 1;

  return [...clients].sort((a, b) => {
    if (orden.campo === 'nombre') {
      return signo * a.name.localeCompare(b.name, 'es');
    }

    const va = valorDe(a, orden.campo);
    const vb = valorDe(b, orden.campo);

    if (va === null && vb === null) return a.name.localeCompare(b.name, 'es');
    if (va === null) return 1;
    if (vb === null) return -1;

    // A igualdad de cifra, alfabético: así el orden no baila entre repintados.
    return signo * (va - vb) || a.name.localeCompare(b.name, 'es');
  });
}

/**
 * Estado actual del cupo. El objetivo se reconstruye con el acumulado original
 * más las toneladas que el informe marca como pendientes. Se compara contra el
 * total actual, nunca contra la estimación de fin de mes.
 */
export type CupoStatus = 'sin-cupo' | 'cubierto' | 'pendiente';

export function cupoStatus(c: ClientView): CupoStatus {
  if (c.cupoPendiente === null) return 'sin-cupo';
  const objetivo = c.totalBase + c.cupoPendiente;
  return c.total >= objetivo ? 'cubierto' : 'pendiente';
}
