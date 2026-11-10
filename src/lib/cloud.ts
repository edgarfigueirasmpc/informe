/** Same-origin MPC Cloud API. Corporate credentials/tokens never leave this origin. */
export const cloudEnabled = import.meta.env.VITE_MPC_CLOUD === 'true';
export interface CloudSession { user: { id: number; username: string }; csrfToken: string }
export interface CloudEntry { name: string; type: 'file' | 'dir'; size: number; etag: string }
export interface CloudSource { path: string; etag: string }
export const childPath = (parent: string, name: string) => `${parent === '/' ? '' : parent}/${name}`;

export class CloudError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function cloudRequest(url: string, init: RequestInit = {}, csrf?: string): Promise<Response> {
  const response = await fetch(`/api/${url}`, {
    ...init, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new CloudError(response.status, response.status === 401
      ? 'La sesión ha caducado. Inicia sesión de nuevo; tus cambios siguen aquí.'
      : response.status === 409 || response.status === 412
        ? 'El archivo cambió o ya existe. Tus cambios se conservan. Abre la versión actual o usa Guardar como con otro nombre.'
        : body.message || `MPC Cloud respondió con error ${response.status}.`);
  }
  return response;
}
export async function cloudJson<T>(url: string, method = 'GET', body?: unknown, csrf?: string): Promise<T> {
  return (await cloudRequest(url, { method, ...(body !== undefined ? {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {}) }, csrf)).json();
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
