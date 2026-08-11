/**
 * Iconos de la fila de compartir. En línea y monocromos con `currentColor`,
 * para que hereden el color del botón en reposo, al pasar por encima y en modo
 * oscuro sin tener que duplicar nada. Sin dependencias ni peticiones.
 */

interface Props {
  className?: string;
}

const comunes = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
};

export function IconoWhatsApp({ className = 'icono' }: Props) {
  return (
    <svg className={className} {...comunes}>
      {/* Burbuja con la cola abajo a la izquierda. */}
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.7 7.4L3.5 20.5l1.6-4.2A8.5 8.5 0 1 1 20.5 11.6Z" />
      {/* El auricular estilizado de dentro. */}
      <path d="M9.4 8.9c.3 1 .8 2 1.6 2.8.8.8 1.7 1.4 2.7 1.7l.9-1.1 1.9.9-.3 1.5c-1.9.4-4-.5-5.6-2.1S8.1 8.9 8.5 7l1.5-.3.9 1.9-1.5.3Z" />
    </svg>
  );
}

export function IconoCorreo({ className = 'icono' }: Props) {
  return (
    <svg className={className} {...comunes}>
      <rect x="2.75" y="5" width="18.5" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}

export function IconoCopiar({ className = 'icono' }: Props) {
  return (
    <svg className={className} {...comunes}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconoHecho({ className = 'icono' }: Props) {
  return (
    <svg className={className} {...comunes}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconoCompartir({ className = 'icono' }: Props) {
  return (
    <svg className={className} {...comunes}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 12H4.5v8.5h15V12H18" />
    </svg>
  );
}
