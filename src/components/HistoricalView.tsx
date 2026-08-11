import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { tn, tnRedondo } from '../lib/format';
import {
  defaultHistoricalOptions,
  historicalStats,
  MESES_CORTOS,
  parseHistoricalCsv,
  type HistoricalOptions,
  type HistoricalRecord,
  type SharedHistorical,
} from '../lib/history';

const COLORES = [
  'var(--hist-1)',
  'var(--hist-2)',
  'var(--hist-3)',
  'var(--hist-4)',
  'var(--hist-5)',
  'var(--hist-6)',
];

const clave = (dato: HistoricalRecord) => `${dato.anio}-${dato.mesIndex}`;

interface Props {
  initial: SharedHistorical | null;
  initialVersion: number;
  linkError: boolean;
  onChange: (historico: SharedHistorical) => void;
}

export function HistoricalView({ initial, initialVersion, linkError, onChange }: Props) {
  const [datos, setDatos] = useState<HistoricalRecord[]>([]);
  const [csv, setCsv] = useState('');
  const [error, setError] = useState('');
  const [origen, setOrigen] = useState('');
  const [options, setOptions] = useState<HistoricalOptions>(() => defaultHistoricalOptions([]));
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initial) return;
    try {
      const nuevosDatos = parseHistoricalCsv(initial.csv);
      const anios = [...new Set(nuevosDatos.map((dato) => dato.anio))];
      const visiblesValidos = initial.options.aniosVisibles.filter((anio) => anios.includes(anio));
      setDatos(nuevosDatos);
      setCsv(initial.csv);
      setOrigen(initial.sourceName);
      setOptions({
        ...initial.options,
        aniosVisibles:
          visiblesValidos.length > 0 ? visiblesValidos : defaultHistoricalOptions(anios).aniosVisibles,
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el histórico del enlace.');
    }
  }, [initialVersion]);

  useEffect(() => {
    if (!csv || datos.length === 0) return;
    onChange({ csv, sourceName: origen || 'historico.csv', options });
  }, [csv, datos.length, onChange, options, origen]);

  async function cargar(file: File | undefined) {
    if (!file) return;
    try {
      const csv = await file.text();
      const nuevosDatos = parseHistoricalCsv(csv);
      const anios = [...new Set(nuevosDatos.map((dato) => dato.anio))];
      setDatos(nuevosDatos);
      setCsv(csv);
      setOrigen(file.name);
      setOptions(defaultHistoricalOptions(anios));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el CSV.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section
      className={`historico ${datos.length === 0 ? 'historico--vacio' : ''}`}
      aria-labelledby="historico-titulo"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(evento) => void cargar(evento.target.files?.[0])}
      />

      {datos.length === 0 ? (
        <>
          <div className="vacio historico__bienvenida">
            <h2 id="historico-titulo" className="vacio__titulo">
              Carga el CSV histórico
            </h2>
            <p>
              Se lee aquí mismo, en tu navegador. El histórico queda dentro del enlace, así que
              para enviárselo a alguien basta con pasarle la dirección.
            </p>
          </div>

          <div
            className={`zona historico__zona no-imprimir ${arrastrando ? 'zona--activa' : ''}`}
            onDragOver={(evento) => {
              evento.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(evento) => {
              evento.preventDefault();
              setArrastrando(false);
              void cargar(evento.dataTransfer.files[0]);
            }}
          >
            <button
              className="boton boton--primario"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Elegir el CSV histórico
            </button>
            <p className="zona__pista">
              O arrástralo aquí. Se lee en tu navegador; ni se sube ni se guarda en ningún sitio.
            </p>
          </div>
        </>
      ) : (
        <header className="historico__cabecera">
          <div>
            <p className="eyebrow">Evolución mensual</p>
            <h2 id="historico-titulo" className="historico__titulo">
              Histórico de toneladas
            </h2>
            <p className="historico__intro">
              Compara cada mes entre años. Pasa por un punto o púlsalo para ver su desglose.
            </p>
          </div>

          <div className="historico__carga no-imprimir">
            <button className="boton" type="button" onClick={() => inputRef.current?.click()}>
              Cargar otro CSV
            </button>
            {origen && (
              <span className="historico__archivo" title={origen}>
                {origen}
              </span>
            )}
          </div>
        </header>
      )}

      {linkError && !datos.length && (
        <div className="aviso" role="alert">
          El histórico de este enlace no se puede leer. Puede que la dirección esté incompleta.
        </div>
      )}

      {error && (
        <div className="aviso" role="alert">
          {error}
        </div>
      )}

      {datos.length > 0 && (
        <HistoricalChart datos={datos} options={options} onOptionsChange={setOptions} />
      )}
    </section>
  );
}

