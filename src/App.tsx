import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeView,
  EMPTY_OVERRIDES,
  ordenarClientes,
  ORDEN_POR_DEFECTO,
  type CampoOrden,
  type Orden,
  type Overrides,
  type Report,
  type Species,
} from './lib/model';
import { fechaCorta, fechaHora } from './lib/format';
import {
  cargaDelFragmento,
  codificar,
  descodificar,
  fragmentoConCarga,
} from './lib/share';
import { FirmaMpc, Mark } from './components/Mark';
import { Summary } from './components/Summary';
import { ClientsTable } from './components/ClientsTable';
import { Loader } from './components/Loader';
import { EditableNumber } from './components/EditableNumber';
import { Compartir } from './components/Compartir';
import { Grafica } from './components/Grafica';

type Estado =
  | { fase: 'leyendo-url' }
  | { fase: 'vacio' }
  | { fase: 'roto' }
  | { fase: 'listo'; report: Report; overrides: Overrides };

export default function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'leyendo-url' });

  // Lo último que hemos escrito nosotros en la barra de direcciones, para no
  // volver a interpretar como enlace entrante lo que acabamos de generar.
  const propio = useRef<string>('');

  // La dirección para compartir. Se guarda como estado en vez de leerla de
  // `location` allí donde haga falta, porque se reescribe en una tarea
  // asíncrona y quien la leyera durante el render vería la anterior.
  const [enlace, setEnlace] = useState(() => location.href);

  const escribirUrl = useCallback(async (report: Report, overrides: Overrides) => {
    const fragmento = fragmentoConCarga(await codificar(report, overrides));
    propio.current = fragmento;
    history.replaceState(null, '', fragmento);
    setEnlace(location.href);
  }, []);

  // Al abrir la página, y cada vez que llega un enlace distinto.
  useEffect(() => {
    let vigente = true;

    async function leer() {
      const carga = cargaDelFragmento(location.hash);
      if (!carga) {
        if (vigente) setEstado({ fase: 'vacio' });
        return;
      }

      const compartido = await descodificar(carga);
      if (!vigente) return;

      setEnlace(location.href);
      setEstado(
        compartido
          ? { fase: 'listo', report: compartido.report, overrides: compartido.overrides }
          : { fase: 'roto' },
      );
    }

    void leer();

    function alCambiarElHash() {
      if (location.hash === propio.current) return;
      void leer();
    }

    addEventListener('hashchange', alCambiarElHash);
    return () => {
      vigente = false;
      removeEventListener('hashchange', alCambiarElHash);
    };
  }, []);

  /** Un PDF recién leído sustituye a lo que hubiera. */
  const cargar = useCallback(
    (report: Report) => {
      setEstado({ fase: 'listo', report, overrides: EMPTY_OVERRIDES });
      void escribirUrl(report, EMPTY_OVERRIDES);
    },
    [escribirUrl],
  );

  /** Toda simulación se refleja en la URL: el enlace siempre es lo que se ve. */
  const cambiarOverrides = useCallback(
    (fn: (previo: Overrides) => Overrides) => {
      setEstado((previo) => {
        if (previo.fase !== 'listo') return previo;
        const overrides = fn(previo.overrides);
        void escribirUrl(previo.report, overrides);
        return { ...previo, overrides };
      });
    },
    [escribirUrl],
  );

  const setMedia = useCallback(
    (cliente: string, media: number | null) => {
      cambiarOverrides((previo) => {
        const clients = { ...previo.clients };
        if (media === null || !Number.isFinite(media)) delete clients[cliente];
        else clients[cliente] = media;
        return { ...previo, clients };
      });
    },
    [cambiarOverrides],
  );

  const view = useMemo(
    () => (estado.fase === 'listo' ? computeView(estado.report, estado.overrides) : null),
    [estado],
  );

  // El orden vive aquí para que la tabla y la gráfica enseñen siempre lo mismo:
  // se ordena pulsando una cabecera y las dos se reordenan a la vez.
  const [orden, setOrden] = useState<Orden>(ORDEN_POR_DEFECTO);

  const cambiarOrden = useCallback((campo: CampoOrden) => {
    setOrden((previo) =>
      previo.campo === campo
        ? { campo, desc: !previo.desc }
        : // Al estrenar columna: los nombres de la A a la Z, las cifras de
          // mayor a menor, que es lo que se espera de cada una.
          { campo, desc: campo !== 'nombre' },
    );
  }, []);

  const clientes = useMemo(
    () => (view ? ordenarClientes(view.clients, orden) : []),
    [view, orden],
  );

  const columnas = useMemo<Species[]>(() => {
    const cols: Species[] = ['pino', 'eucalipto'];
    if (view?.speciesEnUso.includes('otras')) cols.push('otras');
    return cols;
  }, [view]);

  if (estado.fase === 'leyendo-url') {
    return <div className="cargando">Abriendo el informe…</div>;
  }

  const report = estado.fase === 'listo' ? estado.report : null;
  const overrides = estado.fase === 'listo' ? estado.overrides : EMPTY_OVERRIDES;

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="masthead__title">
          <Mark />
          Informe de toneladas
        </h1>
        <span className="masthead__generado">
          {report && `Generado el ${fechaHora(report.publishedAt)}`}
        </span>

        <FirmaMpc lugar="cabecera" />
      </header>

      {estado.fase === 'roto' && (
        <div className="vacio">
          <p className="vacio__titulo">Este enlace no se puede leer</p>
          <p>
            Puede que se haya cortado al copiarlo o al enviarlo por mensajería. Pide que te lo
            reenvíen entero, o carga tú el PDF aquí abajo.
          </p>
        </div>
      )}

      {estado.fase === 'vacio' && (
        <div className="vacio">
          <p className="vacio__titulo">Carga el PDF del día</p>
          <p>
            Se lee aquí mismo, en tu navegador. El informe queda dentro del enlace, así que para
            enviárselo a alguien basta con pasarle la dirección.
          </p>
        </div>
      )}

      {report && view && (
        <>
          <div className="periodo">
            <h2 className="periodo__rango">
              {fechaCorta(report.header.desde)} — {fechaCorta(report.header.hasta)}
            </h2>
            <div className="periodo__dias">
              <span>{view.summary.diasTrabajados} trabajados</span>
              <span>{view.summary.diasRestantes} restantes</span>
              <span>{view.summary.diasTotales} laborables</span>
            </div>
          </div>

          <Summary summary={view.summary} />

          <div className="simbar no-imprimir">
            <label className="simbar__campo">
              <span className="eyebrow">Días laborables restantes</span>
              <span className="simbar__caja">
                <EditableNumber
                  value={view.summary.diasRestantes}
                  base={report.header.diasRestantes}
                  editado={overrides.diasRestantes !== undefined}
                  decimals={0}
                  label="Días laborables restantes"
                  onChange={(v) =>
                    cambiarOverrides((previo) => ({
                      ...previo,
                      diasRestantes: v === null ? undefined : Math.max(0, Math.round(v)),
                    }))
                  }
                />
              </span>
            </label>

            {view.summary.editado && (
              <>
                <span className="simbar__aviso">Estás viendo una simulación.</span>
                <button
                  className="linkish simbar__espacio"
                  type="button"
                  onClick={() => cambiarOverrides(() => EMPTY_OVERRIDES)}
                >
                  Volver a los datos del informe
                </button>
              </>
            )}
          </div>

          <Grafica
            clientes={clientes}
            columnas={columnas}
          />

          <ClientsTable
            view={view}
            clientes={clientes}
            orden={orden}
            onOrden={cambiarOrden}
            onSetMedia={setMedia}
          />

          <Compartir enlace={enlace} simulando={view.summary.editado} />

          <div className="notas">
            <p className="notas__titulo eyebrow">Cómo se calcula</p>
            <p>
              Cada cliente vale la suma de sus dos quincenas. Su media diaria es ese acumulado
              entre los {view.summary.diasTrabajados} días trabajados, y la estimación mensual, esa
              media por los {view.summary.diasTotales} días laborables del mes.
            </p>
            <p>
              Las dos columnas sombreadas se pueden escribir: cambia las TN por día o la estimación
              de un cliente y el resto se recalcula solo. Al hacerlo, arriba se traslada únicamente
              la diferencia respecto al dato original, de modo que el total de referencia sigue
              siendo el del informe. Vacía la casilla para volver al dato del PDF.
            </p>
            <p>
              Arriba conviven dos cifras por bloque. La grande es la que firma la cabecera del PDF
              y es la que sirve de referencia a las simulaciones; debajo, en pequeño, va la misma
              magnitud sumando cliente a cliente. No coinciden —el informe no cuadra consigo
              mismo—, así que se enseñan las dos en vez de elegir por ti.
            </p>
          </div>
        </>
      )}

      <Loader onLoaded={cargar} conInforme={report !== null} />

      <FirmaMpc />
    </div>
  );
}
