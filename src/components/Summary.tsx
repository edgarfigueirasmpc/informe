import type { SummaryView } from '../lib/model';
import { delta, tn, tnRedondo } from '../lib/format';

interface Props {
  summary: SummaryView;
}

/**
 * La fila de arriba del boceto: total acumulado, media por día y estimación
 * mensual. Las dos últimas responden a las simulaciones de la tabla.
 *
 * Cada bloque enseña dos cifras: la que firma la cabecera del PDF (la grande,
 * que es la referencia y la base de las simulaciones) y la que sale de sumar
 * cliente a cliente. No coinciden porque el informe no cuadra consigo mismo, y
 * conviene tener las dos a la vista en lugar de esconder la diferencia.
 */
export function Summary({ summary }: Props) {
  const haySimulacion = Math.abs(summary.delta) >= 0.5;

  return (
    <section className="resumen" aria-label="Resumen del mes">
      <div className="resumen__celda resumen__celda--real">
        <div className="eyebrow">
          Total acumulado <span className="eyebrow__fuente">· del informe</span>
        </div>
        <div className="resumen__valor num">
          {tn(summary.totalMes)}
          <span className="resumen__unidad">TN</span>
        </div>
        <div className="resumen__pie">
          {summary.diasTrabajados} {summary.diasTrabajados === 1 ? 'día' : 'días'} trabajados
        </div>
        <Contraste
          valor={tn(summary.sumaClientes)}
          diferencia={summary.sumaClientes - summary.totalMes}
          decimales={2}
        />
      </div>

      <div className="resumen__celda resumen__celda--ritmo">
        <div className="eyebrow">
          TN medias por día <span className="eyebrow__fuente">· del informe</span>
        </div>
        <div className="resumen__valor num">
          {tn(summary.media)}
          <span className="resumen__unidad">TN</span>
        </div>
        <div className="resumen__pie">
          {haySimulacion ? (
            <>
              <span className="resumen__tachado num">{tn(summary.mediaBase)}</span>{' '}
              <span className="resumen__delta num">
                {delta(summary.media - summary.mediaBase, 2)}
              </span>
            </>
          ) : (
            'Ritmo real del mes'
          )}
        </div>
        <Contraste
          valor={tn(summary.mediaClientes)}
          diferencia={summary.mediaClientes - summary.media}
          decimales={2}
        />
      </div>

      <div className="resumen__celda resumen__celda--proyeccion">
        <div className="eyebrow">
          Estimación mensual <span className="eyebrow__fuente">· del informe</span>
        </div>
        <div className="resumen__valor num">
          {tnRedondo(summary.estimacion)}
          <span className="resumen__unidad">TN</span>
        </div>
        <div className="resumen__pie">
          {haySimulacion ? (
            <>
              <span className="resumen__tachado num">{tnRedondo(summary.estimacionBase)}</span>{' '}
              <span className="resumen__delta num">{delta(summary.delta)}</span>
            </>
          ) : (
            `Sobre ${summary.diasTotales} días laborables`
          )}
        </div>
        <Contraste
          valor={tnRedondo(summary.estimacionClientes)}
          diferencia={summary.estimacionClientes - summary.estimacion}
          decimales={0}
        />
      </div>
    </section>
  );
}

/** La misma magnitud, sumada cliente a cliente, con su desvío. */
function Contraste({
  valor,
  diferencia,
  decimales,
}: {
  valor: string;
  diferencia: number;
  decimales: number;
}) {
  const cuadra = Math.abs(diferencia) < (decimales === 0 ? 0.5 : 0.005);

  return (
    <div
      className="contraste"
      title="La misma cifra calculada sumando las quincenas de cada cliente, en vez de leerla de la cabecera del PDF."
    >
      <span className="contraste__fuente">Sumando clientes</span>
      <span className="contraste__cifras">
        <span className="num">{valor}</span>
        <span className={`contraste__dif num ${cuadra ? 'contraste__dif--cuadra' : ''}`}>
          {cuadra ? 'cuadra' : delta(diferencia, decimales)}
        </span>
      </span>
    </div>
  );
}
