import type { SummaryView } from '../lib/model';
import { delta, tn, tnRedondo } from '../lib/format';

interface Props {
  summary: SummaryView;
}

/**
 * Total acumulado, media por día y estimación mensual calculados desde los
 * clientes activos. Las tres reaccionan a los ajustes de la tabla.
 *
 * Debajo queda la cifra original de la cabecera del PDF y su desviación frente
 * al cálculo, para conservar la trazabilidad sin darle la jerarquía principal.
 */
export function Summary({ summary }: Props) {
  return (
    <section className="resumen" aria-label="Resumen del mes">
      <div className="resumen__celda resumen__celda--real">
        <div className="eyebrow">
          Total acumulado <span className="eyebrow__fuente">· calculado</span>
        </div>
        <div className="resumen__valor num">
          {tn(summary.sumaClientes)}
          <span className="resumen__unidad">TN</span>
        </div>
        <div className="resumen__pie">
          {summary.diasTrabajados} {summary.diasTrabajados === 1 ? 'día' : 'días'} trabajados
        </div>
        <OriginalInforme
          valor={tn(summary.totalMes)}
          diferencia={summary.totalMes - summary.sumaClientes}
          decimales={2}
        />
      </div>

      <div className="resumen__celda resumen__celda--ritmo">
        <div className="eyebrow">
          TN medias por día <span className="eyebrow__fuente">· calculado</span>
        </div>
        <div className="resumen__valor num">
          {tn(summary.mediaClientes)}
          <span className="resumen__unidad">TN</span>
        </div>
        <div className="resumen__pie">Ritmo de los clientes activos</div>
        <OriginalInforme
          valor={tn(summary.mediaBase)}
          diferencia={summary.mediaBase - summary.mediaClientes}
          decimales={2}
        />
      </div>

      <div className="resumen__celda resumen__celda--proyeccion">
        <div className="eyebrow">
          Estimación mensual <span className="eyebrow__fuente">· calculada</span>
        </div>
        <div className="resumen__valor num">
          {tnRedondo(summary.estimacionClientes)}
          <span className="resumen__unidad">TN</span>
        </div>
        <div className="resumen__pie">Sobre {summary.diasTotales} días laborables</div>
        <OriginalInforme
          valor={tnRedondo(summary.estimacionInforme)}
          diferencia={summary.estimacionInforme - summary.estimacionClientes}
          decimales={0}
        />
      </div>
    </section>
  );
}

/** La cifra literal del PDF y su desvío respecto al cálculo principal. */
function OriginalInforme({
  valor,
  diferencia,
  decimales,
}: {
  valor: string;
  diferencia: number;
  decimales: number;
}) {
  // Cuadra si la diferencia no llega a media unidad del último decimal visible.
  const cuadra = Math.abs(diferencia) < (decimales === 0 ? 0.5 : 0.0005);

  return (
    <div
      className="contraste"
      title="Cifra original de la cabecera del PDF y diferencia respecto al cálculo de los clientes activos."
    >
      <span className="contraste__fuente">Cifra informe original</span>
      <span className="contraste__cifras">
        <span className="num">{valor}</span>
        <span className={`contraste__dif num ${cuadra ? 'contraste__dif--cuadra' : ''}`}>
          {cuadra ? 'cuadra' : delta(diferencia, decimales)}
        </span>
      </span>
    </div>
  );
}
