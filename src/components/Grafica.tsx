import type { ClientView, Species } from '../lib/model';
import { cupoStatus, SPECIES_LABEL } from '../lib/model';
import { tn, tnRedondo } from '../lib/format';

interface Props {
  clientes: ClientView[];
  columnas: Species[];
  diasTrabajados: number;
  diasRestantes: number;
}

/**
 * Lectura de un vistazo. Cada cliente es una barra con tres cosas dentro:
 *
 *   ▓▓▓▓░░░░░░░│      ▓ lo acumulado, con su color de especie
 *                     ░ lo que falta hasta la estimación de fin de mes
 *                     │ dónde queda el cupo pendiente
 *
 * El valor está en que las tres comparten escala: se ve de golpe si la marca
 * del cupo cae dentro de la barra proyectada —se cubre— o se queda fuera por
 * la derecha, que es la única forma rápida de detectar a quién no se le va a
 * llegar. En la tabla eso exige comparar dos columnas cliente a cliente.
 */
export function Grafica({ clientes, columnas, diasTrabajados, diasRestantes }: Props) {
  if (clientes.length === 0) return null;

  const hayCupos = clientes.some((c) => c.cupoPendiente !== null);

  // Escala común. Entra también el cupo, para que su marca nunca se salga.
  const tope = Math.max(
    ...clientes.map((c) => Math.max(c.estimacion, c.total + (c.cupoPendiente ?? 0))),
    1,
  );
  const pct = (v: number) => `${Math.min(100, (v / tope) * 100)}%`;

  return (
    <section className="grafica" aria-label="Comparativa de clientes">
      <div className="grafica__cabecera">
        <h3 className="grafica__titulo eyebrow">De un vistazo</h3>

        <ul className="leyenda">
          {columnas.map((s) => (
            <li key={s} className="leyenda__item">
              <span className={`leyenda__muestra leyenda__muestra--${s}`} />
              {SPECIES_LABEL[s]}
            </li>
          ))}
          <li className="leyenda__item">
            <span className="leyenda__muestra leyenda__muestra--proyectado" />
            Resto del mes (estimado)
          </li>
          {hayCupos && (
            <li className="leyenda__item">
              <span className="leyenda__muestra leyenda__muestra--cupo" />
              Cupo pendiente
            </li>
          )}
        </ul>
      </div>

      <ol className="grafica__lista">
        {clientes.map((c) => {
          const estado = cupoStatus(c);
          const objetivo = c.cupoPendiente === null ? null : c.total + c.cupoPendiente;

          return (
            <li key={c.name} className={`grafica__fila ${c.editado ? 'grafica__fila--sim' : ''}`}>
              <span className="grafica__nombre" title={c.name}>
                {c.name}
              </span>

              <span className="grafica__pista">
                {/* Lo proyectado va detrás y llega hasta el final. */}
                <span className="grafica__proyectado" style={{ width: pct(c.estimacion) }} />

                {/* Lo acumulado, encima, con el desglose por especie. */}
                <span className="grafica__acumulado" style={{ width: pct(c.total) }}>
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

                {objetivo !== null && (
                  <span
                    className={`grafica__cupo grafica__cupo--${estado}`}
                    style={{ left: pct(objetivo) }}
                    title={
                      `Para cubrir el cupo hacen falta ${tn(objetivo)} TN en total ` +
                      `(${tn(c.total)} servidas + ${tn(c.cupoPendiente!)} pendientes). ` +
                      `Se estiman ${tnRedondo(c.estimacion)} TN a fin de mes.`
                    }
                  />
                )}
              </span>

              <span className="grafica__cifra num" title="Estimación a fin de mes">
                {tnRedondo(c.estimacion)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="grafica__pie">
        Barra sólida: las {tn(clientes.reduce((a, c) => a + c.total, 0))} TN acumuladas en{' '}
        {diasTrabajados} {diasTrabajados === 1 ? 'día' : 'días'}. En claro, lo que se estima
        entregar en los {diasRestantes} que quedan.
        {hayCupos && ' La marca vertical es el cupo: si la barra no llega, no se cubre.'}
      </p>
    </section>
  );
}
