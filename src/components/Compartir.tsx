import { useEffect, useRef, useState } from 'react';
import { LARGO_INCOMODO } from '../lib/share';
import {
  IconoCompartir,
  IconoCopiar,
  IconoCorreo,
  IconoHecho,
  IconoWhatsApp,
} from './Iconos';

interface Props {
  /**
   * La dirección completa, tal y como quedó tras escribirla. Llega como prop y
   * no se lee de `location` en el render: la URL se reescribe en una tarea
   * asíncrona posterior, así que leerla aquí daría la anterior.
   */
  enlace: string;
  /** Con ajustes puestos, lo que se comparte es el escenario, no el informe. */
  simulando: boolean;
  tipo?: 'informe' | 'historico';
}

type Resultado = 'reposo' | 'copiado' | 'a-mano';

/**
 * Compartir el informe. Como vive entero en el fragmento, pasar el enlace es
 * pasar el informe: quien lo abra verá exactamente esto, simulaciones
 * incluidas.
 *
 * Copiar al portapapeles falla más de lo que parece —Safari, páginas servidas
 * sin HTTPS, ventanas sin foco—, así que hay tres intentos encadenados y, si
 * todos fallan, se enseña el enlace ya seleccionado. Nunca se deja al usuario a
 * solas con una URL de 600 caracteres en la barra de direcciones.
 */
export function Compartir({ enlace, simulando, tipo = 'informe' }: Props) {
  const [resultado, setResultado] = useState<Resultado>('reposo');
  const campoRef = useRef<HTMLInputElement>(null);

  const puedeEnviar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const esHistorico = tipo === 'historico';
  const asunto = esHistorico
    ? 'Histórico de toneladas'
    : simulando
      ? 'Simulación de toneladas'
      : 'Informe de toneladas';
  const cuerpo = `${esHistorico ? 'Histórico' : simulando ? 'Simulación' : 'Informe'} de toneladas:\n\n${enlace}\n`;

  // Cada ajuste cambia el enlace: lo copiado antes ya no es lo que se ve.
  useEffect(() => setResultado('reposo'), [enlace]);

  // Cuando aparece la salida de emergencia, el campo ya está en el DOM y se
  // puede seleccionar de verdad: así basta con pulsar Ctrl+C.
  useEffect(() => {
    if (resultado !== 'a-mano') return;
    campoRef.current?.focus();
    campoRef.current?.select();
  }, [resultado]);

  async function copiar() {
    // 1) La vía moderna.
    try {
      await navigator.clipboard.writeText(enlace);
      setResultado('copiado');
      setTimeout(() => setResultado('reposo'), 2500);
      return;
    } catch {
      /* seguimos intentando */
    }

    // 2) La de toda la vida, que funciona donde la anterior no.
    if (copiarConSeleccion(enlace)) {
      setResultado('copiado');
      setTimeout(() => setResultado('reposo'), 2500);
      return;
    }

    // 3) Que lo copie él, pero con el enlace delante y ya seleccionado.
    // La selección se hace en el efecto: el campo aún no está en el DOM.
    setResultado('a-mano');
  }

  async function enviar() {
    try {
      await navigator.share({ title: asunto, url: enlace });
    } catch {
      // Cancelar el diálogo del sistema también entra por aquí: no es un fallo.
    }
  }

  return (
    <section className="compartir no-imprimir">
      <div className="compartir__texto-bloque">
        <p className="compartir__titulo">
          {esHistorico
            ? 'Comparte este histórico'
            : simulando
              ? 'Comparte esta simulación'
              : 'Comparte este informe'}
        </p>
        <p className="compartir__texto">
          {esHistorico
            ? 'El enlace lleva dentro el CSV y los filtros actuales. Sólo quien lo reciba podrá ver estos datos.'
            : simulando
            ? 'El enlace lleva dentro tus ajustes: quien lo abra verá el mismo escenario.'
            : 'El enlace lleva dentro el informe. No hace falta contraseña ni que nadie suba nada.'}
        </p>

        {enlace.length > LARGO_INCOMODO && (
          <p className="compartir__texto compartir__texto--aviso">
            El enlace es largo ({enlace.length} caracteres); algunos programas de correo lo parten.
            Si al recibirlo no abre, envíalo en un mensaje sin formato.
          </p>
        )}

        {resultado === 'a-mano' && (
          <>
            <p className="compartir__texto compartir__texto--aviso">
              Tu navegador no deja copiar solo. Está seleccionado: cópialo con Ctrl+C (⌘C en Mac).
            </p>
            <input
              ref={campoRef}
              className="compartir__campo"
              type="text"
              readOnly
              value={enlace}
              onFocus={(e) => e.target.select()}
              aria-label={esHistorico ? 'Enlace del histórico' : 'Enlace del informe'}
            />
          </>
        )}
      </div>

      {/* Los atajos van sólo con icono y su etiqueta accesible: son secundarios
          y así caben en una línea hasta en un móvil. El de copiar conserva el
          texto, que es la acción principal y además cambia de estado. */}
      <div className="compartir__acciones">
        {puedeEnviar ? (
          // Móviles y Safari: el diálogo del sistema, que ya conoce WhatsApp,
          // el correo y todo lo que haya instalado.
          <button
            className="boton boton--icono"
            type="button"
            onClick={() => void enviar()}
            title="Compartir"
            aria-label="Compartir"
          >
            <IconoCompartir />
          </button>
        ) : (
          // En escritorio no hay diálogo del sistema, así que se ofrecen a mano
          // las dos vías por las que esto se manda de verdad.
          <>
            <a
              className="boton boton--icono"
              href={`https://wa.me/?text=${encodeURIComponent(cuerpo)}`}
              target="_blank"
              rel="noreferrer"
              title="Enviar por WhatsApp"
              aria-label="Enviar por WhatsApp"
            >
              <IconoWhatsApp />
            </a>
            <a
              className="boton boton--icono"
              href={`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`}
              title="Enviar por correo"
              aria-label="Enviar por correo"
            >
              <IconoCorreo />
            </a>
          </>
        )}

        <button className="boton boton--primario" type="button" onClick={() => void copiar()}>
          {resultado === 'copiado' ? <IconoHecho /> : <IconoCopiar />}
          {resultado === 'copiado' ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
    </section>
  );
}

/**
 * Copia usando una selección real sobre un campo fuera de pantalla.
 * `execCommand` está en desuso, pero es lo único que funciona sin HTTPS y en
 * navegadores viejos, y aquí es la red de seguridad, no el camino principal.
 */
function copiarConSeleccion(texto: string): boolean {
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.top = '-1000px';
  campo.style.opacity = '0';
  document.body.appendChild(campo);

  try {
    campo.select();
    campo.setSelectionRange(0, texto.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
  }
}
