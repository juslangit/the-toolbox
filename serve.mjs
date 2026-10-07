// Local static server for development:  node serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || 8471);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`The Toolbox → http://127.0.0.1:${PORT}/`));
