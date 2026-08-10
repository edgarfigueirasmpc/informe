import type { Report } from './model';

export type Role = 'view' | 'admin';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Sin conexión con el servidor.', 0);
  }

  const texto = await res.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Una respuesta que no es JSON casi siempre significa que las funciones
    // de Cloudflare no están desplegadas y contesta el sitio estático.
    throw new ApiError(
      res.ok ? 'Respuesta inesperada del servidor.' : `Error ${res.status} del servidor.`,
      res.status,
    );
  }

  if (!res.ok) {
    const mensaje =
      cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : `Error ${res.status}.`;
    throw new ApiError(mensaje, res.status);
  }

  return cuerpo as T;
}

export function getSession(): Promise<{ role: Role | null }> {
  return call('/api/session');
}

export function login(password: string): Promise<{ role: Role }> {
  return call('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function logout(): Promise<{ role: null }> {
  return call('/api/session', { method: 'DELETE' });
}

export function getReport(): Promise<Report> {
  return call('/api/report');
}

export function publishReport(report: Report): Promise<{ ok: true; publishedAt: string }> {
  return call('/api/report', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
