/**
 * Servidor estático mínimo para probar Informes en SU PROPIO ORIGEN, separado
 * del de MPC Cloud. Solo para pruebas locales: no hay nada que configurar ni
 * que exponer, y sirve exactamente los archivos compilados.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const raiz = path.resolve(process.argv[2] ?? 'dist-publico');
const puerto = Number(process.argv[3] ?? 8181);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

http.createServer(async (req, res) => {
  const pedido = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // Nada de subir por encima de la raíz servida.
  const destino = path.join(raiz, path.normalize(pedido).replace(/^(\.\.[/\\])+/, ''));
  let archivo = destino.startsWith(raiz) ? destino : raiz;
  try {
    if ((await stat(archivo)).isDirectory()) archivo = path.join(archivo, 'index.html');
  } catch {
    archivo = path.join(raiz, 'index.html'); // aplicación de una sola página
  }
  try {
    await stat(archivo);
  } catch {
    res.writeHead(404).end('no está');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(archivo).pipe(res);
}).listen(puerto, '127.0.0.1', () => console.log(`Informes en http://localhost:${puerto}/ (desde ${raiz})`));
