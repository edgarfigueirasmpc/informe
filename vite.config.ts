import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * La política de contenido, en una etiqueta dentro del HTML. Lo suyo sería una
 * cabecera, pero GitHub Pages no deja ponerlas y preferimos no mudar el sitio
 * sólo por eso. En `meta` vale todo menos `frame-ancestors`, que se queda sin
 * equivalente; de ahí el cortafuegos de marcos en index.html.
 *
 * Los orígenes salen de la misma configuración con la que se compila, así que
 * la política dice exactamente con quién habla esta compilación: en producción
 * Cloud y el login corporativo, en las pruebas locales sus equivalentes. Si no
 * hay Cloud configurado, no se inyecta nada y el servidor de desarrollo
 * funciona sin estorbos.
 */
function politicaDeContenido(): Plugin {
  return {
    name: 'politica-de-contenido',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      void ctx;
      const permitidos = [process.env.VITE_MPC_CLOUD_API ?? '', process.env.VITE_MPC_LOGIN_API ?? '']
        .map(v => v.replace(/\/+$/, ''))
        .filter(Boolean);
      if (permitidos.length === 0) return html;
      const politica = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src 'self' ${permitidos.join(' ')}`,
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${politica}" />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), politicaDeContenido()],
  // Rutas relativas: el sitio funciona igual en la raíz de un dominio propio
  // que colgando de un subdirectorio, e incluso abierto desde el disco.
  base: './',
  build: {
    target: 'es2022',
    // pdf.js sólo lo necesita quien sube el informe: va en su propio chunk
    // y se carga bajo demanda.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
