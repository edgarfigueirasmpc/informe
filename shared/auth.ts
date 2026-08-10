/**
 * Sesiones sin almacenamiento: el rol viaja en una cookie firmada con HMAC.
 * No hay tabla de sesiones que mantener ni escrituras en KV al entrar.
 */

export type Role = 'view' | 'admin';

export const COOKIE_NAME = 'informe_sesion';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

interface Payload {
  r: Role;
  e: number;
}

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function issueToken(role: Role, secret: string): Promise<string> {
  const payload: Payload = { r: role, e: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function readToken(token: string | null, secret: string): Promise<Role | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      b64urlDecode(sig),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Payload;
    if (payload.e < Math.floor(Date.now() / 1000)) return null;
    return payload.r === 'admin' || payload.r === 'view' ? payload.r : null;
  } catch {
    return null;
  }
}

export function cookieHeader(token: string, secure: boolean): string {
  const flags = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${TTL_SECONDS}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearCookieHeader(secure: boolean): string {
  const flags = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/**
 * Decide con qué rol entra una contraseña.
 *
 * Hay dos modos, y los distingue la propia configuración:
 *
 *  - **Dos contraseñas**: con `ADMIN_PASSWORD` puesta, la de consulta sólo deja
 *    mirar y la de administración deja además publicar.
 *  - **Contraseña única**: dejando `ADMIN_PASSWORD` vacía, quien sabe la
 *    contraseña entra y puede publicar. Más cómodo de repartir, a cambio de que
 *    cualquiera pueda pisar el informe del día.
 *
 * Las dos comparaciones se hacen siempre en tiempo constante, y el único
 * cortocircuito depende de la configuración del servidor —nunca de lo que se
 * teclea—, así que no filtra qué contraseña se ha acertado.
 */
export function decideRole(
  password: string,
  passwords: { view: string; admin: string | undefined },
): Role | null {
  // Una contraseña vacía no entra nunca, pase lo que pase con la configuración.
  if (!password) return null;

  const hayAdmin = !!passwords.admin;
  const esAdmin = hayAdmin && safeEqual(password, passwords.admin!);
  const esView = safeEqual(password, passwords.view);

  if (esAdmin) return 'admin';
  if (esView) return hayAdmin ? 'view' : 'admin';
  return null;
}

/** Comparación en tiempo constante: no filtra por dónde falla la contraseña. */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