interface ChartProps {
  datos: HistoricalRecord[];
  options: HistoricalOptions;
  onOptionsChange: (options: HistoricalOptions) => void;
}

function HistoricalChart({ datos, options, onOptionsChange }: ChartProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(900);
  const [sobre, setSobre] = useState<string | null>(null);
  const [fijado, setFijado] = useState<string | null>(null);
  const anios = useMemo(() => [...new Set(datos.map((dato) => dato.anio))], [datos]);
  const { aniosVisibles, mostrarMedia, mostrarMediana, mesFoco } = options;

  useEffect(() => {
    const elemento = contenedorRef.current;
    if (!elemento) return;
    const medir = () => setAncho(Math.max(300, elemento.clientWidth));
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);

  const estadisticasPorAnio = useMemo(
    () =>
      anios.map((anio, indice) => ({
        anio,
        color: COLORES[indice % COLORES.length],
        ...historicalStats(datos.filter((dato) => dato.anio === anio)),
      })),
    [anios, datos],
  );
  const activo = fijado ?? sobre;
  const detalle = activo
    ? datos.find((dato) => clave(dato) === activo && aniosVisibles.includes(dato.anio)) ?? null
    : null;

  const movil = ancho < 560;
  const alto = movil ? 340 : 410;
  const margen = {
    arriba: 24,
    derecha: mesFoco === null ? (movil ? 100 : 170) : movil ? 12 : 24,
    abajo: 42,
    izquierda: movil ? 42 : 58,
  };
  const plotAncho = ancho - margen.izquierda - margen.derecha;
  const plotAlto = alto - margen.arriba - margen.abajo;
  const valores = datos.map((dato) => dato.total);
  const referenciasValores = estadisticasPorAnio.flatMap(({ media, mediana }) => [media, mediana]);
  const minimo = Math.min(...valores, ...referenciasValores);
  const maximo = Math.max(...valores, ...referenciasValores);
  const pasoEje = 5000;
  const yMin = Math.max(0, Math.floor(minimo / pasoEje) * pasoEje);
  const yMax = Math.max(yMin + pasoEje, Math.ceil(maximo / pasoEje) * pasoEje);
  const x = (mes: number) => margen.izquierda + (mes / 11) * plotAncho;
  const aniosFoco = anios.filter((anio) => aniosVisibles.includes(anio));
  const xAnio = (anio: number) => {
    const indice = aniosFoco.indexOf(anio);
    if (aniosFoco.length <= 1) return margen.izquierda + plotAncho / 2;
    return margen.izquierda + plotAncho * (0.08 + (indice / (aniosFoco.length - 1)) * 0.84);
  };
  const xDato = (dato: HistoricalRecord) =>
    mesFoco === null ? x(dato.mesIndex) : xAnio(dato.anio);
  const y = (valor: number) => margen.arriba + ((yMax - valor) / (yMax - yMin)) * plotAlto;
  const ticksY = Array.from(
    { length: Math.round((yMax - yMin) / pasoEje) + 1 },
    (_, i) => yMin + pasoEje * i,
  );
  const etiquetaEje = (valor: number) => `${Math.round(valor / 1000)} mil`;

  const ruta = (serie: HistoricalRecord[]) =>
    serie
      .sort((a, b) => a.mesIndex - b.mesIndex)
      .map((dato, indice, todos) => {
        const separado = indice === 0 || dato.mesIndex - todos[indice - 1].mesIndex > 1;
        return `${separado ? 'M' : 'L'} ${x(dato.mesIndex)} ${y(dato.total)}`;
      })
      .join(' ');

  const referencias =
    mesFoco === null
      ? estadisticasPorAnio
          .filter(({ anio }) => aniosVisibles.includes(anio))
          .flatMap(({ anio, color, media, mediana }) => [
            ...(mostrarMedia ? [{ anio, color, tipo: 'media' as const, valor: media }] : []),
            ...(mostrarMediana ? [{ anio, color, tipo: 'mediana' as const, valor: mediana }] : []),
          ])
      : [];

  let siguienteEtiqueta = margen.arriba + 4;
  const etiquetas = referencias
    .map((referencia) => ({ ...referencia, yReal: y(referencia.valor), yEtiqueta: y(referencia.valor) }))
    .sort((a, b) => a.yReal - b.yReal)
    .map((referencia) => {
      const yEtiqueta = Math.max(referencia.yReal, siguienteEtiqueta);
      siguienteEtiqueta = yEtiqueta + (movil ? 12 : 14);
      return { ...referencia, yEtiqueta };
    });
  const limiteInferior = margen.arriba + plotAlto - 3;
  const exceso = Math.max(0, (etiquetas.at(-1)?.yEtiqueta ?? 0) - limiteInferior);
  if (exceso > 0) etiquetas.forEach((etiqueta) => (etiqueta.yEtiqueta -= exceso));

  function alternarAnio(anio: number) {
    const nuevos = aniosVisibles.includes(anio)
      ? aniosVisibles.filter((actual) => actual !== anio)
      : [...aniosVisibles, anio];
    onOptionsChange({ ...options, aniosVisibles: nuevos });
    const puntoActivo = datos.find((dato) => clave(dato) === fijado);
    if (puntoActivo?.anio === anio) setFijado(null);
    setSobre(null);
  }

  return (
    <>
      <div className="historico__filtros" aria-label="Series visibles">
        <div className="historico__filtro-grupo">
          <span className="eyebrow">Años</span>
          <div className="historico__chips">
            {estadisticasPorAnio.map(({ anio, color }) => {
              const visible = aniosVisibles.includes(anio);
              return (
                <button
                  key={anio}
                  className={`historico__chip historico__chip--anio ${
                    visible ? 'historico__chip--activo' : ''
                  }`}
                  type="button"
                  aria-pressed={visible}
                  style={{ '--chip-color': color } as CSSProperties}
                  onClick={() => alternarAnio(anio)}
                >
                  <span className="historico__muestra" style={{ background: color }} />
                  {anio}
                </button>
              );
            })}
          </div>
        </div>

        <div className="historico__filtro-grupo">
          <span className="eyebrow">Referencias</span>
          <div className="historico__chips">
            <button
              className={`historico__chip ${mostrarMedia ? 'historico__chip--activo' : ''}`}
              type="button"
              aria-pressed={mostrarMedia}
              onClick={() => onOptionsChange({ ...options, mostrarMedia: !mostrarMedia })}
            >
              <span className="historico__muestra historico__muestra--media" />
              Media
            </button>
            <button
              className={`historico__chip ${mostrarMediana ? 'historico__chip--activo' : ''}`}
              type="button"
              aria-pressed={mostrarMediana}
              onClick={() => onOptionsChange({ ...options, mostrarMediana: !mostrarMediana })}
            >
              <span className="historico__muestra historico__muestra--mediana" />
              Mediana
            </button>
          </div>
        </div>

        <label className="historico__filtro-grupo">
          <span className="eyebrow">Mes ampliado</span>
          <select
            className="historico__select"
            value={mesFoco ?? ''}
            onChange={(evento) => {
              onOptionsChange({
                ...options,
                mesFoco: evento.target.value === '' ? null : Number(evento.target.value),
              });
              setSobre(null);
              setFijado(null);
            }}
          >
            <option value="">Todos los meses</option>
            {MESES_CORTOS.map((mes, indice) => (
              <option key={mes} value={indice}>
                {mes}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="historico__grafica">
        {mesFoco !== null && (
          <p className="historico__modo">
            <span className="eyebrow">Vista ampliada</span>
            Sólo los puntos de {MESES_CORTOS[mesFoco]}
          </p>
        )}
        <div ref={contenedorRef} className="historico__svg-wrap">
          <svg
            className="historico__svg"
            viewBox={`0 0 ${ancho} ${alto}`}
            role="img"
            aria-label="Toneladas totales por mes y año"
          >
            <text
              className="historico__eje-unidad"
              x={margen.izquierda - 8}
              y={margen.arriba - 10}
              textAnchor="end"
            >
              TN
            </text>
            {ticksY.map((valor) => (
              <g key={valor}>
                <line
                  className="historico__rejilla"
                  x1={margen.izquierda}
                  x2={ancho - margen.derecha}
                  y1={y(valor)}
                  y2={y(valor)}
                />
                <text className="historico__eje-texto" x={margen.izquierda - 8} y={y(valor) + 4} textAnchor="end">
                  {etiquetaEje(valor)}
                </text>
              </g>
            ))}

            {mesFoco === null
              ? MESES_CORTOS.map((mes, indice) => (
                  <text
                    key={mes}
                    className="historico__eje-texto"
                    x={x(indice)}
                    y={alto - 14}
                    textAnchor="middle"
                  >
                    {movil ? mes.slice(0, 1) : mes}
                  </text>
                ))
              : aniosFoco.map((anio) => (
                  <text
                    key={anio}
                    className="historico__eje-texto historico__eje-texto--foco"
                    x={xAnio(anio)}
                    y={alto - 14}
                    textAnchor="middle"
                  >
                    {anio}
                  </text>
                ))}

            {etiquetas.map((referencia) => {
              const xFinal = ancho - margen.derecha;
              const etiqueta = movil
                ? `${referencia.tipo === 'media' ? 'Media' : 'Mediana'} ${String(referencia.anio).slice(-2)} · ${tnRedondo(referencia.valor)}`
                : `${referencia.tipo === 'media' ? 'Media' : 'Mediana'} ${referencia.anio} · ${tnRedondo(referencia.valor)} TN`;
              return (
                <g key={`${referencia.tipo}-${referencia.anio}`}>
                  <line
                    className={`historico__referencia historico__referencia--${referencia.tipo}`}
                    style={{ stroke: referencia.color }}
                    x1={margen.izquierda}
                    x2={xFinal}
                    y1={referencia.yReal}
                    y2={referencia.yReal}
                  />
                  <path
                    className="historico__referencia-conector"
                    style={{ stroke: referencia.color }}
                    d={`M ${xFinal} ${referencia.yReal} L ${xFinal + 6} ${referencia.yReal} L ${xFinal + 10} ${referencia.yEtiqueta}`}
                  />
                  <text
                    className="historico__referencia-texto"
                    style={{ fill: referencia.color }}
                    x={xFinal + 13}
                    y={referencia.yEtiqueta + 3}
                  >
                    {etiqueta}
                  </text>
                </g>
              );
            })}

            {anios.map((anio, indice) => {
              if (!aniosVisibles.includes(anio)) return null;
              const serie = datos.filter(
                (dato) => dato.anio === anio && (mesFoco === null || dato.mesIndex === mesFoco),
              );
              const color = COLORES[indice % COLORES.length];
              const ultimo = [...serie].sort((a, b) => a.mesIndex - b.mesIndex).at(-1);
              return (
                <g key={anio}>
                  {mesFoco === null && (
                    <>
                      <path className="historico__linea" d={ruta(serie)} style={{ stroke: color }} />
                      {ultimo && (
                        <text
                          className="historico__serie-etiqueta"
                          style={{ fill: color }}
                          x={xDato(ultimo) + 7}
                          y={y(ultimo.total) + 4}
                        >
                          {anio}
                        </text>
                      )}
                    </>
                  )}
                  {serie.map((dato) => {
                    const seleccion = clave(dato) === activo;
                    return (
                      <g
                        key={clave(dato)}
                        className="historico__punto"
                        role="button"
                        tabIndex={0}
                        aria-label={`${dato.mes} de ${dato.anio}: ${tn(dato.total)} toneladas${
                          dato.notas ? ', con nota' : ''
                        }`}
                        onMouseEnter={() => setSobre(clave(dato))}
                        onMouseLeave={() => setSobre(null)}
                        onFocus={() => setSobre(clave(dato))}
                        onBlur={() => setSobre(null)}
                        onClick={() => setFijado((actual) => (actual === clave(dato) ? null : clave(dato)))}
                        onKeyDown={(evento) => {
                          if (evento.key === 'Enter' || evento.key === ' ') {
                            evento.preventDefault();
                            setFijado((actual) => (actual === clave(dato) ? null : clave(dato)));
                          }
                        }}
                      >
                        <circle className="historico__punto-hit" cx={xDato(dato)} cy={y(dato.total)} r="14" />
                        <circle
                          className={`historico__punto-visible ${seleccion ? 'historico__punto-visible--activo' : ''}`}
                          cx={xDato(dato)}
                          cy={y(dato.total)}
                          r={seleccion ? 7 : mesFoco === null ? 3.5 : 6}
                          style={{ fill: color }}
                        />
                        {dato.notas && (
                          <text className="historico__nota-marca" x={xDato(dato) + 7} y={y(dato.total) - 8}>
                            *
                          </text>
                        )}
                        {mesFoco !== null && (
                          <text
                            className="historico__punto-valor"
                            style={{ fill: color }}
                            x={xDato(dato)}
                            y={y(dato.total) - 13}
                            textAnchor="middle"
                          >
                            {tnRedondo(dato.total)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        <PointDetail dato={detalle} fijado={fijado !== null} />
      </div>
    </>
  );
}

function PointDetail({ dato, fijado }: { dato: HistoricalRecord | null; fijado: boolean }) {
  if (!dato) {
    return (
      <div className="historico__detalle historico__detalle--vacio">
        Pasa por un punto o púlsalo para consultar todos sus datos.
      </div>
    );
  }

  const campo = (etiqueta: string, valor: number | null) => (
    <div className="historico__detalle-campo">
      <span className="eyebrow">{etiqueta}</span>
      <strong className="num">{valor === null ? '—' : `${tn(valor)} TN`}</strong>
    </div>
  );

  return (
    <div className="historico__detalle" aria-live="polite">
      <div className="historico__detalle-titulo">
        <div>
          <span className="eyebrow">{fijado ? 'Punto seleccionado' : 'Detalle del punto'}</span>
          <h3>
            {dato.mes} {dato.anio} {dato.notas && <sup title="Este punto tiene notas">*</sup>}
          </h3>
        </div>
        <strong className="historico__detalle-total num">{tn(dato.total)} TN</strong>
      </div>

      <div className="historico__detalle-contenido">
        <div className="historico__detalle-datos">
          <div className="historico__detalle-grid">
            {campo('Eucalipto', dato.eucalipto)}
            {campo('Setúbal', dato.setubal)}
            {campo('Pino', dato.pino)}
            {campo('Viana', dato.viana)}
          </div>

          {dato.notas && (
            <p className="historico__nota">
              <span className="eyebrow">Nota</span>
              {dato.notas}
            </p>
          )}
        </div>

        <PointPie dato={dato} />
      </div>
    </div>
  );
}

function PointPie({ dato }: { dato: HistoricalRecord }) {
  const pino = Math.max(0, dato.pino ?? 0);
  const eucalipto = Math.max(0, dato.eucalipto ?? 0);
  const viana = Math.min(pino, Math.max(0, dato.viana ?? 0));
  const setubal = Math.min(eucalipto, Math.max(0, dato.setubal ?? 0));
  const otras = Math.max(0, dato.total - pino - eucalipto);
  const sectores = [
    { nombre: 'Pino · resto', valor: pino - viana, color: 'var(--pino)' },
    { nombre: 'Pino · Viana', valor: viana, color: 'var(--pino-sub)' },
    { nombre: 'Eucalipto · resto', valor: eucalipto - setubal, color: 'var(--eucalipto)' },
    { nombre: 'Eucalipto · Setúbal', valor: setubal, color: 'var(--eucalipto-sub)' },
    { nombre: 'Otras', valor: otras, color: 'var(--otras)' },
  ].filter((sector) => sector.valor > 0);
  const suma = sectores.reduce((total, sector) => total + sector.valor, 0);

  let acumulado = 0;
  const gradiente = sectores
    .map((sector) => {
      const inicio = (acumulado / suma) * 100;
      acumulado += sector.valor;
      const fin = (acumulado / suma) * 100;
      return `${sector.color} ${inicio}% ${fin}%`;
    })
    .join(', ');

  const porcentaje = (valor: number) => `${Math.round((valor / suma) * 100)}%`;
  const fila = (nombre: string, valor: number, color: string, secundaria = false) => {
    if (valor <= 0) return null;
    return (
      <div className={`historico__quesito-fila ${secundaria ? 'historico__quesito-fila--secundaria' : ''}`}>
        <span className="historico__quesito-color" style={{ background: color }} />
        <span>{nombre}</span>
        <strong className="num">{tn(valor)} TN</strong>
        <span className="historico__quesito-pct num">{porcentaje(valor)}</span>
      </div>
    );
  };

  return (
    <div className="historico__quesito">
      <div>
        <span className="eyebrow">Composición del total</span>
        <div
          className="historico__quesito-grafico"
          style={{ background: `conic-gradient(${gradiente})` }}
          role="img"
          aria-label={sectores
            .map((sector) => `${sector.nombre}: ${tn(sector.valor)} toneladas`)
            .join('. ')}
        >
          <span>{dato.mes.slice(0, 3)}</span>
        </div>
      </div>

      <div className="historico__quesito-leyenda">
        <div className="historico__quesito-grupo">
          <div className="historico__quesito-grupo-titulo">
            <strong>Pino</strong>
            <span className="num">{tn(pino)} TN</span>
          </div>
          {fila('Viana', viana, 'var(--pino-sub)', true)}
          {fila('Resto de Pino', pino - viana, 'var(--pino)', true)}
        </div>

        <div className="historico__quesito-grupo">
          <div className="historico__quesito-grupo-titulo">
            <strong>Eucalipto</strong>
            <span className="num">{tn(eucalipto)} TN</span>
          </div>
          {fila('Setúbal', setubal, 'var(--eucalipto-sub)', true)}
          {fila('Resto de Eucalipto', eucalipto - setubal, 'var(--eucalipto)', true)}
        </div>

        {fila('Otras', otras, 'var(--otras)')}
      </div>
    </div>
  );
}
