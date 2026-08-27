import type { ClientView, Species } from '../lib/model';
import { SPECIES_LABEL } from '../lib/model';
import { tn, tnRedondo } from '../lib/format';

interface Props {
  clientes: ClientView[];
  columnas: Species[];
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
export function Grafica({ clientes, columnas }: Props) {
  if (clientes.length === 0) return null;

  // Escala común para comparar acumulado y estimación entre clientes.
  const tope = Math.max(
    ...clientes.map((c) => c.estimacion),
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
        </ul>
      </div>

      <div className="grafica__columnas eyebrow" aria-hidden="true">
        <span className="grafica__columna-actual">Total actual</span>
        <span className="grafica__columna-estimacion">Estimación mes</span>
      </div>

      <ol className="grafica__lista">
        {clientes.map((c) => {
          return (
            <li
              key={c.name}
              className={`grafica__fila ${c.editado ? 'grafica__fila--sim' : ''} ${
                !c.activo ? 'grafica__fila--inactiva' : ''
              }`}
            >
              <span className="grafica__nombre" title={c.name}>
                {c.name}
              </span>

              <span className="grafica__dato grafica__dato--actual num" title="Toneladas acumuladas actuales">
                <span className="grafica__cifra">{tn(c.total)}</span>
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

              </span>

              <span
                className="grafica__dato grafica__dato--estimacion num"
                title="Estimación a fin de mes"
              >
                <span className="grafica__cifra">{tnRedondo(c.estimacion)}</span>
              </span>
            </li>
          );
        })}
      </ol>

    </section>
  );
}
