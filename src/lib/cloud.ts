/**
 * Cliente de MPC Cloud. Dos despliegues, dos maneras de presentarse:
 *
 * - **Mismo origen** (Informes servido por Cloud en `/informes/`): cookie
 *   HttpOnly SameSite=Strict y cabecera CSRF, como cualquier otra pantalla de
 *   Cloud.
 * - **Dominio propio** (`informes.cacharolo.es`): esa cookie no viaja entre
 *   dominios y no se intenta. La credencial es el token que emitió Django,
 *   obtenido por el login delegado de MPC Files, y viaja en `Authorization`.
 *
 * En ninguno de los dos casos se guarda una contraseña corporativa ni una
 * clave de servicio en el navegador.
 */
const sinBarra = (valor: string) => valor.replace(/\/+$/, '');
/** Origen de la API de Cloud. Vacío: la sirve este mismo origen. */
const apiBase = sinBarra(import.meta.env.VITE_MPC_CLOUD_API ?? '');
/** Origen del login delegado (MPC Files API). Solo se usa desde otro dominio. */
const loginBase = sinBarra(import.meta.env.VITE_MPC_LOGIN_API ?? '');

export const cloudEnabled = import.meta.env.VITE_MPC_CLOUD === 'true' || apiBase !== '';
/** Con la API en otro dominio la credencial es el token, no la cookie. */
export const cloudCrossOrigin = apiBase !== '';

export interface CloudSession { user: { id: number; username: string }; csrfToken: string }
export interface CloudEntry { name: string; type: 'file' | 'dir'; size: number; etag: string }
export interface CloudSource { path: string; etag: string }
export const childPath = (parent: string, name: string) => `${parent === '/' ? '' : parent}/${name}`;

export class CloudError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * El token vive en `sessionStorage`: dura lo que la pestaña, así que sobrevive
 * a las recargas y a cambiar de vista —que es donde molestaría volver a
 * entrar— pero no se queda en el equipo al cerrar. Los tokens de Django no
 * caducan solos; cuanto menos tiempo estén guardados, mejor.
 */
const CLAVE_TOKEN = 'mpc-cloud-token';
export function tokenGuardado(): string | null {
  if (!cloudCrossOrigin) return null;
  try { return sessionStorage.getItem(CLAVE_TOKEN); } catch { return null; }
}
function guardarToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN, token);
    else sessionStorage.removeItem(CLAVE_TOKEN);
  } catch { /* navegación privada o almacenamiento bloqueado: se trabaja sin recordar */ }
}

function mensajeDeError(status: number, body: { message?: string }): string {
  if (status === 401) return 'La sesión ha caducado. Inicia sesión de nuevo; tus cambios siguen aquí.';
  if (status === 403) return body.message || 'Tu cuenta no tiene permiso para esta operación en MPC Cloud.';
  if (status === 409 || status === 412) {
    return 'El archivo cambió o ya existe. Tus cambios se conservan. Abre la versión actual o usa Guardar como con otro nombre.';
  }
  return body.message || `MPC Cloud respondió con error ${status}.`;
}

