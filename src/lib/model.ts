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
    const totalBase = clientTotal(c);
    const mediaBase = totalBase / diasTrabajados;
    const override = overrides.clients[c.name];
    const media = override !== undefined && Number.isFinite(override) ? override : mediaBase;
    const estimacionBase = mediaBase * diasTotales;
    const estimacion = media * diasTotales;
    const restanteEstimado = media * diasRestantes;
    return {
      name: c.name,
      tn: c.tn,
      totalBase: round2(totalBase),
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

      // Las tres reaccionan a las simulaciones, porque la media simulada se
      // aplica a todo el mes, también a los días ya trabajados.
      // Redondeado porque ya no es una suma directa sino una recomposición
      // (media × días), y eso arrastra error de coma flotante: sin esto salen
      // 3872.5399999999995 donde el informe dice 3872,54.
      sumaClientes: round2(clients.reduce((acc, c) => acc + c.total, 0)),
      mediaClientes: clients.reduce((acc, c) => acc + c.media, 0),
      estimacionClientes: clients.reduce((acc, c) => acc + c.estimacion, 0),
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
