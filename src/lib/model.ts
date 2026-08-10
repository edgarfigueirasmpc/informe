/**
 * Modelo de datos del informe y toda la aritmética de simulación.
 *
 * Reglas acordadas:
 *  - El total de referencia de la fila superior es el que imprime el PDF
 *    ("Total mes"), no la suma de clientes: el PDF no cuadra y mandan sus totales.
 *  - Cada cliente vale la suma de sus dos quincenas (la columna "Total" del PDF
 *    se ignora porque tampoco cuadra).
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
  /** Suma de 1ª + 2ª quincena, por especie. */
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
  /** Días laborables restantes, si se quiere forzar otro escenario. */
  diasRestantes?: number;
}

export const EMPTY_OVERRIDES: Overrides = { clients: {} };

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

export interface ClientView {
  name: string;
  tn: Record<Species, number>;
  /** Suma de las tres especies. */
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
  /** Acumulado real del mes. No es simulable: es historia. */
  totalMes: number;
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
   * Las mismas tres magnitudes, pero sumando cliente a cliente en vez de
   * leerlas de la cabecera del PDF. No cuadran con las de arriba —el informe no
   * cuadra consigo mismo— y por eso se enseñan las dos: una es la que firma el
   * informe y la otra la que sale de sus propios datos.
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeView(report: Report, overrides: Overrides): ReportView {
  const { header } = report;
  const diasTrabajados = header.diasTrabajados || 1;
  const diasRestantes = overrides.diasRestantes ?? header.diasRestantes;
  const diasTotales = diasTrabajados + diasRestantes;

  const clients: ClientView[] = report.clients.map((c) => {
    const total = clientTotal(c);
    const mediaBase = total / diasTrabajados;
    const override = overrides.clients[c.name];
    const media = override !== undefined && Number.isFinite(override) ? override : mediaBase;
    const estimacionBase = mediaBase * diasTotales;
    const estimacion = media * diasTotales;
    const restanteEstimado = media * diasRestantes;
    return {
      name: c.name,
      tn: c.tn,
      total: round2(total),
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

  return {
    summary: {
      totalMes: header.totalMes,
      mediaBase,
      media,
      estimacionBase,
      estimacion,
      delta: estimacion - estimacionBase,
      diasTrabajados,
      diasRestantes,
      diasTotales,
      editado: clients.some((c) => c.editado) || overrides.diasRestantes !== undefined,

      // El acumulado es historia y no se mueve; la media y la estimación
      // sumadas sí reaccionan a las simulaciones, igual que las de la cabecera.
      sumaClientes: round2(report.clients.reduce((acc, c) => acc + clientTotal(c), 0)),
      mediaClientes: clients.reduce((acc, c) => acc + c.media, 0),
      estimacionClientes: clients.reduce((acc, c) => acc + c.estimacion, 0),
    },
    // Pino primero, y dentro por volumen descendente: lo que más pesa, arriba.
    clients: clients.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es')),
    speciesEnUso: speciesEnUso.length ? speciesEnUso : ['pino'],
  };
}

/**
 * Estado del cupo pendiente. Interpretación: el cupo pendiente son TN que
 * quedan por servir; si lo que se estima entregar en el resto del mes no llega,
 * el cupo se queda corto.
 */
export type CupoStatus = 'sin-cupo' | 'holgado' | 'justo' | 'corto';

export function cupoStatus(c: ClientView): CupoStatus {
  if (c.cupoRatio === null) return 'sin-cupo';
  if (c.cupoRatio >= 1.15) return 'holgado';
  if (c.cupoRatio >= 1) return 'justo';
  return 'corto';
}
