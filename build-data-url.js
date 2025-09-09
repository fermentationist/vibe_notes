import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a single-file HTML with all dependencies inlined
async function buildDataUrl() {
  console.log('Creating data URL...');
  
  // Read the HTML, CSS, and JS files
  const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  const jsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
  
  // Inline the JS directly into the HTML
  const inlinedHtml = htmlContent.replace(
    '<script src="app.js" type="module"></script>',
    `<script type="module">
${jsContent}
</script>`
  );
  
  // Create data URL
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(inlinedHtml)}`;
  
  // Write data URL to file
  fs.writeFileSync(path.join(__dirname, 'data-url.txt'), dataUrl);
  console.log('Data URL created and saved to data-url.txt');
  
  // Log the length of the data URL
  console.log(`Data URL length: ${dataUrl.length} characters`);
  
  // Also save the inlined HTML for reference
  fs.writeFileSync(path.join(__dirname, 'inlined.html'), inlinedHtml);
  console.log('Inlined HTML saved to inlined.html');
}

buildDataUrl().catch(console.error);
