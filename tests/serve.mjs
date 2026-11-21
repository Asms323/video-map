// A tiny static file server for trying the app on a computer and for the tests.
//
//   node tests/serve.mjs          → http://localhost:8080
//   node tests/serve.mjs 3000     → http://localhost:3000

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
};

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  let relative;
  try {
    relative = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (relative.endsWith('/')) relative += 'index.html';

  const file = path.resolve(ROOT, `.${relative}`);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let info;
  try {
    info = await stat(file);
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }
  if (!info.isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }

  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  // Video players ask for byte ranges so they can seek.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (range && (range[1] !== '' || range[2] !== '')) {
    const start = range[1] === '' ? Math.max(info.size - Number(range[2]), 0) : Number(range[1]);
    const end = range[1] === '' || range[2] === '' ? info.size - 1 : Math.min(Number(range[2]), info.size - 1);
    if (start > end || start >= info.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${info.size}`,
      'Content-Length': end - start + 1,
    });
    createReadStream(file, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': info.size });
  createReadStream(file).pipe(response);
}

/** Start the server. Port 0 picks any free port. Resolves to { server, url }. */
export function listen(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://localhost:${server.address().port}` });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await listen(Number(process.argv[2] ?? 8080));
  console.log(`Video Map is running at ${url}`);
}
