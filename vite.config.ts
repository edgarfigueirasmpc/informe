import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
