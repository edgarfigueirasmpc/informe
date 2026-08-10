import { clearCookieHeader, cookieHeader, decideRole, issueToken } from '../../shared/auth';
import { configError, currentRole, isSecure, json, metodoNoPermitido, type Env } from '../../shared/env';

export function handleSession(request: Request, env: Env): Promise<Response> | Response {
  switch (request.method) {
    case 'GET':
      return quienSoy(request, env);
    case 'POST':
      return entrar(request, env);
    case 'DELETE':
      return salir(request);
    default:
      return metodoNoPermitido('GET, POST, DELETE');
  }
}

/** Quién soy: lo consulta la app al arrancar para saber si pedir contraseña. */
async function quienSoy(request: Request, env: Env): Promise<Response> {
  const bad = configError(env);
  if (bad) return bad;
  return json({ role: await currentRole(request, env) });
}

/** Entrar. Una misma casilla admite la clave de consulta o la de publicación. */
async function entrar(request: Request, env: Env): Promise<Response> {
  const bad = configError(env);
  if (bad) return bad;

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    return json({ error: 'Petición mal formada.' }, { status: 400 });
  }

  const role = decideRole(password, { view: env.VIEW_PASSWORD, admin: env.ADMIN_PASSWORD });

  if (!role) {
    // Freno suave contra la prueba automática de contraseñas.
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'Contraseña incorrecta.' }, { status: 401 });
  }

  return json(
    { role },
    {
      headers: {
        'Set-Cookie': cookieHeader(await issueToken(role, env.AUTH_SECRET), isSecure(request)),
      },
    },
  );
}

/** Salir. */
function salir(request: Request): Response {
  return json({ role: null }, { headers: { 'Set-Cookie': clearCookieHeader(isSecure(request)) } });
}
