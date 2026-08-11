import { useEffect, useRef, useState } from 'react';
import { LARGO_INCOMODO } from '../lib/share';

interface Props {
  /** Con ajustes puestos, lo que se comparte es el escenario, no el informe. */
  simulando: boolean;
}

type Resultado = 'reposo' | 'copiado' | 'a-mano';

/**
 * Copiar la dirección actual. Como el informe entero vive en el fragmento,
 * pasar el enlace es pasar el informe: quien lo abra verá exactamente esto,
 * simulaciones incluidas.
 *
 * Copiar al portapapeles falla más de lo que parece —Safari, páginas servidas
 * sin HTTPS, ventanas sin foco—, así que hay tres intentos encadenados y, si
 * todos fallan, se enseña el enlace ya seleccionado para copiarlo a mano. Nunca
 * se deja al usuario a solas con una URL de 600 caracteres en la barra.
 */
export function Compartir({ simulando }: Props) {
  const [resultado, setResultado] = useState<Resultado>('reposo');
  const [largo, setLargo] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);

  const puedeEnviar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // La URL cambia con cada ajuste: lo copiado antes ya no es lo que se ve.
  useEffect(() => {
    setLargo(location.href.length);
    setResultado('reposo');
  }, [simulando]);

  // Cuando aparece la salida de emergencia, el campo ya está en el DOM y se
  // puede seleccionar de verdad: así basta con pulsar Ctrl+C.
  useEffect(() => {
    if (resultado !== 'a-mano') return;
    campoRef.current?.focus();
    campoRef.current?.select();
  }, [resultado]);

  async function copiar() {
    const url = location.href;
    setLargo(url.length);

    // 1) La vía moderna.
    try {
      await navigator.clipboard.writeText(url);
      setResultado('copiado');
      setTimeout(() => setResultado('reposo'), 2500);
      return;
    } catch {
      /* seguimos intentando */
    }

    // 2) La de toda la vida, que funciona donde la anterior no.
    if (copiarConSeleccion(url)) {
      setResultado('copiado');
      setTimeout(() => setResultado('reposo'), 2500);
      return;
    }

    // 3) Que lo copie él, pero con el enlace delante y ya seleccionado.
    // La selección se hace en un efecto, no aquí: el campo todavía no existe.
    setResultado('a-mano');
  }

  async function enviar() {
    try {
      await navigator.share({ title: 'Informe de toneladas', url: location.href });
    } catch {
      // Cancelar el diálogo del sistema también entra por aquí: no es un fallo.
    }
  }

  return (
    <section className="compartir no-imprimir">
      <div className="compartir__texto-bloque">
        <p className="compartir__titulo">
          {simulando ? 'Comparte esta simulación' : 'Comparte este informe'}
        </p>
        <p className="compartir__texto">
          {simulando
            ? 'El enlace lleva dentro tus ajustes: quien lo abra verá el mismo escenario.'
            : 'El enlace lleva dentro el informe. No hace falta contraseña ni que nadie suba nada.'}
        </p>

        {largo > LARGO_INCOMODO && (
          <p className="compartir__texto compartir__texto--aviso">
            El enlace es largo ({largo} caracteres); algunos programas de correo lo parten. Si al
            recibirlo no abre, envíalo en un mensaje sin formato.
          </p>
        )}

        {resultado === 'a-mano' && (
          <>
            <p className="compartir__texto compartir__texto--aviso">
              Tu navegador no deja copiar solo. Está seleccionado: cópialo con Ctrl+C (⌘C en Mac).
            </p>
            <input
              ref={campoRef}
              className="compartir__campo num"
              type="text"
              readOnly
              value={location.href}
              onFocus={(e) => e.target.select()}
              aria-label="Enlace del informe"
            />
          </>
        )}
      </div>

      <div className="compartir__acciones">
        {puedeEnviar && (
          <button className="boton" type="button" onClick={() => void enviar()}>
            Enviar
          </button>
        )}
        <button className="boton boton--primario" type="button" onClick={() => void copiar()}>
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
