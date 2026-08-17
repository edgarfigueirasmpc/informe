import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MESES_CORTOS } from '../lib/csv';
import { cuotaPct, tn, tnRedondo } from '../lib/format';
import {
  cuota,
  defaultPinoOptions,
  esMes,
  parsePinoCsv,
  resumir,
  sanearOpciones,
  toneladas,
  type PinoBase,
  type PinoDataset,
  type PinoOptions,
  type PinoRecord,
  type SharedPino,
} from '../lib/pino';
import {
  colorDeTipo,
  pasoDeRampa,
  seriesDe,
  PinoBarras,
  PinoCalendario,
  PinoMatriz,
  PinoQuesito,
  PinoRanking,
  type Sector,
} from './PinoCharts';

interface Props {
  initial: SharedPino | null;
  initialVersion: number;
  linkError: boolean;
  onChange: (pino: SharedPino) => void;
}

/**
 * Pino por cliente. La pestaña del histórico responde «cuánto»; ésta responde
 * «de qué madera y para quién», que es la pregunta que se hace al negociar un
 * cupo.
 *
 * Toda la vista cuelga de tres filtros —años, tipo de madera y cliente— más el
 * mes que se fije en la gráfica. Los paneles no tienen mandos propios: se
 * filtra una vez arriba y todo lo de abajo habla del mismo trozo de datos.
 */
