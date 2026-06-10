const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function convertPdfToImage(pdfPath) {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
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
  convertPdfToImage(path.join('e:/AutoHomeworkMarking/public/uploads', pdfFile));
} else {
  console.log("No PDF found in uploads folder to test.");
}
