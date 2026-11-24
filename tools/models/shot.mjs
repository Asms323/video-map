// Pictures of a model from several sides: node shot.mjs <file.glb> <out.png> [views 4] [degrees up 18] ["&unlit=1&bg=0b0d14"]
// (Needs: npm i --no-save three@0.170.0 in this folder, and Playwright with its browser.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = dirname(fileURLToPath(import.meta.url)); // this folder: the page, the libraries and the model are served from it
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
// (The 3D library is served from wherever it is installed.)
const three = dirname(dirname(createRequire(import.meta.url).resolve('three')));
const server = createServer(async (request, response) => {
  try {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    const data = await readFile(path.startsWith('/three/') ? join(three, path.slice(7)) : join(root, path));
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const [glb, out, views = '4', elev = '18', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 700 * Number(views), height: 700 }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.log('PAGEERROR', String(error).slice(0, 300)));
// (The model is copied beside the page for the while, so that the page may fetch it.)
const { copyFileSync, rmSync } = await import('node:fs');
const beside = join(root, '.shot.glb');
copyFileSync(resolve(glb), beside);
await page.goto(`http://127.0.0.1:${port}/view.html?glb=.shot.glb&views=${views}&elev=${elev}${extra}`);
await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => window.__done)));
await page.locator('canvas').screenshot({ path: out });
await browser.close();
server.close();
rmSync(beside, { force: true });