export async function cloudRequest(url: string, init: RequestInit = {}, csrf?: string): Promise<Response> {
  const token = tokenGuardado();
  const response = await fetch(`${apiBase}/api/${url}`, {
    ...init,
    // Entre dominios no se mandan cookies ni se piden: la credencial es explícita.
    credentials: cloudCrossOrigin ? 'omit' : 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(!cloudCrossOrigin && csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    // Un token que Django ya no reconoce no sirve para nada: se olvida aquí
    // mismo para que la interfaz vuelva a ofrecer entrar.
    if (response.status === 401) guardarToken(null);
    const body = await response.json().catch(() => ({}));
    throw new CloudError(response.status, mensajeDeError(response.status, body));
  }
  return response;
}

export async function cloudJson<T>(url: string, method = 'GET', body?: unknown, csrf?: string): Promise<T> {
  return (await cloudRequest(url, { method, ...(body !== undefined ? {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {}) }, csrf)).json();
}

/**
 * Entrar. Con la API en el mismo origen es Cloud quien valida; desde otro
 * dominio la contraseña va al login delegado de MPC Files, que la comprueba
 * contra Django con sus propios límites de intentos, y lo único que vuelve al
 * navegador es el token.
 */
export async function cloudLogin(username: string, password: string): Promise<CloudSession> {
  if (!cloudCrossOrigin) {
    try {
      return await cloudJson<CloudSession>('session', 'POST', { username, password });
    } catch (error) {
      // Al entrar, un 401 no es una sesión caducada: son las credenciales.
      if (error instanceof CloudError && (error.status === 400 || error.status === 401)) {
        throw new CloudError(error.status, 'Usuario o contraseña incorrectos.');
      }
      throw error;
    }
  }
  if (!loginBase) throw new CloudError(500, 'Falta configurar el servicio de acceso corporativo.');
  let response: Response;
  try {
    response = await fetch(`${loginBase}/api/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'omit', redirect: 'error', cache: 'no-store',
    });
  } catch {
    throw new CloudError(503, 'No se ha podido contactar con el servicio de acceso. Inténtalo en unos instantes.');
  }
  const body = await response.json().catch(() => ({})) as { token?: unknown; message?: string };
  if (!response.ok || typeof body.token !== 'string' || !body.token) {
    throw new CloudError(response.status, response.status === 400 || response.status === 401
      ? 'Usuario o contraseña incorrectos.'
      : response.status === 429
        ? 'Demasiados intentos. Inténtalo dentro de un rato.'
        : body.message || 'No se ha podido iniciar sesión.');
  }
  guardarToken(body.token);
  try {
    // El token identifica; el acceso a Cloud lo sigue decidiendo Django.
    return await cloudJson<CloudSession>('session');
  } catch (error) {
    guardarToken(null);
    throw error;
  }
}

/** Sesión ya abierta, si la hay. Sin credencial no se pregunta: sería un 401 seguro. */
export async function cloudSession(): Promise<CloudSession | null> {
  if (!cloudEnabled) return null;
  if (cloudCrossOrigin && !tokenGuardado()) return null;
  try { return await cloudJson<CloudSession>('session'); } catch { return null; }
}

export async function cloudLogout(csrf: string): Promise<void> {
  try { await cloudJson('session', 'DELETE', undefined, csrf); } finally { guardarToken(null); }
}

export async function readCloudFile(path: string): Promise<{ file: File; source: CloudSource }> {
  const response = await cloudRequest(`files/content?path=${encodeURIComponent(path)}`);
  const etag = response.headers.get('etag')?.replace(/^"|"$/g, '');
  if (!etag) throw new Error('MPC Cloud no ha enviado la versión del archivo.');
  return { file: new File([await response.blob()], path.split('/').pop()!), source: { path, etag } };
}

export async function saveCloudFile(file: Blob, path: string, csrf: string, etag?: string, visibility: 'public' | 'private' = 'private'): Promise<CloudSource> {
  const split = path.lastIndexOf('/');
  const upload = await cloudJson<{ id: string; maxChunk: number }>('uploads', 'POST', {
    path: path.slice(0, split) || '/', name: path.slice(split + 1), size: file.size,
    onConflict: etag ? 'replace' : 'fail', ...(etag ? { ifMatch: etag } : {}), visibility,
  }, csrf);
  try {
    for (let offset = 0; offset < file.size; offset += upload.maxChunk) {
      const chunk = await file.slice(offset, offset + upload.maxChunk).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', chunk);
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      await cloudRequest(`uploads/${upload.id}?offset=${offset}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': hash }, body: chunk,
      }, csrf);
    }
    const result = await cloudJson<{ path: string; entry: CloudEntry }>(`uploads/${upload.id}/complete`, 'POST', {}, csrf);
    return { path: result.path, etag: result.entry.etag };
  } catch (error) {
    // Best effort; server expiration also cleans abandoned transfers. Never retry replacement blindly.
    await cloudRequest(`uploads/${upload.id}`, { method: 'DELETE' }, csrf).catch(() => undefined);
    throw error;
  }
}
