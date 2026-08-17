import { useEffect, useMemo, useRef, useState } from 'react';
import { MESES_CORTOS } from '../lib/csv';
import { cuotaPct, tn, tnRedondo } from '../lib/format';
import {
  cuota,
  esMes,
  etiquetaCliente,
  etiquetaTipo,
  mismoMes,
  resumir,
  toneladas,
  type PinoBase,
  type PinoDataset,
  type PinoFiltro,
  type PinoMes,
  type PinoRecord,
} from '../lib/pino';

/**
 * Los dibujos de «Pino por cliente». Todos leen los mismos registros ya
 * filtrados y ninguno guarda estado del negocio: lo que se ve depende sólo de
 * las opciones que baja la vista, de modo que los porcentajes de un panel y los
 * del de al lado no pueden discrepar.
 */

// ---------------------------------------------------------------------------
// Color
//
// Tres tonos validados para daltonismo sobre las dos superficies de la app (ver
// `--pc-*` en styles.css). El color va con el tipo de madera, nunca con el
// puesto que ocupe: al filtrar, lo que sobrevive conserva su tono.
// ---------------------------------------------------------------------------

const COLORES_TIPO = [
  'var(--pc-1)',
  'var(--pc-2)',
  'var(--pc-3)',
  'var(--pc-4)',
  'var(--pc-5)',
];

export const colorDeTipo = (dataset: PinoDataset, tipo: string) =>
  COLORES_TIPO[Math.max(0, dataset.tipos.findIndex((actual) => actual.id === tipo)) % COLORES_TIPO.length];

/**
 * Los clientes de un mismo tipo se escalonan sobre el tono de ese tipo. Es una
 * rampa ordenada, no una paleta: quien distingue de verdad a los clientes es la
 * leyenda, y el tono sólo dice de qué madera se está hablando.
 */
export function pasoDeRampa(color: string, indice: number, total: number): string {
  if (total <= 1 || indice <= 0) return color;
  const mezcla = 100 - (indice / (total - 1)) * 52;
  return `color-mix(in oklab, ${color} ${mezcla.toFixed(1)}%, var(--ink))`;
}

export interface Serie {
  clave: string;
  label: string;
  color: string;
  filtro: PinoFiltro;
}

/**
 * De qué se compone cada barra. El desglose sigue al foco en vez de pedir otro
 * mando: sin foco se apilan los tipos de madera; con un tipo elegido, sus
 * clientes; con un cliente elegido, las maderas que se le mandaron.
 */
export function seriesDe(
  dataset: PinoDataset,
  tipoFoco: string | null,
  clienteFoco: string | null,
): Serie[] {
  if (tipoFoco && clienteFoco) {
    return [
      {
        clave: `${tipoFoco}|${clienteFoco}`,
        label: `${etiquetaTipo(tipoFoco)} · ${etiquetaCliente(clienteFoco)}`,
        color: colorDeTipo(dataset, tipoFoco),
        filtro: { tipo: tipoFoco, cliente: clienteFoco },
      },
    ];
  }

  if (tipoFoco) {
    const clientes = dataset.clientesPorTipo[tipoFoco] ?? [];
    const color = colorDeTipo(dataset, tipoFoco);
    return clientes.map((cliente, indice) => ({
      clave: cliente,
      label: etiquetaCliente(cliente),
      color: pasoDeRampa(color, indice, clientes.length),
      filtro: { tipo: tipoFoco, cliente },
    }));
  }

  return dataset.tipos.map((tipo) => ({
    clave: tipo.id,
    label: tipo.label,
    color: colorDeTipo(dataset, tipo.id),
    filtro: clienteFoco ? { tipo: tipo.id, cliente: clienteFoco } : { tipo: tipo.id },
  }));
}

// ---------------------------------------------------------------------------
// Utilidades de dibujo
// ---------------------------------------------------------------------------

/** Ancho del contenedor, para que los SVG se adapten sin puntos de ruptura. */
function useAncho(inicial = 900) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(inicial);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const medir = () => setAncho(Math.max(260, elemento.clientWidth));
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);

  return [ref, ancho] as const;
}

