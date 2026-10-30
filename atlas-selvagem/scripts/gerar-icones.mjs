// Gera os PNGs do manifesto a partir de icones/icone.svg usando o Chromium do Playwright.
// Uso: node scripts/gerar-icones.mjs  (requer `playwright` instalado globalmente ou no projeto)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = fileURLToPath(new URL('../icones/', import.meta.url));
const svg = await readFile(`${dir}icone.svg`, 'utf8');
const dados = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// maskable: o conteúdo ocupa 80% (zona segura) sobre fundo cheio.
const ALVOS = [
  { nome: 'icone-192.png', lado: 192, escala: 1 },
  { nome: 'icone-512.png', lado: 512, escala: 1 },
  { nome: 'icone-maskable-512.png', lado: 512, escala: 0.8 },
  { nome: 'apple-touch-icon.png', lado: 180, escala: 1 },
];

const nav = await chromium.launch();
const pag = await nav.newPage();
for (const a of ALVOS) {
  await pag.setViewportSize({ width: a.lado, height: a.lado });
  const img = Math.round(a.lado * a.escala);
  await pag.setContent(`<html><body style="margin:0;background:#191919;display:grid;place-items:center;width:${a.lado}px;height:${a.lado}px"><img src="${dados}" width="${img}" height="${img}"></body></html>`);
  await pag.waitForLoadState('load');
  await pag.screenshot({ path: `${dir}${a.nome}`, clip: { x: 0, y: 0, width: a.lado, height: a.lado } });
  console.log('gerado', a.nome);
}
await nav.close();
