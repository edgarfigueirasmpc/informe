/**
 * Carga de pdf.js. Se importa de forma perezosa: sólo quien sube un informe
 * paga el coste de descargar la librería, los demás no la tocan nunca.
 */

import type { PageText, ParseResult, TextItem } from './parseReport';
import { parsePages } from './parseReport';

export async function extractPages(data: ArrayBuffer): Promise<PageText[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages: PageText[] = [];

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        items.push({ x: item.transform[4], y: item.transform[5], text: item.str });
      }
      pages.push({ items });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return pages;
}

export async function parsePdfFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const pages = await extractPages(buffer);
  return parsePages(pages, file.name);
}
