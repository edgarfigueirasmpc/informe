import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, getReport, getSession, logout, type Role } from './lib/api';
import { computeView, EMPTY_OVERRIDES, type Overrides, type Report } from './lib/model';
import { cacheReport, cachedReport, clearCache, loadOverrides, saveOverrides } from './lib/storage';
import { fechaCorta, fechaHora } from './lib/format';
import { Gate } from './components/Gate';
import { FirmaMpc, Mark } from './components/Mark';
import { Summary } from './components/Summary';
import { ClientsTable } from './components/ClientsTable';
import { Publisher } from './components/Publisher';
import { EditableNumber } from './components/EditableNumber';

type Sesion = 'comprobando' | 'fuera' | Role;

export default function App() {
  const [sesion, setSesion] = useState<Sesion>('comprobando');
  const [report, setReport] = useState<Report | null>(null);
  const [overrides, setOverrides] = useState<Overrides>(EMPTY_OVERRIDES);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // ¿Hay sesión abierta de un día anterior?
  useEffect(() => {
    getSession()
      .then(({ role }) => setSesion(role ?? 'fuera'))
      .catch(() => setSesion('fuera'));
  }, []);

  const aplicar = useCallback((nuevo: Report) => {
    setReport(nuevo);
    cacheReport(nuevo);
    setOverrides(loadOverrides(nuevo));
  }, []);

  // Con sesión: se pinta al momento lo último que se vio y se refresca detrás.
  useEffect(() => {
    if (sesion !== 'view' && sesion !== 'admin') return;

    const local = cachedReport();
    if (local) {
      setReport(local);
      setOverrides(loadOverrides(local));
    }

    setCargando(true);
    getReport()
      .then(aplicar)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setReport(null);
          clearCache();
        } else if (!local) {
          setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el informe.');
        }
      })
      .finally(() => setCargando(false));
  }, [sesion, aplicar]);

  const cambiarOverrides = useCallback(
    (fn: (previo: Overrides) => Overrides) => {
      setOverrides((previo) => {
        const siguiente = fn(previo);
        if (report) saveOverrides(report, siguiente);
        return siguiente;
      });
    },
    [report],
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
    () => (report ? computeView(report, overrides) : null),
    [report, overrides],
  );

  if (sesion === 'comprobando') {
    return <div className="cargando">Comprobando el acceso…</div>;
  }

  if (sesion === 'fuera') {
    return <Gate onEnter={setSesion} />;
  }

  const esAdmin = sesion === 'admin';

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="masthead__title">
          <Mark />
          Informe de toneladas
        </h1>
        <div className="masthead__meta no-imprimir">
          {report && <span>Actualizado el {fechaHora(report.publishedAt)}</span>}
          {esAdmin && <span className="eyebrow distintivo">Puedes publicar</span>}
          <button
            className="linkish"
            type="button"
            onClick={() => {
              clearCache();
              void logout().finally(() => {
                setReport(null);
                setOverrides(EMPTY_OVERRIDES);
                setSesion('fuera');
              });
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {error && !report && (
        <div className="aviso" role="alert">
          {error}
        </div>
      )}

      {!report && !cargando && !error && (
        <div className="vacio">
          <p className="vacio__titulo">Todavía no hay ningún informe publicado</p>
          <p>
            {esAdmin
              ? 'Sube el PDF del día para que lo vea todo el mundo.'
              : 'En cuanto se suba el PDF del día aparecerá aquí.'}
          </p>
        </div>
      )}

      {!report && cargando && <div className="cargando">Cargando el informe…</div>}

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

          <ClientsTable view={view} onSetMedia={setMedia} />

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

      {/* Fuera del bloque anterior a propósito: el día que se despliega esto
          todavía no hay informe, y es justo cuando hace falta poder subirlo. */}
      {esAdmin && !cargando && <Publisher onPublished={aplicar} />}

      <FirmaMpc />
    </div>
  );
}