/** Un paso de eje que dé números redondos y unas cinco marcas. */
function pasoDeEje(maximo: number): number {
  const escalas = [10, 25, 50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  const objetivo = maximo / 5;
  return escalas.find((escala) => escala >= objetivo) ?? escalas[escalas.length - 1];
}

const etiquetaDeEje = (valor: number) =>
  valor >= 1000 && valor % 1000 === 0 ? `${valor / 1000} mil` : tnRedondo(valor);

/** Barra con el extremo de dato redondeado y la base a escuadra sobre el eje. */
function caminoBarra(x: number, y: number, ancho: number, alto: number, radio: number): string {
  const r = Math.max(0, Math.min(radio, ancho / 2, alto));
  return [
    `M ${x} ${y + alto}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + ancho - r} ${y}`,
    `Q ${x + ancho} ${y} ${x + ancho} ${y + r}`,
    `L ${x + ancho} ${y + alto}`,
    'Z',
  ].join(' ');
}

/** El hueco de superficie que separa dos marcas que se tocan. */
const HUECO = 2;

// ---------------------------------------------------------------------------
// Barras mensuales: los años y los meses a la vez
// ---------------------------------------------------------------------------

interface BarrasProps {
  registros: PinoRecord[];
  anios: number[];
  series: Serie[];
  filtro: PinoFiltro;
  mesFoco: PinoMes | null;
  onMes: (mes: PinoMes | null) => void;
}

export function PinoBarras({ registros, anios, series, filtro, mesFoco, onMes }: BarrasProps) {
  const [contenedorRef, ancho] = useAncho();
  const [sobre, setSobre] = useState<PinoMes | null>(null);

  const movil = ancho < 620;
  const alto = movil ? 300 : 380;
  const margen = { arriba: 34, derecha: 12, abajo: 46, izquierda: movil ? 46 : 62 };
  const plotAncho = Math.max(40, ancho - margen.izquierda - margen.derecha);
  const plotAlto = alto - margen.arriba - margen.abajo;

  // Un hueco de mes y medio entre años: se leen como grupos sin necesidad de
  // recuadros ni fondos de color.
  const SEPARACION = 1.5;
  const unidad = plotAncho / Math.max(1, anios.length * 12 + (anios.length - 1) * SEPARACION);
  const anchoBarra = Math.max(3, Math.min(24, unidad * 0.7));

  const totales = useMemo(
    () => new Map(registros.map((registro) => [`${registro.anio}-${registro.mesIndex}`, toneladas([registro], filtro)])),
    [registros, filtro],
  );
  const totalDe = (registro: PinoRecord) => totales.get(`${registro.anio}-${registro.mesIndex}`) ?? 0;

  const maximo = Math.max(1, ...registros.map(totalDe));
  const paso = pasoDeEje(maximo);
  const yMax = Math.max(paso, Math.ceil(maximo / paso) * paso);
  const y = (valor: number) => margen.arriba + (1 - valor / yMax) * plotAlto;
  const marcas = Array.from({ length: Math.round(yMax / paso) + 1 }, (_, i) => paso * i);

  const inicioAnio = (indice: number) => indice * (12 + SEPARACION);
  const x = (indiceAnio: number, mes: number) =>
    margen.izquierda + (inicioAnio(indiceAnio) + mes + 0.5) * unidad;

  // Con muy poco sitio las etiquetas de mes se pisan: primero se recortan a la
  // inicial y, en un móvil, se rotulan sólo los trimestres. Quedarse sin
  // ninguna no es opción: sin ellas no se sabe qué barra se está mirando.
  const etiquetaMes = unidad >= 26 ? 'corta' : unidad >= 11 ? 'inicial' : 'trimestral';
  const rotulado = (mesIndex: number) => etiquetaMes !== 'trimestral' || mesIndex % 3 === 0;

  const totalPeriodo = registros.reduce((suma, registro) => suma + totalDe(registro), 0);
  const totalDelAnio = (anio: number) =>
    registros
      .filter((registro) => registro.anio === anio)
      .reduce((suma, registro) => suma + totalDe(registro), 0);

  const activo = sobre ?? mesFoco;
  const registroActivo = registros.find((registro) => esMes(registro, activo)) ?? null;

  return (
    <div className="pino__panel">
      <div className="pino__panel-cabecera">
        <div>
          <p className="eyebrow">Toneladas mes a mes</p>
          <h3 className="pino__panel-titulo">Todos los años y todos los meses</h3>
        </div>
        <Leyenda series={series} />
      </div>

      <p className="pino__lectura" aria-live="polite">
        {registroActivo ? (
          <>
            <strong>
              {registroActivo.mes} {registroActivo.anio}
            </strong>
            <span className="num">{tn(totalDe(registroActivo))} TN</span>
            <span>
              {cuotaPct(cuota(totalDe(registroActivo), totalDelAnio(registroActivo.anio)))} de{' '}
              {registroActivo.anio}
            </span>
            <span>{cuotaPct(cuota(totalDe(registroActivo), totalPeriodo))} del periodo</span>
            {mismoMes(mesFoco, activo) && <span className="pino__lectura-fijado">Mes fijado</span>}
          </>
        ) : (
          <span className="pino__lectura-vacia">
            Pasa por una barra para leerla; púlsala para fijar ese mes en el resto de paneles.
          </span>
        )}
      </p>

      <div ref={contenedorRef} className="pino__svg-wrap">
        <svg
          className="pino__svg"
          viewBox={`0 0 ${ancho} ${alto}`}
          role="img"
          aria-label="Toneladas por mes, agrupadas por año"
        >
          <text
            className="pino__eje-unidad"
            x={margen.izquierda - 8}
            y={margen.arriba - 12}
            textAnchor="end"
          >
            TN
          </text>

          {marcas.map((valor) => (
            <g key={valor}>
              <line
                className="pino__rejilla"
                x1={margen.izquierda}
                x2={ancho - margen.derecha}
                y1={y(valor)}
                y2={y(valor)}
              />
              <text
                className="pino__eje-texto"
                x={margen.izquierda - 8}
                y={y(valor) + 4}
                textAnchor="end"
              >
                {etiquetaDeEje(valor)}
              </text>
            </g>
          ))}

          {anios.map((anio, indiceAnio) => (
            <g key={`anio-${anio}`}>
              {indiceAnio > 0 && (
                <line
                  className="pino__separador"
                  x1={margen.izquierda + (inicioAnio(indiceAnio) - SEPARACION / 2) * unidad}
                  x2={margen.izquierda + (inicioAnio(indiceAnio) - SEPARACION / 2) * unidad}
                  y1={margen.arriba - 18}
                  y2={margen.arriba + plotAlto}
                />
              )}
              <text
                className="pino__anio-etiqueta"
                x={margen.izquierda + (inicioAnio(indiceAnio) + 6) * unidad}
                y={margen.arriba - 16}
                textAnchor="middle"
              >
                {anio}
                <tspan className="pino__anio-total"> · {tnRedondo(totalDelAnio(anio))} TN</tspan>
              </text>
            </g>
          ))}

          {anios.map((anio, indiceAnio) =>
            MESES_CORTOS.map((mes, mesIndex) => {
              const registro = registros.find(
                (actual) => actual.anio === anio && actual.mesIndex === mesIndex,
              );
              const centro = x(indiceAnio, mesIndex);
              const izquierda = centro - anchoBarra / 2;
              const total = registro ? totalDe(registro) : 0;
              const seleccionado = mismoMes(mesFoco, { anio, mesIndex });

              return (
                <g key={`${anio}-${mes}`}>
                  {(rotulado(mesIndex) || seleccionado) && (
                    <text
                      className={`pino__eje-texto ${seleccionado ? 'pino__eje-texto--activo' : ''}`}
                      x={centro}
                      y={alto - 26}
                      textAnchor="middle"
                    >
                      {etiquetaMes === 'inicial' ? mes.slice(0, 1) : mes}
                    </text>
                  )}

                  {seleccionado && (
                    <line
                      className="pino__marca-mes"
                      x1={izquierda}
                      x2={izquierda + anchoBarra}
                      y1={margen.arriba + plotAlto + 3}
                      y2={margen.arriba + plotAlto + 3}
                    />
                  )}

                  {registro && total > 0 && (
                    <g
                      className="pino__barra"
                      role="button"
                      tabIndex={0}
                      aria-pressed={seleccionado}
                      aria-label={`${registro.mes} de ${anio}: ${tn(total)} toneladas, ${cuotaPct(
                        cuota(total, totalDelAnio(anio)),
                      )} del año`}
                      onMouseEnter={() => setSobre({ anio, mesIndex })}
                      onMouseLeave={() => setSobre(null)}
                      onFocus={() => setSobre({ anio, mesIndex })}
                      onBlur={() => setSobre(null)}
                      onClick={() => onMes(seleccionado ? null : { anio, mesIndex })}
                      onKeyDown={(evento) => {
                        if (evento.key !== 'Enter' && evento.key !== ' ') return;
                        evento.preventDefault();
                        onMes(seleccionado ? null : { anio, mesIndex });
                      }}
                    >
                      <rect
                        className="pino__barra-hit"
                        x={centro - Math.max(12, unidad / 2)}
                        y={margen.arriba}
                        width={Math.max(24, unidad)}
                        height={plotAlto}
                      />
                      <Apilado
                        registro={registro}
                        series={series}
                        x={izquierda}
                        ancho={anchoBarra}
                        y={y}
                        base={margen.arriba + plotAlto}
                      />
                    </g>
                  )}
                </g>
              );
            }),
          )}

          <line
            className="pino__linea-base"
            x1={margen.izquierda}
            x2={ancho - margen.derecha}
            y1={margen.arriba + plotAlto}
            y2={margen.arriba + plotAlto}
          />
        </svg>
      </div>
    </div>
  );
}

/** Los tramos de una barra, de abajo arriba, separados por el hueco de rigor. */
function Apilado({
  registro,
  series,
  x,
  ancho,
  y,
  base,
}: {
  registro: PinoRecord;
  series: Serie[];
  x: number;
  ancho: number;
  y: (valor: number) => number;
  base: number;
}) {
  let acumulado = 0;
  const tramos = series
    .map((serie) => {
      const valor = toneladas([registro], serie.filtro);
      const desde = acumulado;
      acumulado += valor;
      return { serie, valor, desde, hasta: acumulado };
    })
    .filter((tramo) => tramo.valor > 0);

  return (
    <>
      {tramos.map((tramo, indice) => {
        const arriba = y(tramo.hasta);
        const abajo = Math.min(base, y(tramo.desde));
        const ultimo = indice === tramos.length - 1;
        // El hueco se le quita por arriba a todos menos al de más arriba, que
        // es el que lleva el extremo redondeado del dato.
        const recorte = ultimo || abajo - arriba <= HUECO * 2 ? 0 : HUECO;
        const alto = Math.max(1, abajo - arriba - recorte);

        return (
          <path
            key={tramo.serie.clave}
            className="pino__tramo"
            d={caminoBarra(x, arriba + recorte, ancho, alto, ultimo ? 4 : 0)}
            style={{ fill: tramo.serie.color }}
          >
            <title>
              {`${tramo.serie.label}: ${tn(tramo.valor)} TN`}
            </title>
          </path>
        );
      })}
    </>
  );
}

function Leyenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null;

  return (
    <ul className="pino__leyenda">
      {series.map((serie) => (
        <li key={serie.clave} className="pino__leyenda-item">
          <span className="pino__muestra" style={{ background: serie.color }} />
          {serie.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Quesitos
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

function puntoEn(cx: number, cy: number, radio: number, giro: number) {
  const angulo = giro * TAU - Math.PI / 2;
  return [cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)] as const;
}

/** Un sector de corona entre dos fracciones de vuelta (0 arriba, sentido reloj). */
function sectorDeCorona(
  cx: number,
  cy: number,
  rExterior: number,
  rInterior: number,
  desde: number,
  hasta: number,
): string {
  if (hasta - desde <= 0) return '';

  // Una vuelta entera no se puede describir con un solo arco: se parte en dos y
  // el hueco central se recorta con `evenodd`.
  if (hasta - desde >= 0.9999) {
    return [
      `M ${cx - rExterior} ${cy}`,
      `A ${rExterior} ${rExterior} 0 1 1 ${cx + rExterior} ${cy}`,
      `A ${rExterior} ${rExterior} 0 1 1 ${cx - rExterior} ${cy}`,
      `M ${cx - rInterior} ${cy}`,
      `A ${rInterior} ${rInterior} 0 1 1 ${cx + rInterior} ${cy}`,
      `A ${rInterior} ${rInterior} 0 1 1 ${cx - rInterior} ${cy}`,
      'Z',
    ].join(' ');
  }

  const grande = hasta - desde > 0.5 ? 1 : 0;
  const [x1, y1] = puntoEn(cx, cy, rExterior, desde);
  const [x2, y2] = puntoEn(cx, cy, rExterior, hasta);
  const [x3, y3] = puntoEn(cx, cy, rInterior, hasta);
  const [x4, y4] = puntoEn(cx, cy, rInterior, desde);

  return [
    `M ${x1} ${y1}`,
    `A ${rExterior} ${rExterior} 0 ${grande} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInterior} ${rInterior} 0 ${grande} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export interface Sector {
  clave: string;
  label: string;
  valor: number;
  color: string;
  /** Se apaga cuando hay un foco puesto y este sector no es el elegido. */
  tenue?: boolean;
}

interface QuesitoProps {
  titulo: string;
  subtitulo: string;
  sectores: Sector[];
  /** Lo que se lee en el centro mientras no se señala ningún sector. */
  totalEtiqueta: string;
  onElegir?: (clave: string) => void;
}

/**
 * Un quesito con el hueco en medio: el reparto se lee en el anillo y la cifra
 * exacta en el centro, que cambia al señalar un sector. Ningún valor depende
 * del ratón —la leyenda de al lado los lista todos con sus toneladas y su
 * porcentaje—, así que el quesito informa pero no esconde nada.
 */
export function PinoQuesito({
  titulo,
  subtitulo,
  sectores,
  totalEtiqueta,
  onElegir,
}: QuesitoProps) {
  const [sobre, setSobre] = useState<string | null>(null);

  const visibles = sectores.filter((sector) => sector.valor > 0);
  const total = visibles.reduce((suma, sector) => suma + sector.valor, 0);

  const lado = 168;
  const centro = lado / 2;
  const rExterior = 76;
  const rInterior = 47;
  // El hueco entre porciones, expresado como fracción de vuelta sobre el radio
  // exterior, para que mida los mismos dos píxeles que en las barras.
  const separacion = visibles.length > 1 ? HUECO / (TAU * rExterior) : 0;

  const destacado = visibles.find((sector) => sector.clave === sobre) ?? null;

  let acumulado = 0;
  const porciones = visibles.map((sector) => {
    const desde = acumulado / total;
    acumulado += sector.valor;
    const hasta = acumulado / total;
    return { sector, desde, hasta };
  });

  return (
    <div className="pino__quesito">
      <div className="pino__quesito-cabecera">
        <p className="eyebrow">{titulo}</p>
        <p className="pino__quesito-subtitulo">{subtitulo}</p>
      </div>

      {total <= 0 ? (
        <p className="pino__vacio-panel">Sin toneladas con estos filtros.</p>
      ) : (
        <div className="pino__quesito-cuerpo">
          <svg
            className="pino__quesito-svg"
            viewBox={`0 0 ${lado} ${lado}`}
            role="img"
            aria-label={visibles
              .map(
                (sector) =>
                  `${sector.label}: ${tn(sector.valor)} toneladas, ${cuotaPct(cuota(sector.valor, total))}`,
              )
              .join('. ')}
          >
            {porciones.map(({ sector, desde, hasta }) => {
              // La separación se le quita al sector, nunca al hueco: una
              // porción diminuta se dibuja entera antes que desaparecer.
              const recorte = Math.min(separacion, (hasta - desde) / 3);
              const activo = destacado?.clave === sector.clave;

              return (
                <path
                  key={sector.clave}
                  className={`pino__porcion ${sector.tenue && !activo ? 'pino__porcion--tenue' : ''} ${
                    onElegir ? 'pino__porcion--pulsable' : ''
                  }`}
                  d={sectorDeCorona(
                    centro,
                    centro,
                    activo ? rExterior + 4 : rExterior,
                    rInterior,
                    desde,
                    Math.max(desde, hasta - recorte),
                  )}
                  fillRule="evenodd"
                  style={{ fill: sector.color }}
                  onMouseEnter={() => setSobre(sector.clave)}
                  onMouseLeave={() => setSobre(null)}
                  onClick={onElegir ? () => onElegir(sector.clave) : undefined}
                />
              );
            })}

            <text className="pino__quesito-centro" x={centro} y={centro - 4} textAnchor="middle">
              {destacado ? cuotaPct(cuota(destacado.valor, total)) : tnRedondo(total)}
            </text>
            <text className="pino__quesito-pie" x={centro} y={centro + 14} textAnchor="middle">
              {destacado ? `${tnRedondo(destacado.valor)} TN` : totalEtiqueta}
            </text>
          </svg>

          <ul className="pino__quesito-leyenda">
            {visibles.map((sector) => (
              <li
                key={sector.clave}
                className={`pino__quesito-fila ${
                  destacado?.clave === sector.clave ? 'pino__quesito-fila--activa' : ''
                } ${sector.tenue ? 'pino__quesito-fila--tenue' : ''}`}
                onMouseEnter={() => setSobre(sector.clave)}
                onMouseLeave={() => setSobre(null)}
              >
                <span className="pino__muestra" style={{ background: sector.color }} />
                <span className="pino__quesito-nombre">{sector.label}</span>
                <span className="pino__quesito-tn num">{tn(sector.valor)}</span>
                <span className="pino__quesito-pct num">{cuotaPct(cuota(sector.valor, total))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking de clientes
// ---------------------------------------------------------------------------

interface RankingProps {
  dataset: PinoDataset;
  registros: PinoRecord[];
  tipoFoco: string | null;
  clienteFoco: string | null;
  onCliente: (cliente: string | null) => void;
}

/**
 * Cuánto se llevó cada cliente y de qué madera. Es la respuesta directa a «de
 * todo lo que compró este cliente, qué parte fue cada tipo»: la longitud da las
 * toneladas y los tramos, el reparto por madera, con sólo tres colores en
 * juego para que se pueda comparar de arriba abajo sin leyenda intermedia.
 */
export function PinoRanking({ dataset, registros, tipoFoco, clienteFoco, onCliente }: RankingProps) {
  const resumen = useMemo(() => resumir(registros, { tipo: tipoFoco }), [registros, tipoFoco]);

  const filas = dataset.clientes
    .map((cliente) => ({
      ...cliente,
      total: resumen.porCliente[cliente.id] ?? 0,
      tramos: dataset.tipos
        .map((tipo) => ({
          tipo,
          valor: resumen.matriz[tipo.id]?.[cliente.id] ?? 0,
          color: colorDeTipo(dataset, tipo.id),
        }))
        .filter((tramo) => tramo.valor > 0),
    }))
    .filter((fila) => fila.total > 0)
    .sort((a, b) => b.total - a.total);

  if (filas.length === 0) return null;

  const tope = filas[0].total;

  return (
    <div className="pino__panel">
      <div className="pino__panel-cabecera">
        <div>
          <p className="eyebrow">Reparto por cliente</p>
          <h3 className="pino__panel-titulo">
            Quién se lo llevó{tipoFoco ? ` · sólo ${etiquetaTipo(tipoFoco)}` : ''}
          </h3>
        </div>
        {!tipoFoco && (
          <ul className="pino__leyenda">
            {dataset.tipos.map((tipo) => (
              <li key={tipo.id} className="pino__leyenda-item">
                <span
                  className="pino__muestra"
                  style={{ background: colorDeTipo(dataset, tipo.id) }}
                />
                {tipo.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ol className="pino__ranking">
        {filas.map((fila) => (
          <li
            key={fila.id}
            className={`pino__ranking-fila ${
              clienteFoco === fila.id ? 'pino__ranking-fila--activa' : ''
            }`}
          >
            <button
              className="pino__ranking-nombre"
              type="button"
              aria-pressed={clienteFoco === fila.id}
              title={
                clienteFoco === fila.id
                  ? `Quitar el filtro de ${fila.label}`
                  : `Ver sólo ${fila.label}`
              }
              onClick={() => onCliente(clienteFoco === fila.id ? null : fila.id)}
            >
              {fila.label}
            </button>

            <span className="pino__ranking-pista">
              <span className="pino__ranking-barra" style={{ width: `${(fila.total / tope) * 100}%` }}>
                {fila.tramos.map((tramo) => (
                  <span
                    key={tramo.tipo.id}
                    className="pino__ranking-tramo"
                    style={{ flexGrow: tramo.valor, background: tramo.color }}
                    title={`${tramo.tipo.label}: ${tn(tramo.valor)} TN · ${cuotaPct(
                      cuota(tramo.valor, fila.total),
                    )} de ${fila.label}`}
                  />
                ))}
              </span>
            </span>

            <span className="pino__ranking-tn num">{tn(fila.total)}</span>
            <span className="pino__ranking-pct num">
              {cuotaPct(cuota(fila.total, resumen.total))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matriz tipo × cliente
// ---------------------------------------------------------------------------

const TEXTO_BASE: Record<PinoBase, string> = {
  tipo: 'Cada columna suma 100%: de esa madera, qué parte se llevó cada cliente.',
  cliente: 'Cada fila suma 100%: de todo lo que compró ese cliente, qué parte fue cada madera.',
  total: 'Toda la tabla suma 100%: el peso de cada cruce sobre el suministro del ámbito.',
};

interface MatrizProps {
  dataset: PinoDataset;
  registros: PinoRecord[];
  base: PinoBase;
  tipoFoco: string | null;
  clienteFoco: string | null;
  onBase: (base: PinoBase) => void;
}

export function PinoMatriz({
  dataset,
  registros,
  base,
  tipoFoco,
  clienteFoco,
  onBase,
}: MatrizProps) {
  const resumen = useMemo(() => resumir(registros), [registros]);

  // La tabla lleva a todos los clientes y a todos los tipos que declara la
  // hoja, aunque en este ámbito no se les mandara nada: que un cliente esté a
  // cero un mes es un dato, y no verlo en la lista se lee como que no existe.
  const { clientes, tipos } = dataset;
  if (clientes.length === 0) return null;

  const referencia = (tipo: string, cliente: string) =>
    base === 'tipo'
      ? (resumen.porTipo[tipo] ?? 0)
      : base === 'cliente'
        ? (resumen.porCliente[cliente] ?? 0)
        : resumen.total;

  return (
    <div className="pino__panel">
      <div className="pino__panel-cabecera">
        <div>
          <p className="eyebrow">Matriz del ámbito</p>
          <h3 className="pino__panel-titulo">Cada tipo de madera y cada cliente</h3>
          <p className="pino__panel-nota">
            {TEXTO_BASE[base]}
            {(tipoFoco || clienteFoco) && (
              // Recortarla dejaría una sola columna o una sola fila, que es
              // justo el número que ya dan los paneles de arriba.
              <> El cruce se enseña entero: lo elegido va resaltado, no aislado.</>
            )}
          </p>
        </div>

        <div className="pino__base no-imprimir" role="group" aria-label="Sobre qué se calcula el porcentaje">
          <span className="eyebrow">Porcentaje sobre</span>
          <div className="pino__chips">
            {(['tipo', 'cliente', 'total'] as PinoBase[]).map((opcion) => (
              <button
                key={opcion}
                className={`pino__chip ${base === opcion ? 'pino__chip--activo' : ''}`}
                type="button"
                aria-pressed={base === opcion}
                onClick={() => onBase(opcion)}
              >
                {opcion === 'tipo' ? 'El tipo' : opcion === 'cliente' ? 'El cliente' : 'El total'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pino__tabla-wrap">
        <table className="pino__tabla">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              {tipos.map((tipo) => (
                <th
                  key={tipo.id}
                  scope="col"
                  className={`num ${tipoFoco === tipo.id ? 'pino__celda--foco' : ''}`}
                >
                  <span
                    className="pino__muestra"
                    style={{ background: colorDeTipo(dataset, tipo.id) }}
                  />
                  {tipo.label}
                </th>
              ))}
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {clientes.map((cliente) => (
              <tr
                key={cliente.id}
                className={clienteFoco === cliente.id ? 'pino__fila--foco' : ''}
              >
                <th scope="row">{cliente.label}</th>

                {tipos.map((tipo) => {
                  const valor = resumen.matriz[tipo.id]?.[cliente.id] ?? 0;
                  const parte = cuota(valor, referencia(tipo.id, cliente.id));
                  return (
                    <td key={tipo.id} className="num">
                      {valor > 0 ? (
                        <span
                          className="pino__celda"
                          style={{
                            background: `color-mix(in oklab, ${colorDeTipo(dataset, tipo.id)} ${(
                              (parte ?? 0) * 34
                            ).toFixed(1)}%, transparent)`,
                          }}
                        >
                          <span className="pino__celda-pct">{cuotaPct(parte)}</span>
                          <span className="pino__celda-tn">{tn(valor)}</span>
                        </span>
                      ) : (
                        <span className="pino__celda-nada">—</span>
                      )}
                    </td>
                  );
                })}

                <td className="num pino__celda-total">
                  <span className="pino__celda-pct">
                    {cuotaPct(cuota(resumen.porCliente[cliente.id] ?? 0, resumen.total))}
                  </span>
                  <span className="pino__celda-tn">{tn(resumen.porCliente[cliente.id] ?? 0)}</span>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {tipos.map((tipo) => (
                <td key={tipo.id} className="num">
                  <span className="pino__celda-pct">
                    {cuotaPct(cuota(resumen.porTipo[tipo.id] ?? 0, resumen.total))}
                  </span>
                  <span className="pino__celda-tn">{tn(resumen.porTipo[tipo.id] ?? 0)}</span>
                </td>
              ))}
              <td className="num pino__celda-total">
                <span className="pino__celda-pct">100%</span>
                <span className="pino__celda-tn">{tn(resumen.total)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendario: meses × años
// ---------------------------------------------------------------------------

interface CalendarioProps {
  registros: PinoRecord[];
  anios: number[];
  filtro: PinoFiltro;
  mesFoco: PinoMes | null;
  onMes: (mes: PinoMes | null) => void;
}

/**
 * La misma pregunta que las barras, pero con las cifras a la vista: qué peso
 * tuvo cada mes dentro de su año. Es también la vista de tabla del gráfico, la
 * que sigue funcionando impresa en blanco y negro.
 */
export function PinoCalendario({ registros, anios, filtro, mesFoco, onMes }: CalendarioProps) {
  const valor = (anio: number, mesIndex: number) => {
    const registro = registros.find(
      (actual) => actual.anio === anio && actual.mesIndex === mesIndex,
    );
    return registro ? toneladas([registro], filtro) : null;
  };

  const totalAnio = (anio: number) =>
    toneladas(
      registros.filter((registro) => registro.anio === anio),
      filtro,
    );

  const totalMes = (mesIndex: number) =>
    toneladas(
      registros.filter((registro) => registro.mesIndex === mesIndex),
      filtro,
    );

  const total = toneladas(registros, filtro);
  const maxima = Math.max(
    1,
    ...anios.flatMap((anio) =>
      MESES_CORTOS.map((_, mesIndex) => cuota(valor(anio, mesIndex) ?? 0, totalAnio(anio)) ?? 0),
    ),
  );

  return (
    <div className="pino__panel">
      <div className="pino__panel-cabecera">
        <div>
          <p className="eyebrow">Peso de cada mes</p>
          <h3 className="pino__panel-titulo">Qué parte del año fue cada mes</h3>
          <p className="pino__panel-nota">
            El porcentaje va sobre el total de su propio año, así que cada columna suma 100%. Pulsa
            una casilla para fijar ese mes.
          </p>
        </div>
      </div>

      <div className="pino__tabla-wrap">
        <table className="pino__tabla pino__tabla--calendario">
          <thead>
            <tr>
              <th scope="col">Mes</th>
              {anios.map((anio) => (
                <th key={anio} scope="col" className="num">
                  {anio}
                </th>
              ))}
              <th scope="col" className="num">
                Suma
              </th>
            </tr>
          </thead>

          <tbody>
            {MESES_CORTOS.map((mes, mesIndex) => (
              <tr key={mes}>
                <th scope="row">{mes}</th>

                {anios.map((anio) => {
                  const tn_ = valor(anio, mesIndex);
                  const parte = tn_ === null ? null : cuota(tn_, totalAnio(anio));
                  const seleccionado = mismoMes(mesFoco, { anio, mesIndex });

                  if (tn_ === null) {
                    return (
                      <td key={anio} className="num">
                        <span className="pino__celda-nada">—</span>
                      </td>
                    );
                  }

                  return (
                    <td key={anio} className="num">
                      <button
                        className={`pino__celda pino__celda--pulsable ${
                          seleccionado ? 'pino__celda--activa' : ''
                        }`}
                        type="button"
                        aria-pressed={seleccionado}
                        style={{
                          background: `color-mix(in oklab, var(--naranja) ${(
                            ((parte ?? 0) / maxima) * 30
                          ).toFixed(1)}%, transparent)`,
                        }}
                        onClick={() => onMes(seleccionado ? null : { anio, mesIndex })}
                      >
                        <span className="pino__celda-pct">{cuotaPct(parte)}</span>
                        <span className="pino__celda-tn">{tn(tn_)}</span>
                      </button>
                    </td>
                  );
                })}

                <td className="num pino__celda-total">
                  <span className="pino__celda-pct">{cuotaPct(cuota(totalMes(mesIndex), total))}</span>
                  <span className="pino__celda-tn">{tn(totalMes(mesIndex))}</span>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {anios.map((anio) => (
                <td key={anio} className="num">
                  <span className="pino__celda-pct">{cuotaPct(cuota(totalAnio(anio), total))}</span>
                  <span className="pino__celda-tn">{tn(totalAnio(anio))}</span>
                </td>
              ))}
              <td className="num pino__celda-total">
                <span className="pino__celda-pct">100%</span>
                <span className="pino__celda-tn">{tn(total)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
