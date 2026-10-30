// Servidor estático mínimo para desenvolvimento (sem dependências).
// Uso: node scripts/servir.mjs [porta]   → http://localhost:5173
// localhost conta como contexto seguro: service worker e instalação funcionam sem HTTPS.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORTA = Number(process.argv[2] || process.env.PORT || 5173);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.gpx': 'application/gpx+xml', '.txt': 'text/plain; charset=utf-8',
};
const PRIVADO = /^\/(docs|testes|scripts|node_modules)\//;

createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (PRIVADO.test(caminho)) { res.writeHead(404).end(); return; }
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = normalize(join(RAIZ, caminho));
    if (!arquivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
    if (!(await stat(arquivo)).isFile()) throw new Error('não é arquivo');
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ...(caminho === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    res.end(await readFile(arquivo));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
  }
}).listen(PORTA, () => console.log(`Atlas Selvagem em http://localhost:${PORTA}`));
