import type { CampoOrden, ClientView, Orden, ReportView, Species } from '../lib/model';
import { cupoStatus, SPECIES_LABEL } from '../lib/model';
import { porcentaje, tn, tnRedondo } from '../lib/format';
import { EditableNumber } from './EditableNumber';

interface Props {
  view: ReportView;
  /** Ya ordenados: el orden lo gobierna App, que lo comparte con la gráfica. */
  clientes: ClientView[];
  orden: Orden;
  onOrden: (campo: CampoOrden) => void;
  onSetMedia: (client: string, media: number | null) => void;
}

const ETIQUETA_CUPO: Record<ReturnType<typeof cupoStatus>, string> = {
  'sin-cupo': '',
  cubierto: 'Cubierto',
  pendiente: 'No cubierto',
};

export function ClientsTable({ view, clientes, orden, onOrden, onSetMedia }: Props) {
  const { summary } = view;
  // Pino y eucalipto siempre; "otras" sólo cuando el informe trae algo.
  const columnas: Species[] = ['pino', 'eucalipto'];
  if (view.speciesEnUso.includes('otras')) columnas.push('otras');

  const hayCupos = clientes.some((c) => c.cupoPendiente !== null);
  // La escala de las barras no depende del orden elegido, sino del mayor.
  const mayor = Math.max(...clientes.map((c) => c.total), 1);
  const totalPor = (s: Species) => clientes.reduce((acc, c) => acc + (c.tn[s] || 0), 0);

  return (
    <div className="tabla-envoltorio">
      <table className="tabla">
        <thead>
          <tr>
            <Cabecera campo="nombre" orden={orden} onOrden={onOrden} alineada="izquierda">
              Cliente
            </Cabecera>

            {columnas.map((s) => (
              <Cabecera key={s} campo={s} orden={orden} onOrden={onOrden}>
                <span className={`punto-especie punto-especie--${s}`} aria-hidden="true" />
                {SPECIES_LABEL[s]}
              </Cabecera>
            ))}

            <Cabecera campo="total" orden={orden} onOrden={onOrden}>
              Total TN
            </Cabecera>
            <Cabecera campo="media" orden={orden} onOrden={onOrden} editable>
              TN / día
            </Cabecera>
            <Cabecera campo="estimacion" orden={orden} onOrden={onOrden} editable>
              Estimación mes
            </Cabecera>
            {hayCupos && (
              <Cabecera campo="cupo" orden={orden} onOrden={onOrden}>
                Cupo actual
              </Cabecera>
            )}
          </tr>
        </thead>

        <tbody>
          {clientes.map((c) => (
            <Fila
              key={c.name}
              client={c}
              columnas={columnas}
              hayCupos={hayCupos}
              mayor={mayor}
              diasTrabajados={summary.diasTrabajados}
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
            <td className="num col--editable" data-etiqueta="Total TN">
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
              <td className="num" data-etiqueta="Cupo pendiente total">
                {tn(clientes.reduce((acc, c) => acc + (c.cupoPendiente ?? 0), 0))}
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface CabeceraProps {
  campo: CampoOrden;
  orden: Orden;
  onOrden: (campo: CampoOrden) => void;
  children: React.ReactNode;
  alineada?: 'izquierda';
  editable?: boolean;
}

/** Cabecera que ordena al pulsarla y dice en qué sentido está ordenando. */
function Cabecera({ campo, orden, onOrden, children, alineada, editable }: CabeceraProps) {
  const activa = orden.campo === campo;

  return (
    <th
      scope="col"
      className={editable ? 'col--editable' : undefined}
      aria-sort={activa ? (orden.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        className={`orden ${alineada === 'izquierda' ? 'orden--izquierda' : ''} ${
          activa ? 'orden--activa' : ''
        }`}
        onClick={() => onOrden(campo)}
        title={
          activa
            ? `Ordenado de ${orden.desc ? 'mayor a menor' : 'menor a mayor'}. Pulsa para invertir.`
            : 'Ordenar por esta columna'
        }
      >
        {children}
        <span className="orden__flecha" aria-hidden="true">
          {activa ? (orden.desc ? '▾' : '▴') : '▾'}
        </span>
      </button>
    </th>
  );
}

interface FilaProps {
  client: ClientView;
  columnas: Species[];
  hayCupos: boolean;
  mayor: number;
  diasTrabajados: number;
  diasTotales: number;
  onSetMedia: (client: string, media: number | null) => void;
}

function Fila({
  client: c,
  columnas,
  hayCupos,
  mayor,
  diasTrabajados,
  diasTotales,
  onSetMedia,
}: FilaProps) {
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

      <td className="celda--editable" data-etiqueta="Total TN">
        <EditableNumber
          value={c.total}
          base={c.totalBase}
          editado={c.editado}
          label={`Toneladas acumuladas de ${c.name}`}
          onChange={(v) => onSetMedia(c.name, v === null ? null : v / diasTrabajados)}
        />
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
        <td className="num" data-etiqueta="Cupo actual">
          {c.cupoPendiente === null ? (
            <span className="celda--nula">—</span>
          ) : (
            <span
              className={`cupo cupo--${estado}`}
              title={
                `${ETIQUETA_CUPO[estado]} con los datos actuales: ` +
                `${tn(c.total)} TN servidas y ${tn(c.cupoPendiente)} TN pendientes. ` +
                `El estado no tiene en cuenta la estimación futura.`
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
