import type { ClientView, ReportView, Species } from '../lib/model';
import { cupoStatus, SPECIES_LABEL } from '../lib/model';
import { porcentaje, tn, tnRedondo } from '../lib/format';
import { EditableNumber } from './EditableNumber';

interface Props {
  view: ReportView;
  onSetMedia: (client: string, media: number | null) => void;
}

const ETIQUETA_CUPO: Record<ReturnType<typeof cupoStatus>, string> = {
  'sin-cupo': '',
  holgado: 'Se cubre',
  justo: 'Justo',
  corto: 'No llega',
};

export function ClientsTable({ view, onSetMedia }: Props) {
  const { clients, summary } = view;
  // Pino y eucalipto siempre; "otras" sólo cuando el informe trae algo.
  const columnas: Species[] = ['pino', 'eucalipto'];
  if (view.speciesEnUso.includes('otras')) columnas.push('otras');

  const hayCupos = clients.some((c) => c.cupoPendiente !== null);
  // La tabla viene ordenada de mayor a menor, así que el primero da la escala.
  const mayor = clients[0]?.total || 1;
  const totalPor = (s: Species) => clients.reduce((acc, c) => acc + (c.tn[s] || 0), 0);

  return (
    <div className="tabla-envoltorio">
      <table className="tabla">
        <thead>
          <tr>
            <th scope="col">Cliente</th>
            {columnas.map((s) => (
              <th scope="col" key={s}>
                <span className={`punto-especie punto-especie--${s}`} aria-hidden="true" />
                {SPECIES_LABEL[s]}
              </th>
            ))}
            <th scope="col">Total TN</th>
            <th scope="col" className="col--editable">TN / día</th>
            <th scope="col" className="col--editable">Estimación mes</th>
            {hayCupos && <th scope="col">Pendiente cupo</th>}
          </tr>
        </thead>

        <tbody>
          {clients.map((c) => (
            <Fila
              key={c.name}
              client={c}
              columnas={columnas}
              hayCupos={hayCupos}
              mayor={mayor}
              diasTotales={summary.diasTotales}
              onSetMedia={onSetMedia}
            />
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td>Totales de clientes</td>
            {columnas.map((s) => (
              <td className="num" key={s} data-etiqueta={SPECIES_LABEL[s]}>
                {tn(totalPor(s))}
              </td>
            ))}
            <td className="num" data-etiqueta="Total TN">
              {tn(summary.sumaClientes)}
            </td>
            {/* Las mismas cifras que enseña el resumen como "sumando clientes". */}
            <td className="num col--editable" data-etiqueta="TN / día">
              {tn(summary.mediaClientes)}
            </td>
            <td className="num col--editable" data-etiqueta="Estimación mes">
              {tnRedondo(summary.estimacionClientes)}
            </td>
            {hayCupos && (
              <td className="num" data-etiqueta="Pendiente cupo">
                {tn(clients.reduce((acc, c) => acc + (c.cupoPendiente ?? 0), 0))}
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface FilaProps {
  client: ClientView;
  columnas: Species[];
  hayCupos: boolean;
  mayor: number;
  diasTotales: number;
  onSetMedia: (client: string, media: number | null) => void;
}

function Fila({ client: c, columnas, hayCupos, mayor, diasTotales, onSetMedia }: FilaProps) {
  const estado = cupoStatus(c);

  return (
    <tr className={c.editado ? 'fila--editada' : undefined}>
      <td>
        <span className="cliente__nombre">{c.name}</span>

        {/* Cuánto pesa este cliente frente al mayor, y de qué especie es. */}
        <span
          className="barra"
          title={`${tn(c.total)} TN · ${porcentaje(c.total / mayor)} del mayor cliente`}
        >
          <span className="barra__relleno" style={{ width: `${(c.total / mayor) * 100}%` }}>
            {columnas.map((s) =>
              (c.tn[s] || 0) > 0 ? (
                <span
                  key={s}
                  className={`barra__seg barra__seg--${s}`}
                  style={{ flexGrow: c.tn[s] }}
                />
              ) : null,
            )}
          </span>
        </span>

        {c.editado && (
          <button
            type="button"
            className="cliente__pie linkish no-imprimir"
            onClick={() => onSetMedia(c.name, null)}
          >
            Simulado · volver a {tn(c.mediaBase)} TN/día
          </button>
        )}
      </td>

      {columnas.map((s) => {
        const valor = c.tn[s] || 0;
        return (
          <td
            key={s}
            className={`num ${valor === 0 ? 'celda--nula' : 'celda--suave'}`}
            data-etiqueta={SPECIES_LABEL[s]}
          >
            {valor === 0 ? '—' : tn(valor)}
          </td>
        );
      })}

      <td className="num celda--fuerte" data-etiqueta="Total TN">
        {tn(c.total)}
      </td>

      <td className="celda--editable" data-etiqueta="TN / día">
        <EditableNumber
          value={c.media}
          base={c.mediaBase}
          editado={c.editado}
          label={`TN por día de ${c.name}`}
          onChange={(v) => onSetMedia(c.name, v)}
        />
      </td>

      <td className="celda--editable" data-etiqueta="Estimación mes">
        <EditableNumber
          value={c.estimacion}
          base={c.estimacionBase}
          editado={c.editado}
          decimals={0}
          label={`Estimación mensual de ${c.name}`}
          onChange={(v) => onSetMedia(c.name, v === null ? null : v / diasTotales)}
        />
      </td>

      {hayCupos && (
        <td className="num" data-etiqueta="Pendiente cupo">
          {c.cupoPendiente === null ? (
            <span className="celda--nula">—</span>
          ) : (
            <span
              className={`cupo cupo--${estado}`}
              title={
                `Quedan ${tn(c.cupoPendiente)} TN de cupo por servir. ` +
                `Al ritmo actual se entregarían ${tnRedondo(c.restanteEstimado)} TN en lo que ` +
                `resta de mes` +
                (c.cupoRatio !== null ? ` (${porcentaje(c.cupoRatio)} del cupo).` : '.')
              }
            >
              <span className="cupo__punto" aria-hidden="true" />
              {tn(c.cupoPendiente)}
              <span className="eyebrow">{ETIQUETA_CUPO[estado]}</span>
            </span>
          )}
        </td>
      )}
    </tr>
  );
}
