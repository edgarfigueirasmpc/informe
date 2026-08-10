/**
 * Congela la extracción de texto de un PDF real como fixture de test, para
 * poder probar el parser sin depender de pdf.js ni del fichero original.
 *
 *   node scripts/make-fixture.mjs <ruta.pdf> <destino.json>
 */
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('uso: node scripts/make-fixture.mjs <ruta.pdf> <destino.json>');
  process.exit(1);
}

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(input)) }).promise;
const pages = [];

for (let n = 1; n <= doc.numPages; n++) {
  const content = await (await doc.getPage(n)).getTextContent();
  pages.push({
    items: content.items
      .filter((it) => 'str' in it && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], text: it.str })),
  });
}

fs.mkdirSync(new URL('.', `file://${output}`).pathname, { recursive: true });
fs.writeFileSync(output, JSON.stringify(pages, null, 1));
console.log(`${pages.length} páginas -> ${output}`);
