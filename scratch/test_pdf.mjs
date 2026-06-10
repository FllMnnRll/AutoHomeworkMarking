import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';
import DOMMatrix from 'dommatrix';
global.DOMMatrix = DOMMatrix;
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function convertPdfToImage(pdfPath) {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      standardFontDataUrl: `file://${path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts/')}`
    });
    const pdfDocument = await loadingTask.promise;
    console.log(`Loaded PDF with ${pdfDocument.numPages} pages.`);

    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
    const outPath = path.join(__dirname, 'test_page_1.jpg');
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved page 1 to ${outPath}`);
    return true;
  } catch (err) {
    console.error("Error rendering PDF:", err);
    return false;
  }
}

const files = fs.readdirSync('e:/AutoHomeworkMarking/public/uploads');
const pdfFile = files.find(f => f.endsWith('.pdf'));
if (pdfFile) {
  await convertPdfToImage(path.join('e:/AutoHomeworkMarking/public/uploads', pdfFile));
} else {
  console.log("No PDF found in uploads folder to test.");
}
