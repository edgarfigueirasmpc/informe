import type { Report } from '../../src/lib/model';
import {
  configError,
  currentRole,
  json,
  metodoNoPermitido,
  REPORT_KEY,
  type Env,
} from '../../shared/env';

export function handleReport(request: Request, env: Env): Promise<Response> | Response {
  switch (request.method) {
    case 'GET':
      return consultar(request, env);
    case 'PUT':
      return publicar(request, env);
    default:
      return metodoNoPermitido('GET, PUT');
  }
}

/** Consultar el informe publicado. Requiere haber entrado con cualquiera de las dos claves. */
async function consultar(request: Request, env: Env): Promise<Response> {
  const bad = configError(env);
  if (bad) return bad;

  if (!(await currentRole(request, env))) {
    return json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const stored = await env.INFORME.get(REPORT_KEY, 'json');
  if (!stored) {
    return json({ error: 'Todavía no hay ningún informe publicado.' }, { status: 404 });
  }
  return json(stored);
}

/** Publicar un informe nuevo. Pisa el anterior: sólo se guarda el último. */
async function publicar(request: Request, env: Env): Promise<Response> {
  const bad = configError(env);
  if (bad) return bad;

  if ((await currentRole(request, env)) !== 'admin') {
    return json({ error: 'Hace falta la contraseña de publicación.' }, { status: 403 });
  }

  let report: Report;
  try {
    report = (await request.json()) as Report;
  } catch {
    return json({ error: 'Petición mal formada.' }, { status: 400 });
  }

  const problema = validate(report);
  if (problema) return json({ error: problema }, { status: 400 });

  await env.INFORME.put(REPORT_KEY, JSON.stringify(report));
  return json({ ok: true, publishedAt: report.publishedAt });
}

function validate(report: unknown): string | null {
  if (!report || typeof report !== 'object') return 'El informe no es un objeto.';
  const r = report as Partial<Report>;

  if (!r.header || typeof r.header.totalMes !== 'number') {
    return 'El informe no trae una cabecera válida.';
  }
  if (!Number.isFinite(r.header.diasTrabajados) || r.header.diasTrabajados <= 0) {
    return 'El informe no trae días trabajados válidos.';
  }
  if (!Array.isArray(r.clients) || r.clients.length === 0) {
    return 'El informe no trae clientes.';
  }
  if (r.clients.length > 500) {
    return 'El informe trae demasiados clientes; parece que no es el informe esperado.';
  }
  for (const c of r.clients) {
    if (typeof c?.name !== 'string' || !c.name) return 'Hay un cliente sin nombre.';
    if (!c.tn || typeof c.tn.pino !== 'number') return `Datos inválidos en "${c.name}".`;
  }
  if (typeof r.publishedAt !== 'string') return 'Falta la fecha de publicación.';
  return null;
}
