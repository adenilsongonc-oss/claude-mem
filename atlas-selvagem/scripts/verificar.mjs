// Verificação de "build": o app não tem etapa de compilação, então conferimos a integridade do que será publicado.
// - todo arquivo do app está na lista de pré-cache do service worker (e vice-versa)
// - imports relativos de todos os módulos apontam para arquivos existentes
// - manifesto e JSONs são válidos e os ícones existem
// Uso: node scripts/verificar.mjs  (sai com código 1 se houver problema)

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLICAVEIS = /\.(html|css|js|json|webmanifest|woff2|png|svg)$/;
const IGNORAR = /^(docs|testes|scripts|node_modules|dist)\/|^(sw\.js|package\.json)$|\.map$/;

async function listar(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listar(p)));
    else out.push(relative(RAIZ, p).split('\\').join('/'));
  }
  return out;
}
const existe = (p) => stat(join(RAIZ, p)).then((s) => s.isFile(), () => false);

export async function verificar() {
  const problemas = [];
  const sw = await readFile(join(RAIZ, 'sw.js'), 'utf8');
  const lista = [...sw.matchAll(/^\s+'([^']+)',?$/gm)].map((m) => m[1]).filter((u) => u !== './');
  for (const u of lista) if (!(await existe(u))) problemas.push(`sw.js lista "${u}", que não existe`);
  const arquivos = (await listar(RAIZ)).filter((f) => PUBLICAVEIS.test(f) && !IGNORAR.test(f));
  for (const f of arquivos) if (!lista.includes(f)) problemas.push(`"${f}" não está no pré-cache do sw.js (não funcionará offline)`);

  for (const f of arquivos.filter((x) => x.endsWith('.js') && !x.startsWith('vendor/'))) {
    const src = await readFile(join(RAIZ, f), 'utf8');
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const alvo = relative(RAIZ, resolve(RAIZ, dirname(f), m[1] || m[2])).split('\\').join('/');
      if (!(await existe(alvo))) problemas.push(`${f} importa "${m[1] || m[2]}", que não existe`);
    }
  }
  for (const f of arquivos.filter((x) => /\.(json|webmanifest)$/.test(x))) {
    try { JSON.parse(await readFile(join(RAIZ, f), 'utf8')); } catch (e) { problemas.push(`${f}: JSON inválido (${e.message})`); }
  }
  const man = JSON.parse(await readFile(join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  for (const i of man.icons) if (!(await existe(i.src))) problemas.push(`ícone do manifesto ausente: ${i.src}`);
  if (!man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')) problemas.push('manifesto sem ícone maskable 512');
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) if (!man[k]) problemas.push(`manifesto sem "${k}"`);
  return { problemas, arquivos: arquivos.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { problemas, arquivos } = await verificar();
  if (problemas.length) { console.error(problemas.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
  console.log(`✓ ${arquivos} arquivos publicáveis verificados: pré-cache, imports, JSON e manifesto em ordem.`);
}
