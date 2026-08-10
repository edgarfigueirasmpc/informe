import logoUrl from '../assets/logo.png';
import mpcUrl from '../assets/mpc.png';

/**
 * Logo corporativo.
 *
 * Es el fichero original recortado del mockup de pegatina por
 * `scripts/extraer-logo.py`: mismas formas, sin el fondo gris ni el reborde
 * blanco. Al no llevar blancos propios, se sostiene igual sobre papel claro que
 * sobre fondo oscuro.
 *
 * Se sirve al triple del tamaño al que se ve, para que quede nítido en retina.
 * Se importa en vez de referenciarlo por ruta absoluta para que funcione igual
 * en la raíz de un dominio que colgando de un subdirectorio.
 */
export function Mark({ className = 'marca' }: { className?: string }) {
  return <img className={className} src={logoUrl} alt="" width={82} height={192} />;
}

/**
 * Firma corporativa. A este logo no se le toca el filo blanco, que es parte del
 * dibujo y separa las letras entre sí.
 */
export function FirmaMpc() {
  return (
    <footer className="firma">
      <img className="firma__marca" src={mpcUrl} alt="" width={106} height={96} />
      <span className="eyebrow">Maderas Paco Cacharolo</span>
    </footer>
  );
}
