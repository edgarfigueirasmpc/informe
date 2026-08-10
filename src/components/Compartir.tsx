import { useEffect, useState } from 'react';
import { LARGO_INCOMODO } from '../lib/share';

interface Props {
  /** Con ajustes puestos, lo que se comparte es el escenario, no el informe. */
  simulando: boolean;
}

/**
 * Copiar la dirección actual. Como el informe entero vive en el fragmento,
 * pasar el enlace es pasar el informe: quien lo abra verá exactamente esto,
 * simulaciones incluidas.
 */
export function Compartir({ simulando }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [largo, setLargo] = useState(0);

  // El largo se mide tras pintar, cuando la URL ya está actualizada.
  useEffect(() => {
    setLargo(location.href.length);
    setCopiado(false);
  }, [simulando]);

  async function copiar() {
    const url = location.href;
    setLargo(url.length);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setFallo(false);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): que lo copie a mano.
      setFallo(true);
    }
  }

  return (
    <section className="compartir no-imprimir">
      <div>
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
        {fallo && (
          <p className="compartir__texto compartir__texto--aviso">
            El navegador no ha dejado copiar. Coge la dirección de la barra de arriba.
          </p>
        )}
      </div>

      <button className="boton boton--primario" type="button" onClick={() => void copiar()}>
        {copiado ? 'Copiado' : 'Copiar enlace'}
      </button>
    </section>
  );
}
