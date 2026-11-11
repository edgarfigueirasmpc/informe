import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CloudProvider } from './components/Cloud';
import './styles.css';

/**
 * Nadie debería estar viendo esto dentro de un marco ajeno: con la sesión de
 * MPC Cloud abierta, un botón como «Guardar sobre el original» es un buen
 * objetivo para un clic robado. Lo suyo sería `frame-ancestors`, pero esa
 * directiva no vale en una etiqueta meta y GitHub Pages no deja poner
 * cabeceras. Se intenta salir del marco y, si el navegador no deja (lo normal
 * si quien enmarca es de otro origen), no se monta la aplicación: mejor un
 * enlace que una interfaz que se puede manipular desde fuera.
 */
const enMarco = window.top !== window.self;
if (enMarco) {
  try {
    window.top!.location.replace(window.self.location.href);
  } catch {
    /* otro origen: el navegador no deja navegar al marco de arriba */
  }
}

const raiz = createRoot(document.getElementById('root')!);
raiz.render(
  enMarco ? (
    <p className="vacio">
      Informes no funciona dentro de otra página.{' '}
      <a href={window.self.location.href} target="_blank" rel="noopener noreferrer">Ábrelo en su propia pestaña.</a>
    </p>
  ) : (
    <StrictMode>
      <CloudProvider><App /></CloudProvider>
    </StrictMode>
  ),
);
