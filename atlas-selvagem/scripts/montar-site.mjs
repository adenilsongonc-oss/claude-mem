// Monta a pasta dist/ só com os arquivos do app (a lista de pré-cache do sw.js + o próprio sw.js).
// Usado pelo Netlify (netlify.toml) e para gerar o zip. docs/, testes/ e scripts/ não são publicados.
// Uso: node scripts/montar-site.mjs

import { readFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DESTINO = join(RAIZ, 'dist');
const sw = await readFile(join(RAIZ, 'sw.js'), 'utf8');
const arquivos = [...sw.matchAll(/^\s+'([^']+)',?$/gm)].map((m) => m[1]).filter((u) => u !== './').concat('sw.js');

await rm(DESTINO, { recursive: true, force: true });
for (const f of arquivos) {
  await mkdir(dirname(join(DESTINO, f)), { recursive: true });
  await copyFile(join(RAIZ, f), join(DESTINO, f));
}
console.log(`✓ dist/ montada com ${arquivos.length} arquivos.`);
