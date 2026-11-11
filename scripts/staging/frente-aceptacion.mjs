/**
 * Frente HTTPS local para la aceptación. Sirve Informes bajo su dominio real y
 * reenvía la API al MPC Cloud de STAGING por el túnel, de modo que el navegador
 * use exactamente los orígenes de producción sin que ninguna petición llegue al
 * Cloud de verdad. Sólo lo resuelve aquí el navegador de la prueba, por
 * --host-resolver-rules; el sistema no se toca.
 *
 *   node scripts/staging/frente-aceptacion.mjs <cert> <key> <puerto> <dir estático> <destino api>
 */
import { createReadStream } from 'node:fs';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const [cert, key, puerto, dirEstatico, destinoApi] = process.argv.slice(2);
const raiz = path.resolve(dirEstatico);
const api = new URL(destinoApi);
const HOST_INFORMES = 'informes.cacharolo.es';
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

async function estatico(req, res) {
  const pedido = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const destino = path.join(raiz, path.normalize(pedido).replace(/^(\.\.[/\\])+/, ''));
  let archivo = destino.startsWith(raiz) ? destino : raiz;
  try {
    if ((await stat(archivo)).isDirectory()) archivo = path.join(archivo, 'index.html');
  } catch { archivo = path.join(raiz, 'index.html'); }
  try { await stat(archivo); } catch { res.writeHead(404).end('no está'); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(archivo).pipe(res);
}

function haciaStaging(req, res) {
  const arriba = http.request({
    host: api.hostname, port: api.port, path: req.url, method: req.method,
    headers: { ...req.headers, host: api.host },
  }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  arriba.on('error', (e) => { if (!res.headersSent) res.writeHead(502); res.end(String(e.message)); });
  req.pipe(arriba);
}

https.createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
  // Marca para que la prueba pueda comprobar, ANTES de escribir nada, que está
  // hablando con este frente y no con el MPC Cloud de producción.
  res.setHeader('X-Frente-Aceptacion', '1');
  const host = (req.headers.host ?? '').split(':')[0];
  if (host === HOST_INFORMES) void estatico(req, res);
  else haciaStaging(req, res);
}).listen(Number(puerto), '127.0.0.1', () =>
  console.log(`frente https en 127.0.0.1:${puerto}: ${HOST_INFORMES} -> ${raiz}, lo demás -> ${destinoApi}`));
