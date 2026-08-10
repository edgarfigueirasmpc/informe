import type { Role } from './auth';
import { COOKIE_NAME, readCookie, readToken } from './auth';

export interface Env {
  /** KV donde vive el informe. Un único registro que se sobreescribe. */
  INFORME: KVNamespace;
  /** Contraseña de entrada, la que se reparte a los compañeros. */
  VIEW_PASSWORD: string;
  /**
   * Contraseña para publicar un informe nuevo. Opcional: dejándola sin poner,
   * la app funciona con una única contraseña y quien entra puede publicar.
   */
  ADMIN_PASSWORD?: string;
  /** Secreto para firmar las cookies de sesión. */
  AUTH_SECRET: string;
}

export const REPORT_KEY = 'report:current';

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

export function configError(env: Env): Response | null {
  // ADMIN_PASSWORD no entra: su ausencia es una configuración válida, la del
  // modo de contraseña única.
  const missing = (['VIEW_PASSWORD', 'AUTH_SECRET'] as const).filter((k) => !env[k]);
  if (missing.length) {
    return json(
      { error: `Faltan variables de entorno en Cloudflare: ${missing.join(', ')}.` },
      { status: 500 },
    );
  }
  if (!env.INFORME) {
    return json({ error: 'Falta el binding de KV "INFORME" en Cloudflare.' }, { status: 500 });
  }
  return null;
}

export async function currentRole(request: Request, env: Env): Promise<Role | null> {
  return readToken(readCookie(request, COOKIE_NAME), env.AUTH_SECRET);
}

export function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}
