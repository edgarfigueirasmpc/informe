/**
 * Punto de entrada del Worker.
 *
 * Sirve dos cosas: la API bajo /api y el sitio estático compilado en dist/.
 * Los ficheros estáticos los reparte la propia plataforma sin pasar por aquí
 * (ver `run_worker_first` en wrangler.jsonc), así que este código sólo se
 * ejecuta para la API y para las rutas que no corresponden a ningún fichero.
 */

import type { Env } from '../shared/env';
import { json } from '../shared/env';
import { handleReport } from './api/report';
import { handleSession } from './api/session';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/session') return handleSession(request, env);
    if (pathname === '/api/report') return handleReport(request, env);

    if (pathname.startsWith('/api/')) {
      return json({ error: 'Ese endpoint no existe.' }, { status: 404 });
    }

    // Cualquier otra ruta es del sitio: que la resuelva el servidor de assets.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