export function PinoView({ initial, initialVersion, linkError, onChange }: Props) {
  const [dataset, setDataset] = useState<PinoDataset | null>(null);
  const [csv, setCsv] = useState('');
  const [origen, setOrigen] = useState('');
  const [error, setError] = useState('');
  const [options, setOptions] = useState<PinoOptions>(() => defaultPinoOptions([]));
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initial) return;
    try {
      const nuevo = parsePinoCsv(initial.csv);
      setDataset(nuevo);
      setCsv(initial.csv);
      setOrigen(initial.sourceName);
      setOptions(sanearOpciones(nuevo, initial.options));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el CSV del enlace.');
    }
    // Sólo cuando llega un enlace nuevo: los cambios posteriores son del usuario.
  }, [initialVersion]);

  useEffect(() => {
    if (!csv || !dataset) return;
    onChange({ csv, sourceName: origen || 'pino-por-cliente.csv', options });
  }, [csv, dataset, onChange, options, origen]);

  async function cargar(file: File | undefined) {
    if (!file) return;
    try {
      const texto = await file.text();
      const nuevo = parsePinoCsv(texto);
      setDataset(nuevo);
      setCsv(texto);
      setOrigen(file.name);
      setOptions(defaultPinoOptions(nuevo.anios));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el CSV.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className={`pino ${dataset ? '' : 'pino--vacio'}`} aria-labelledby="pino-titulo">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(evento) => void cargar(evento.target.files?.[0])}
      />

      {!dataset ? (
        <>
          <div className="vacio pino__bienvenida">
            <h2 id="pino-titulo" className="vacio__titulo">
              Carga el CSV de pino por cliente
            </h2>
            <p>
              Es la hoja mensual con el desglose por tipo de madera y cliente de destino. Se lee
              aquí mismo, en tu navegador, y queda dentro del enlace: para enseñárselo a alguien
              basta con pasarle la dirección.
            </p>
          </div>

          <div
            className={`zona pino__zona no-imprimir ${arrastrando ? 'zona--activa' : ''}`}
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
              Elegir el CSV de pino
            </button>
            <p className="zona__pista">
              O arrástralo aquí. Se lee en tu navegador; ni se sube ni se guarda en ningún sitio.
            </p>
          </div>
        </>
      ) : (
        <header className="pino__cabecera">
          <div>
            <p className="eyebrow">Desglose por madera y destino</p>
            <h2 id="pino-titulo" className="pino__titulo">
              Pino por cliente
            </h2>
            <p className="pino__intro">
              Cuánto se vendió de cada tipo de madera, a quién y cuándo. Elige un tipo o un cliente
              para verlo todo desde ahí, y pulsa un mes para bajar al detalle.
            </p>
          </div>

          <div className="pino__carga no-imprimir">
            <button className="boton" type="button" onClick={() => inputRef.current?.click()}>
              Cargar otro CSV
            </button>
            {origen && (
              <span className="pino__archivo" title={origen}>
                {origen}
              </span>
            )}
          </div>
        </header>
      )}

      {linkError && !dataset && (
        <div className="aviso" role="alert">
          El desglose de este enlace no se puede leer. Puede que la dirección esté incompleta.
        </div>
      )}

      {error && (
        <div className="aviso" role="alert">
          {error}
        </div>
      )}

      {dataset && <PinoPanel dataset={dataset} options={options} onOptions={setOptions} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

interface PanelProps {
  dataset: PinoDataset;
  options: PinoOptions;
  onOptions: (options: PinoOptions) => void;
}

function PinoPanel({ dataset, options, onOptions }: PanelProps) {
  const { aniosVisibles, tipoFoco, clienteFoco, mesFoco, base } = options;
  const filtro = { tipo: tipoFoco, cliente: clienteFoco };

  const { anios, registros } = useMemo(() => {
    const visibles = dataset.anios.filter((anio) => aniosVisibles.includes(anio));
    return {
      anios: visibles,
      registros: dataset.registros.filter((registro) => visibles.includes(registro.anio)),
    };
  }, [dataset, aniosVisibles]);

  // El ámbito es lo que miran las cifras, los quesitos y las tablas: el mes
  // fijado si lo hay, y si no, todos los meses visibles.
  const ambito = mesFoco
    ? registros.filter((registro) => esMes(registro, mesFoco))
    : registros;

  const series = useMemo(
    () => seriesDe(dataset, tipoFoco, clienteFoco),
    [dataset, tipoFoco, clienteFoco],
  );

  const cambiar = (parcial: Partial<PinoOptions>) => onOptions({ ...options, ...parcial });

  function alternarAnio(anio: number) {
    const siguientes = aniosVisibles.includes(anio)
      ? aniosVisibles.filter((actual) => actual !== anio)
      : [...aniosVisibles, anio];
    if (siguientes.length === 0) return; // Sin ningún año no queda nada que ver.
    cambiar({
      aniosVisibles: siguientes,
      mesFoco: mesFoco && !siguientes.includes(mesFoco.anio) ? null : mesFoco,
    });
  }

  const tnAmbito = toneladas(ambito, filtro);
  const tnAmbitoSinFiltro = toneladas(ambito);
  const tnAnioDelMes = mesFoco
    ? toneladas(registros.filter((registro) => registro.anio === mesFoco.anio), filtro)
    : 0;

  const nombreAmbito = mesFoco
    ? `${MESES_CORTOS[mesFoco.mesIndex]} ${mesFoco.anio}`
    : anios.length === 1
      ? String(anios[0])
      : `${anios[0]}–${anios[anios.length - 1]}`;

  const nombreFiltro = [
    tipoFoco ? dataset.tipos.find((tipo) => tipo.id === tipoFoco)?.label : null,
    clienteFoco ? dataset.clientes.find((cliente) => cliente.id === clienteFoco)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const notas = registros.filter(
    (registro) => registro.notas && (!mesFoco || esMes(registro, mesFoco)),
  );
  const descuadres = registros.filter(
    (registro) =>
      registro.totalDeclarado !== null && Math.abs(registro.total - registro.totalDeclarado) >= 0.5,
  );

  return (
    <>
      <Filtros
        dataset={dataset}
        options={options}
        onAnio={alternarAnio}
        onCambio={cambiar}
        nombreAmbito={nombreAmbito}
      />

      <Cifras
        dataset={dataset}
        ambito={ambito}
        registros={registros}
        options={options}
        tnAmbito={tnAmbito}
        tnAmbitoSinFiltro={tnAmbitoSinFiltro}
        tnAnioDelMes={tnAnioDelMes}
        nombreAmbito={nombreAmbito}
        nombreFiltro={nombreFiltro}
      />

      <PinoBarras
        registros={registros}
        anios={anios}
        series={series}
        filtro={filtro}
        mesFoco={mesFoco}
        onMes={(mes) => cambiar({ mesFoco: mes })}
      />

      <Quesitos
        dataset={dataset}
        ambito={ambito}
        options={options}
        nombreAmbito={nombreAmbito}
        onCambio={cambiar}
      />

      <PinoRanking
        dataset={dataset}
        registros={ambito}
        tipoFoco={tipoFoco}
        clienteFoco={clienteFoco}
        onCliente={(cliente) => cambiar({ clienteFoco: cliente })}
      />

      <PinoMatriz
        dataset={dataset}
        registros={ambito}
        base={base}
        tipoFoco={tipoFoco}
        clienteFoco={clienteFoco}
        onBase={(nueva: PinoBase) => cambiar({ base: nueva })}
      />

      <PinoCalendario
        registros={registros}
        anios={anios}
        filtro={filtro}
        mesFoco={mesFoco}
        onMes={(mes) => cambiar({ mesFoco: mes })}
      />

      {(notas.length > 0 || descuadres.length > 0) && (
        <div className="pino__notas">
          <p className="eyebrow">Notas de la hoja</p>
          {descuadres.map((registro) => (
            <p key={`descuadre-${registro.anio}-${registro.mesIndex}`} className="pino__nota">
              <strong>
                {registro.mes} {registro.anio}
              </strong>
              El detalle por cliente suma {tn(registro.total)} TN y la hoja da{' '}
              {tn(registro.totalDeclarado ?? 0)} TN como total del mes. Aquí se usa siempre el
              detalle, que es lo que permite repartir por cliente.
            </p>
          ))}
          {notas.map((registro) => (
            <p key={`nota-${registro.anio}-${registro.mesIndex}`} className="pino__nota">
              <strong>
                {registro.mes} {registro.anio}
              </strong>
              {registro.notas}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Filtros: una sola fila que manda sobre todos los paneles
// ---------------------------------------------------------------------------

interface FiltrosProps {
  dataset: PinoDataset;
  options: PinoOptions;
  onAnio: (anio: number) => void;
  onCambio: (parcial: Partial<PinoOptions>) => void;
  nombreAmbito: string;
}

function Filtros({ dataset, options, onAnio, onCambio, nombreAmbito }: FiltrosProps) {
  const { aniosVisibles, tipoFoco, clienteFoco, mesFoco } = options;
  const hayFiltro = tipoFoco !== null || clienteFoco !== null || mesFoco !== null;

  return (
    <div className="pino__filtros no-imprimir" aria-label="Filtros del desglose">
      <div className="pino__filtro-grupo">
        <span className="eyebrow">Años</span>
        <div className="pino__chips">
          {dataset.anios.map((anio) => {
            const visible = aniosVisibles.includes(anio);
            return (
              <button
                key={anio}
                className={`pino__chip ${visible ? 'pino__chip--activo' : ''}`}
                type="button"
                aria-pressed={visible}
                onClick={() => onAnio(anio)}
              >
                {anio}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pino__filtro-grupo">
        <span className="eyebrow">Tipo de madera</span>
        <div className="pino__chips">
          <button
            className={`pino__chip ${tipoFoco === null ? 'pino__chip--activo' : ''}`}
            type="button"
            aria-pressed={tipoFoco === null}
            onClick={() => onCambio({ tipoFoco: null })}
          >
            Todos
          </button>
          {dataset.tipos.map((tipo) => {
            const activo = tipoFoco === tipo.id;
            return (
              <button
                key={tipo.id}
                className={`pino__chip pino__chip--tipo ${activo ? 'pino__chip--activo' : ''}`}
                type="button"
                aria-pressed={activo}
                style={{ '--chip-color': colorDeTipo(dataset, tipo.id) } as CSSProperties}
                onClick={() => onCambio({ tipoFoco: activo ? null : tipo.id })}
              >
                <span className="pino__muestra" style={{ background: colorDeTipo(dataset, tipo.id) }} />
                {tipo.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="pino__filtro-grupo">
        <span className="eyebrow">Cliente</span>
        <select
          className="pino__select"
          value={clienteFoco ?? ''}
          onChange={(evento) => onCambio({ clienteFoco: evento.target.value || null })}
        >
          <option value="">Todos los clientes</option>
          {dataset.clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.label}
            </option>
          ))}
        </select>
      </label>

      <div className="pino__filtro-grupo pino__filtro-grupo--ambito">
        <span className="eyebrow">Viendo</span>
        <div className="pino__ambito">
          <strong>{nombreAmbito}</strong>
          {hayFiltro && (
            <button
              className="linkish"
              type="button"
              onClick={() => onCambio({ tipoFoco: null, clienteFoco: null, mesFoco: null })}
            >
              Quitar filtros
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cifras del ámbito
// ---------------------------------------------------------------------------

interface CifrasProps {
  dataset: PinoDataset;
  ambito: PinoRecord[];
  registros: PinoRecord[];
  options: PinoOptions;
  tnAmbito: number;
  tnAmbitoSinFiltro: number;
  tnAnioDelMes: number;
  nombreAmbito: string;
  nombreFiltro: string;
}

function Cifras({
  dataset,
  ambito,
  registros,
  options,
  tnAmbito,
  tnAmbitoSinFiltro,
  tnAnioDelMes,
  nombreAmbito,
  nombreFiltro,
}: CifrasProps) {
  const { tipoFoco, clienteFoco, mesFoco } = options;
  const hayFiltro = tipoFoco !== null || clienteFoco !== null;

  const resumen = useMemo(
    () => resumir(ambito, { tipo: tipoFoco, cliente: clienteFoco }),
    [ambito, tipoFoco, clienteFoco],
  );

  // La cuarta casilla mira al eje que no se ha fijado: con un cliente elegido
  // interesa qué madera se le manda; sin él, quién se lleva más.
  const lider = clienteFoco
    ? Object.entries(resumen.porTipo)
        .sort((a, b) => b[1] - a[1])
        .map(([id, valor]) => ({
          nombre: dataset.tipos.find((tipo) => tipo.id === id)?.label ?? id,
          valor,
        }))[0]
    : Object.entries(resumen.porCliente)
        .sort((a, b) => b[1] - a[1])
        .map(([id, valor]) => ({
          nombre: dataset.clientes.find((cliente) => cliente.id === id)?.label ?? id,
          valor,
        }))[0];

  const mesesConDatos = ambito.length;
  const mejor = useMemo(
    () => mejorMes(registros, { tipo: tipoFoco, cliente: clienteFoco }),
    [registros, tipoFoco, clienteFoco],
  );

  return (
    <section className="pino__cifras" aria-label={`Cifras de ${nombreAmbito}`}>
      <Casilla
        etiqueta={`Toneladas de ${nombreAmbito}`}
        valor={tn(tnAmbito)}
        unidad="TN"
        pie={nombreFiltro || 'Todo el pino de esos meses'}
      />

      {hayFiltro ? (
        <Casilla
          etiqueta="Del suministro del ámbito"
          valor={cuotaPct(cuota(tnAmbito, tnAmbitoSinFiltro))}
          pie={`Sobre las ${tnRedondo(tnAmbitoSinFiltro)} TN de pino de ${nombreAmbito}`}
          medidor={cuota(tnAmbito, tnAmbitoSinFiltro)}
        />
      ) : (
        <Casilla
          etiqueta="Media por mes"
          valor={tnRedondo(mesesConDatos > 0 ? tnAmbito / mesesConDatos : 0)}
          unidad="TN"
          pie={`${mesesConDatos} ${mesesConDatos === 1 ? 'mes' : 'meses'} con datos`}
        />
      )}

      {mesFoco ? (
        <Casilla
          etiqueta={`Peso del mes en ${mesFoco.anio}`}
          valor={cuotaPct(cuota(tnAmbito, tnAnioDelMes))}
          pie={`Sobre las ${tnRedondo(tnAnioDelMes)} TN de ${mesFoco.anio}${
            nombreFiltro ? ` de ${nombreFiltro}` : ''
          }`}
          medidor={cuota(tnAmbito, tnAnioDelMes)}
        />
      ) : (
        <Casilla
          etiqueta="Mejor mes del ámbito"
          valor={mejor?.texto ?? '—'}
          pie={mejor ? `${tnRedondo(mejor.valor)} TN` : 'Sin datos'}
          estrecho
        />
      )}

      <Casilla
        etiqueta={clienteFoco ? 'Su madera principal' : 'Mayor cliente'}
        valor={lider?.nombre ?? '—'}
        pie={
          lider
            ? `${tnRedondo(lider.valor)} TN · ${cuotaPct(cuota(lider.valor, resumen.total))} del ámbito`
            : 'Sin toneladas'
        }
        estrecho
      />
    </section>
  );
}

function mejorMes(registros: PinoRecord[], filtro: { tipo: string | null; cliente: string | null }) {
  const mejor = registros
    .map((registro) => ({ registro, valor: toneladas([registro], filtro) }))
    .sort((a, b) => b.valor - a.valor)[0];

  if (!mejor || mejor.valor <= 0) return null;
  return {
    texto: `${MESES_CORTOS[mejor.registro.mesIndex]} ${mejor.registro.anio}`,
    valor: mejor.valor,
  };
}

function Casilla({
  etiqueta,
  valor,
  unidad,
  pie,
  medidor,
  estrecho,
}: {
  etiqueta: string;
  valor: string;
  unidad?: string;
  pie: string;
  medidor?: number | null;
  estrecho?: boolean;
}) {
  return (
    <div className="pino__casilla">
      <p className="eyebrow">{etiqueta}</p>
      <p className={`pino__casilla-valor ${estrecho ? 'pino__casilla-valor--texto' : ''}`}>
        {valor}
        {unidad && <span className="pino__casilla-unidad">{unidad}</span>}
      </p>
      {medidor !== undefined && medidor !== null && (
        <span className="pino__medidor" aria-hidden="true">
          <span className="pino__medidor-relleno" style={{ width: `${Math.min(100, medidor * 100)}%` }} />
        </span>
      )}
      <p className="pino__casilla-pie">{pie}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quesitos
// ---------------------------------------------------------------------------

interface QuesitosProps {
  dataset: PinoDataset;
  ambito: PinoRecord[];
  options: PinoOptions;
  nombreAmbito: string;
  onCambio: (parcial: Partial<PinoOptions>) => void;
}

function Quesitos({ dataset, ambito, options, nombreAmbito, onCambio }: QuesitosProps) {
  const { tipoFoco, clienteFoco } = options;

  // El quesito de maderas enseña siempre las tres, aunque haya una elegida: si
  // se filtrara quedaría una porción del 100%, que no dice nada. Con foco, las
  // demás se apagan y se sigue viendo sobre qué parte del total se está.
  const porTipo = useMemo(() => resumir(ambito, { cliente: clienteFoco }), [ambito, clienteFoco]);
  const porCliente = useMemo(() => resumir(ambito, { tipo: tipoFoco }), [ambito, tipoFoco]);

  const sectoresTipo: Sector[] = dataset.tipos.map((tipo) => ({
    clave: tipo.id,
    label: tipo.label,
    valor: porTipo.porTipo[tipo.id] ?? 0,
    color: colorDeTipo(dataset, tipo.id),
    tenue: tipoFoco !== null && tipoFoco !== tipo.id,
  }));

  // Cada cliente se pinta con el tono de la madera que más le mandan, en el
  // escalón que ocupa dentro de ella: así el quesito de clientes y el de
  // maderas cuentan lo mismo con los mismos colores.
  //
  // Van todos, uno por uno, por pequeños que sean. Un cliente escondido detrás
  // de un «otros» es justo el que hay que ir a buscar a mano.
  const sectoresCliente: Sector[] = dataset.clientes
    .map((cliente) => {
      const valor = porCliente.porCliente[cliente.id] ?? 0;
      const dominante =
        dataset.tipos
          .map((tipo) => ({ tipo: tipo.id, valor: porCliente.matriz[tipo.id]?.[cliente.id] ?? 0 }))
          .sort((a, b) => b.valor - a.valor)[0]?.tipo ?? dataset.tipos[0]?.id;
      const hermanos = dataset.clientesPorTipo[dominante] ?? [];

      return {
        clave: cliente.id,
        label: cliente.label,
        valor,
        color: pasoDeRampa(
          colorDeTipo(dataset, dominante),
          Math.max(0, hermanos.indexOf(cliente.id)),
          hermanos.length,
        ),
        tenue: clienteFoco !== null && clienteFoco !== cliente.id,
      };
    })
    .filter((sector) => sector.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  const tipoElegido = dataset.tipos.find((tipo) => tipo.id === tipoFoco);
  const clienteElegido = dataset.clientes.find((cliente) => cliente.id === clienteFoco);

  return (
    <div className="pino__quesitos">
      <PinoQuesito
        titulo="Por tipo de madera"
        subtitulo={
          clienteElegido
            ? `Lo que se le mandó a ${clienteElegido.label} en ${nombreAmbito}`
            : `Todo el pino de ${nombreAmbito}`
        }
        sectores={sectoresTipo}
        totalEtiqueta={`TN · ${nombreAmbito}`}
        onElegir={(clave) => onCambio({ tipoFoco: tipoFoco === clave ? null : clave })}
      />

      <PinoQuesito
        titulo="Por cliente"
        subtitulo={
          tipoElegido
            ? `Quién se llevó el ${tipoElegido.label.toLocaleLowerCase('es')} en ${nombreAmbito}`
            : `Todo el pino de ${nombreAmbito}`
        }
        sectores={sectoresCliente}
        totalEtiqueta={`TN · ${nombreAmbito}`}
        onElegir={(clave) => onCambio({ clienteFoco: clienteFoco === clave ? null : clave })}
      />
    </div>
  );
}
