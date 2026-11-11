/** Run against scripts/cloud-local.sh only. Never targets a configurable production host. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../mpc-cloud/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
// Por defecto, el entorno local con Django simulado. En la aceptación de staging
// se apunta al contenedor real con CLOUD_ORIGIN/CLOUD_USER/CLOUD_PASSWORD, para no
// tener una segunda copia de esta prueba.
const origin = process.env.CLOUD_ORIGIN ?? 'http://localhost:8180';
const usuario = process.env.CLOUD_USER ?? 'ana';
const clave = process.env.CLOUD_PASSWORD ?? 'secreto-123';
// Dos despliegues, una sola prueba: Informes servido por Cloud en /informes/, o
// Informes en su propio dominio hablando con Cloud por CORS. Lo único que
// cambia es dónde vive la página y cómo se presenta este script ante la API:
// con la cookie y su CSRF, o con el token que emitió Django.
const appUrl = process.env.INFORMES_URL ?? `${origin}/informes/`;
const appOrigin = new URL(appUrl).origin;
const cruzado = appOrigin !== origin;
const loginApi = process.env.CLOUD_LOGIN_API ?? origin;
// Cuenta de solo lectura. Vacía: se omite esa comprobación (p. ej. si en ese
// entorno no existe una cuenta técnica de lectura).
const lector = process.env.CLOUD_READER_USER ?? 'lector';
const claveLector = process.env.CLOUD_READER_PASSWORD ?? clave;
let token = null;
// Aceptación con los dominios reales: el navegador resuelve informes.cacharolo.es
// y cloud.mpc1.es contra el frente local que va al staging. Sólo dentro de este
// navegador; el sistema y el resto de la red no se enteran.
const reglasDeHost = process.env.BROWSER_HOST_RULES ?? '';
const browser = await chromium.launch({
  headless: true,
  ...(reglasDeHost ? { args: [`--host-resolver-rules=${reglasDeHost}`] } : {}),
});
/** Todo contexto nuevo necesita las mismas opciones: si no, el certificado de pruebas lo rechaza. */
const nuevoContexto = () => browser.newContext(reglasDeHost ? { ignoreHTTPSErrors: true } : {});
const context = await nuevoContexto();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errors.push(m.text()); });
const suffix = Date.now();
const folder = `/Pruebas-${suffix}`;
const csv = Buffer.from('anio;mes;tn_totales;puntal_finsa\n2026;Enero;100;100\n');
const wait = (locator) => locator.waitFor({ state: 'visible' });
/** Credencial de este script ante la API, la misma que usa la aplicación. */
function cabeceras(csrf) {
  return cruzado
    ? { Origin: appOrigin, Authorization: `Token ${token}` }
    : { Origin: origin, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) };
}
async function api(url, method = 'GET', data, csrf) {
  const r = await context.request.fetch(origin + '/api/' + url, {
    method, data, headers: cabeceras(csrf),
  });
  assert(r.ok(), `${method} ${url}: ${r.status()} ${await r.text()}`);
  return r;
}
async function upload(name, data, csrf, etag) {
  const start = await api('uploads', 'POST', { path: folder, name, size: data.length, onConflict: etag ? 'replace' : 'fail', ...(etag ? { ifMatch: etag } : {}) }, csrf);
  const { id } = await start.json();
  const part = await context.request.put(`${origin}/api/uploads/${id}?offset=0`, { data, headers: { ...cabeceras(csrf), 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': createHash('sha256').update(data).digest('hex') } });
  assert(part.ok(), await part.text());
  return (await api(`uploads/${id}/complete`, 'POST', {}, csrf)).json();
}
// A valid PDF built from the existing coordinate fixture, entirely synthetic test output.
function fixturePdf(pages) {
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  for (const page of pages) {
    const pageId = objects.length + 1, streamId = pageId + 1; kids.push(`${pageId} 0 R`);
    const stream = page.items.map(i => `BT /F1 5 Tf 1 0 0 1 ${i.x} ${i.y} Tm (${i.text.replace(/[\\()]/g, '\\$&')}) Tj ET`).join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 650] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'; objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
try {
  if (reglasDeHost) {
    // Antes de escribir nada: comprobar que lo que el navegador llama Cloud es
    // el frente de pruebas. Si la resolución fallara, la prueba estaría
    // escribiendo en el Cloud de verdad, y eso no puede pasar ni una vez.
    for (const url of [appUrl, `${process.env.CLOUD_BROWSER_ORIGIN ?? origin}/api/session`]) {
      const sonda = await page.goto(url);
      assert.equal(sonda?.headers()['x-frente-aceptacion'], '1', `${url} NO sale del frente de pruebas`);
    }
  }
  await page.goto(appUrl);
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await page.locator('.historico input[type=file]').setInputFiles({ name: 'local.csv', mimeType: 'text/csv', buffer: csv });
  await wait(page.getByText(/local\.csv/));
  await page.waitForFunction(() => location.hash.startsWith('#h='));
  const shared = page.url();
  const invitado = await nuevoContexto();
  const guest = await invitado.newPage(); await guest.goto(shared);
  await wait(guest.getByRole('tab', { name: 'Histórico', exact: true }));
  assert(await guest.locator('.historico').innerText().then(t => !t.includes('Carga el CSV histórico')));
  await guest.close(); await invitado.close();
  // No hay nada de Cloud en pantalla hasta que se usa: la contraseña se pide al
  // pulsar «Abrir desde MPC Cloud», y al entrar se sigue con lo que ibas a hacer.
  assert.equal(await page.getByRole('button', { name: 'Iniciar sesión' }).count(), 0);
  await page.getByRole('button', { name: 'Abrir desde MPC Cloud', exact: true }).filter({ visible: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(`${clave}-mal`);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await wait(page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Usuario o contraseña incorrectos' }));
  assert.equal(await page.getByText(`MPC Cloud · ${usuario}`, { exact: true }).count(), 0);
  await page.getByLabel('Usuario', { exact: true }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await wait(page.getByText(`MPC Cloud · ${usuario}`, { exact: true }));
  // La acción pendiente continúa sola: el panel de carpetas se abre sin repetir el clic.
  await wait(page.getByRole('dialog').getByText('Carpeta: /', { exact: true }));
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  if (cruzado) {
    // El script necesita su propia credencial para preparar y comprobar datos:
    // la pide al mismo login delegado que usa la aplicación.
    const r = await context.request.post(`${loginApi}/api/auth/token/`, { data: { username: usuario, password: clave }, headers: { Origin: appOrigin } });
    assert(r.ok(), `login ${r.status()} ${await r.text()}`);
    token = (await r.json()).token;
  }
  const session = await (await api('session')).json(); const csrf = session.csrfToken;
  await api('fs/folders', 'POST', { path: '/', name: folder.slice(1) }, csrf);
  await upload('datos.csv', csv, csrf);
  const pdf = fixturePdf(JSON.parse(await readFile(new URL('../src/lib/__fixtures__/informe-2026-08-09.json', import.meta.url), 'utf8')));
  await upload('informe.pdf', pdf, csrf);
  async function openCloud(section, filename) {
    await page.getByRole('tab', { name: section, exact: true }).click();
    await page.getByRole('button', { name: 'Abrir desde MPC Cloud', exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.getByText('Carpeta: /', { exact: true }).count()) await dialog.getByRole('button', { name: `Carpeta: ${folder.slice(1)}`, exact: true }).click();
    await dialog.getByRole('button', { name: filename, exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  await openCloud('Histórico', 'datos.csv');
  await wait(page.getByText(/datos\.csv/));
  await openCloud('Por cliente', 'datos.csv');
  await wait(page.getByText(/datos\.csv/));
  await openCloud('Editor CSV', 'datos.csv');
  const cell = page.getByRole('textbox', { name: 'tn_totales, fila 1', exact: true });
  await cell.fill('200');
  await page.getByRole('button', { name: 'Guardar sobre el original en MPC Cloud' }).click();
  await wait(page.getByRole('status').filter({ hasText: 'Guardado en MPC Cloud' }));
  assert.match(await (await api(`files/content?path=${encodeURIComponent(folder + '/datos.csv')}`)).text(), /200/);
  const info = await (await api(`fs/info?path=${encodeURIComponent(folder + '/datos.csv')}`)).json();
  await upload('datos.csv', Buffer.from(csv.toString().replace('100;100', '300;100')), csrf, info.entry.etag);
  await cell.fill('400');
  await page.getByRole('button', { name: 'Guardar sobre el original en MPC Cloud' }).click();
  await wait(page.getByRole('alert').filter({ hasText: 'Tus cambios se conservan' }));
  assert.equal(await cell.inputValue(), '400');
  assert.match(await (await api(`files/content?path=${encodeURIComponent(folder + '/datos.csv')}`)).text(), /300/);
  await page.getByRole('button', { name: 'Guardar como en MPC Cloud', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('copia.csv');
  await page.getByRole('button', { name: 'Guardar en esta carpeta' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.match(await (await api(`files/content?path=${encodeURIComponent(folder + '/copia.csv')}`)).text(), /400/);
  // Editing during an in-flight save must not mark the newer edits as saved.
  let release, reached;
  const gate = new Promise(r => { release = r; });
  const pending = new Promise(r => { reached = r; });
  await page.route('**/api/uploads/*/complete', async route => { reached(); await gate; await route.continue(); });
  await cell.fill('600');
  await page.getByRole('button', { name: 'Guardar sobre el original en MPC Cloud' }).click();
  await pending;
  await cell.fill('700');
  release();
  await wait(page.getByRole('status').filter({ hasText: 'Guardado en MPC Cloud' }));
  await wait(page.getByText('Cambios sin guardar', { exact: true }));
  assert.match(await (await api(`files/content?path=${encodeURIComponent(folder + '/copia.csv')}`)).text(), /600/);
  assert.equal(await cell.inputValue(), '700');
  await page.unroute('**/api/uploads/*/complete');
  await page.getByRole('button', { name: 'Guardar sobre el original en MPC Cloud' }).click();
  await page.getByText('Cambios sin guardar', { exact: true }).waitFor({ state: 'hidden' });
  await openCloud('Informe actual', 'informe.pdf');
  await wait(page.getByText(/Informe del .* listo/));
  // Guardar sólo se ofrece donde se cambia algo, que es el editor: en las vistas
  // de lectura el archivo sale igual que entró y copiarlo es cosa de Cloud.
  for (const seccion of ['Informe actual', 'Histórico', 'Por cliente']) {
    await page.getByRole('tab', { name: seccion, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /Guardar .* en MPC Cloud/ }).count(), 0, seccion);
  }
  // Con Informes en otro dominio, la sesión de Cloud es suya y aparte: va en su
  // propio contexto para que su cookie no se mezcle con el token de la prueba.
  const cloudCtx = cruzado ? await nuevoContexto() : context;
  const cloud = await cloudCtx.newPage(); await cloud.goto(origin);
  if (cruzado) {
    // Cloud es otro dominio con su propia sesión: aquí se entra por su login,
    // que es justo lo que hace un trabajador que abre cloud.mpc1.es.
    await cloud.getByLabel('Usuario').fill(usuario);
    await cloud.getByLabel('Contraseña').fill(clave);
    await cloud.getByRole('button', { name: /Entrar/ }).click();
  }
  await wait(cloud.getByText(folder.slice(1), { exact: true }));
  await cloud.getByText(folder.slice(1), { exact: true }).dblclick();
  await wait(cloud.getByText('copia.csv', { exact: true }));
  await mkdir('.cloud-test', { recursive: true });
  await cloud.screenshot({ path: '.cloud-test/cloud.png', fullPage: true });
  await cloud.close();
  if (cruzado) await cloudCtx.close();
  await page.getByRole('tab', { name: 'Editor CSV', exact: true }).click();
  await page.screenshot({ path: '.cloud-test/editor.png', fullPage: true });
  await page.reload(); await wait(page.getByText(`MPC Cloud · ${usuario}`, { exact: true }));
  if (lector) {
    // Una cuenta de solo lectura entra, pero no escribe: lo decide Django, no
    // el frontend. Contexto aparte para no tocar la sesión de la prueba.
    const otro = await nuevoContexto();
    const lectorPage = await otro.newPage();
    lectorPage.on('pageerror', e => errors.push(e.message));
    await lectorPage.goto(appUrl);
    await lectorPage.getByRole('tab', { name: 'Editor CSV', exact: true }).click();
    await lectorPage.locator('.editor input[type=file]').setInputFiles({ name: 'local.csv', mimeType: 'text/csv', buffer: csv });
    await lectorPage.getByRole('button', { name: 'Guardar como en MPC Cloud', exact: true }).filter({ visible: true }).click();
    await lectorPage.getByLabel('Usuario', { exact: true }).fill(lector);
    await lectorPage.getByLabel('Contraseña', { exact: true }).fill(claveLector);
    await lectorPage.getByRole('button', { name: 'Entrar', exact: true }).click();
    await wait(lectorPage.getByText(`MPC Cloud · ${lector}`, { exact: true }));
    await lectorPage.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('no-deberia.csv');
    await lectorPage.getByRole('button', { name: 'Guardar en esta carpeta' }).click();
    await wait(lectorPage.getByRole('alert').filter({ hasText: /permiso/i }));
    await otro.close();
    const sobra = await context.request.fetch(`${origin}/api/fs/info?path=${encodeURIComponent('/no-deberia.csv')}`, { headers: cabeceras(csrf) });
    assert.equal(sobra.status(), 404, 'el lector no debía haber creado nada');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS (${cruzado ? 'Informes en su propio dominio, CORS + token' : 'Informes servido por Cloud, cookie + CSRF'}): anonymous local CSV/share, invalid+valid login, same session across all views/reload, Cloud CSV/PDF read, ETag replacement/conflict, save as CSV, guardar sólo donde se edita, edits during upload, reader write denied, visibility in normal MPC Cloud UI, no CSP/page errors.`);
} catch (e) { console.error((await page.locator('body').innerText()).slice(-7000)); await mkdir('.cloud-test', { recursive: true }); await page.screenshot({ path: '.cloud-test/failure.png', fullPage: true }); throw e; } finally { await browser.close(); }
