/** Run against scripts/cloud-local.sh only. Never targets a configurable production host. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../mpc-cloud/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const origin = 'http://localhost:8180';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errors.push(m.text()); });
const suffix = Date.now();
const folder = `/Pruebas-${suffix}`;
const csv = Buffer.from('anio;mes;tn_totales;puntal_finsa\n2026;Enero;100;100\n');
const wait = (locator) => locator.waitFor({ state: 'visible' });
async function api(url, method = 'GET', data, token) {
  const r = await context.request.fetch(origin + '/api/' + url, {
    method, data, headers: { Origin: origin, ...(token ? { 'X-CSRF-Token': token } : {}) },
  });
  assert(r.ok(), `${method} ${url}: ${r.status()} ${await r.text()}`);
  return r;
}
async function upload(name, data, token, etag) {
  const start = await api('uploads', 'POST', { path: folder, name, size: data.length, onConflict: etag ? 'replace' : 'fail', ...(etag ? { ifMatch: etag } : {}) }, token);
  const { id } = await start.json();
  const part = await context.request.put(`${origin}/api/uploads/${id}?offset=0`, { data, headers: { Origin: origin, 'X-CSRF-Token': token, 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': createHash('sha256').update(data).digest('hex') } });
  assert(part.ok(), await part.text());
  return (await api(`uploads/${id}/complete`, 'POST', {}, token)).json();
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
  await page.goto(origin + '/informes/');
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await page.locator('.historico input[type=file]').setInputFiles({ name: 'local.csv', mimeType: 'text/csv', buffer: csv });
  await wait(page.getByText(/local\.csv/));
  await page.waitForFunction(() => location.hash.startsWith('#h='));
  const shared = page.url();
  const guest = await browser.newPage(); await guest.goto(shared);
  await wait(guest.getByRole('tab', { name: 'Histórico', exact: true }));
  assert(await guest.locator('.historico').innerText().then(t => !t.includes('Carga el CSV histórico')));
  await guest.close();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill('ana');
  await page.getByLabel('Contraseña', { exact: true }).fill('secreto-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await wait(page.getByText('MPC Cloud · ana', { exact: true }));
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
  await page.getByRole('button', { name: 'Guardar como en MPC Cloud', exact: true }).filter({ visible: true }).click();
  const pdfDialog = page.getByRole('dialog');
  await pdfDialog.getByLabel('Nombre', { exact: true }).fill('copia.pdf');
  await page.getByRole('button', { name: 'Guardar en esta carpeta' }).click();
  await pdfDialog.waitFor({ state: 'hidden' });
  const downloadedPdf = await (await api(`files/content?path=${encodeURIComponent(folder + '/copia.pdf')}`)).body();
  assert.deepEqual(downloadedPdf, pdf);
  const cloud = await context.newPage(); await cloud.goto(origin);
  await wait(cloud.getByText(folder.slice(1), { exact: true }));
  await cloud.getByText(folder.slice(1), { exact: true }).dblclick();
  await wait(cloud.getByText('copia.csv', { exact: true }));
  await mkdir('.cloud-test', { recursive: true });
  await cloud.screenshot({ path: '.cloud-test/cloud.png', fullPage: true });
  await cloud.close();
  await page.getByRole('tab', { name: 'Editor CSV', exact: true }).click();
  await page.screenshot({ path: '.cloud-test/editor.png', fullPage: true });
  await page.reload(); await wait(page.getByText('MPC Cloud · ana', { exact: true }));
  assert.deepEqual(errors, []);
  console.log('PASS: anonymous local CSV/share, login, same session across all views/reload, Cloud CSV/PDF read, ETag replacement/conflict, save as CSV/PDF, edits during upload, visibility in normal MPC Cloud UI, no CSP/page errors.');
} catch (e) { console.error((await page.locator('body').innerText()).slice(-7000)); await mkdir('.cloud-test', { recursive: true }); await page.screenshot({ path: '.cloud-test/failure.png', fullPage: true }); throw e; } finally { await browser.close(); }
