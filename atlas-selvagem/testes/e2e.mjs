// Teste de ponta a ponta no Chromium (Playwright): fluxos principais, persistência, backup, PWA e offline.
// Uso: node testes/e2e.mjs   (requer `playwright` com Chromium; sobe o servidor de desenvolvimento sozinho)

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORTA = 5199;
const URL_APP = `http://localhost:${PORTA}/`;
const tmp = await mkdtemp(join(tmpdir(), 'atlas-e2e-'));

const servidor = spawn(process.execPath, [fileURLToPath(new URL('../scripts/servir.mjs', import.meta.url)), String(PORTA)], { stdio: 'pipe' });
await new Promise((r) => servidor.stdout.once('data', r));

// GPX de teste: ida e volta de ~2 km com elevação e horários.
function gpxTeste() {
  const pts = [];
  let t = Date.parse('2026-09-12T07:00:00Z');
  const passo = 10 / 111320 / Math.cos((-22.9 * Math.PI) / 180);
  for (let i = 0; i <= 200; i++) {
    const k = i <= 100 ? i : 200 - i;
    pts.push(`<trkpt lat="-22.900000" lon="${(-46.8 + k * passo).toFixed(6)}"><ele>${700 + k}</ele><time>${new Date(t).toISOString()}</time></trkpt>`);
    t += 12000;
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="teste" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Teste</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}
const arqGPX = join(tmp, 'teste.gpx');
await writeFile(arqGPX, gpxTeste());
const arqRuim = join(tmp, 'ruim.gpx');
await writeFile(arqRuim, '<gpx><wpt lat="1" lon="2"/></gpx>');
// PNG 1x1 válido para o upload de foto.
const arqFoto = join(tmp, 'foto.png');
await writeFile(arqFoto, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

const resultados = [];
const passo = async (nome, fn) => {
  try { await fn(); resultados.push(['ok', nome]); console.log(`✓ ${nome}`); } catch (e) { resultados.push(['falha', nome, e]); console.log(`✗ ${nome}\n  ${e.message.slice(0, 400)}`); }
};

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const p = await ctx.newPage();
const errosJS = [];
p.on('pageerror', (e) => errosJS.push(e.message));
p.on('dialog', (d) => d.accept());
const ir = async (hash) => { await p.goto(`${URL_APP}#/${hash}`); await p.waitForSelector('#conteudo h1, #conteudo .titulo-pagina', { timeout: 8000 }); };

await passo('atlas abre com o registro base e indicadores calculados', async () => {
  await ir('atlas');
  await p.waitForSelector('.folha');
  assert.equal(await p.locator('.folha').count(), 1);
  assert.match(await p.locator('.indicadores').innerText(), /15,2/);
  assert.match(await p.locator('.meta-bloco').innerText(), /450 m/);
});

await passo('GPX inválido mostra mensagem compreensível', async () => {
  await ir('nova?gpx=1');
  await p.setInputFiles('#gpx-arquivo', arqRuim);
  await p.waitForSelector('#gpx-erro .pendencias');
  assert.match(await p.locator('#gpx-erro').innerText(), /waypoints|trkpt/);
});

await passo('nova expedição com GPX: revisão e salvamento', async () => {
  await ir('nova?gpx=1');
  await p.setInputFiles('#gpx-arquivo', arqGPX);
  await p.waitForSelector('#gpx-remover');
  assert.equal(await p.inputValue('#c-distanciaKm'), '2');
  assert.equal(await p.inputValue('#c-tempoTotalMin'), '0:40');
  await p.click('[data-etapa="0"]');
  await p.fill('#c-nome', 'Travessia de teste');
  await p.fill('#c-local', 'Serra do Japi, Jundiaí-SP');
  await p.fill('#c-regiao', 'Serra do Japi');
  await p.click('button[type="submit"]'); // -> percurso
  await p.click('button[type="submit"]'); // -> diário
  await p.selectOption('#c-dificuldade', 'Moderada');
  await p.fill('#c-esforco', '6');
  await p.setInputFiles('#c-fotos', arqFoto);
  await p.fill('#poi-nome', 'Bica');
  await p.click('#poi-add');
  await p.click('button[type="submit"]'); // -> revisão
  const rev = await p.locator('form').innerText();
  assert.match(rev, /GPX novo/);
  await p.click('button[type="submit"]'); // salvar
  await p.waitForSelector('.trilha-cab h1');
  assert.equal(await p.locator('.trilha-cab h1').innerText(), 'Travessia de teste');
  assert.match(await p.locator('.trilha-cab__linha').first().innerText(), /Nº 02/);
  assert.match(await p.locator('.resumo').innerText(), /2,00 km/);
  assert.equal(await p.locator('.perfil svg').count(), 1);
  await p.waitForSelector('#mapa-trilha .leaflet-overlay-pane path', { state: 'attached', timeout: 8000 });
  assert.equal(await p.locator('#mapa-trilha .sem-mapa').count(), 0);
  assert.equal(await p.locator('.galeria img').count(), 1);
  assert.match(await p.locator('#s-pontos').innerText(), /Bica/);
});

await passo('progresso: nova folha (mais antiga) vira primeiro registro e a seguinte avalia a meta', async () => {
  assert.match(await p.locator('#s-progresso').innerText(), /primeiro registro/);
  await ir('trilha/pico-das-cabras');
  assert.match(await p.locator('#s-progresso').innerText(), /Meta da folha anterior[\s\S]*(Não cumprida|Cumprida)/i);
  await p.goBack();
  await p.waitForFunction(() => document.querySelector('.trilha-cab h1')?.textContent === 'Travessia de teste');
});

await passo('diário salva sozinho e persiste após recarregar', async () => {
  await p.fill('#relato', 'Saí cedo, neblina até o km 1.');
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('#relato-estado').textContent), null, { timeout: 4000 });
  await p.reload();
  await p.waitForSelector('#relato');
  assert.equal(await p.inputValue('#relato'), 'Saí cedo, neblina até o km 1.');
});

await passo('favoritar, buscar e filtrar', async () => {
  await p.click('#favoritar');
  await p.waitForFunction(() => document.querySelector('#favoritar')?.getAttribute('aria-pressed') === 'true');
  await ir('atlas');
  await p.fill('#busca', 'japi');
  await p.waitForFunction(() => document.querySelectorAll('.folha').length === 1 && /Travessia/.test(document.querySelector('.folha').textContent));
  await p.click('#limpar-filtros');
  await p.click('#abrir-filtros');
  await p.check('#painel-filtros [name="favoritos"]');
  await p.waitForFunction(() => document.querySelectorAll('.folha').length === 1);
  assert.match(await p.locator('.contador-filtros').innerText(), /1/);
  await p.click('#limpar-filtros');
  await p.waitForFunction(() => document.querySelectorAll('.folha').length === 2);
});

await passo('ordenação por distância crescente/decrescente', async () => {
  await p.selectOption('#ordem', 'distanciaKm');
  await p.waitForTimeout(150);
  const primeiraDesc = await p.locator('.folha__nome').first().innerText();
  await p.click('#dir');
  await p.waitForTimeout(150);
  const primeiraAsc = await p.locator('.folha__nome').first().innerText();
  assert.equal(primeiraDesc, 'Pico das Cabras');
  assert.equal(primeiraAsc, 'Travessia de teste');
});

await passo('modos lista e estatísticas mudam a apresentação', async () => {
  await ir('lista');
  assert.equal(await p.locator('.linha-trilha').count(), 2);
  await ir('estatisticas');
  const txt = await p.locator('.recordes').innerText();
  assert.match(txt, /17,2 km/); // 15,16 + 2,00
  assert.match(txt, /\+4[78]\d m/); // 382 + ~96 (GPX suavizado)
});

await passo('edição preserva número e marca origem manual', async () => {
  await ir('atlas');
  const id = await p.locator('.folha', { hasText: 'Travessia de teste' }).getAttribute('data-id');
  await ir(`editar/${id}`);
  await p.click('[data-etapa="1"]');
  await p.fill('#c-altitudeMax', '805');
  await p.click('[data-etapa="3"]');
  await p.click('button[type="submit"]');
  await p.waitForSelector('.trilha-cab h1');
  assert.match(await p.locator('.trilha-cab__linha').first().innerText(), /Nº 02/);
  assert.match(await p.locator('.resumo').innerText(), /805 m\s*manual/i);
});

await passo('cancelar com alterações pede confirmação', async () => {
  await ir('nova');
  await p.fill('#c-nome', 'Rascunho descartável');
  await p.click('#cancelar');
  await p.waitForSelector('dialog.dialogo');
  await p.click('dialog.dialogo button[value="sim"]');
  await p.waitForSelector('.folha');
});

let arquivoBackup;
await passo('exportar backup completo', async () => {
  await ir('arquivo');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportar-backup')]);
  arquivoBackup = join(tmp, 'backup.json');
  await dl.saveAs(arquivoBackup);
  const b = JSON.parse(await readFile(arquivoBackup, 'utf8'));
  assert.equal(b.formato, 'atlas-selvagem-backup');
  assert.equal(b.trilhas.length, 1);
  assert.equal(b.fotos.length, 1);
  assert.equal(b.trajetos.length, 1);
  assert.ok(b.fotos[0].dados.length > 10);
  assert.equal(b.anotacoes.find((a) => a.trilhaId === b.trilhas[0].id)?.diario?.relato, 'Saí cedo, neblina até o km 1.', JSON.stringify(b.anotacoes).slice(0, 300));
});

await passo('excluir exige confirmação e remove a trilha', async () => {
  await ir('atlas');
  await p.locator('.folha', { hasText: 'Travessia de teste' }).click();
  await p.waitForSelector('#excluir');
  await p.click('#excluir');
  await p.click('dialog.dialogo button[value="sim"]');
  await p.waitForSelector('.folha');
  assert.equal(await p.locator('.folha').count(), 1);
});

await passo('restaurar backup (mesclar) devolve registro, foto e trajeto', async () => {
  await ir('arquivo');
  await p.setInputFiles('#arquivo-backup', arquivoBackup);
  await p.waitForSelector('dialog.dialogo');
  await p.click('dialog.dialogo button[value="mesclar"]');
  await p.waitForFunction(() => /restaurado/.test(document.querySelector('#avisos')?.textContent || ''));
  await ir('atlas');
  await p.waitForFunction(() => document.querySelectorAll('.folha').length === 2);
  await p.locator('.folha', { hasText: 'Travessia de teste' }).click();
  await p.waitForSelector('.galeria img');
  assert.equal(await p.inputValue('#relato'), 'Saí cedo, neblina até o km 1.');
});

await passo('exportar GPX de uma trilha com trajeto', async () => {
  await p.click('#exportar');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog.dialogo button[value="gpx"]')]);
  const caminho = join(tmp, 'saida.gpx');
  await dl.saveAs(caminho);
  const x = await readFile(caminho, 'utf8');
  assert.equal((x.match(/<trkpt /g) || []).length, 201);
});

await passo('folha de saída monta a mensagem e salva o checklist', async () => {
  await ir('saida');
  await p.fill('#s-para', 'Ana');
  await p.fill('#s-trilha', 'Pico Paraná');
  await p.fill('#s-volta', '18:00');
  assert.match(await p.locator('#estado-roteiro').innerText(), /faltam 2/); // partida e saída
  await p.click('.menu-saida a[href="#/saida/mensagem"]');
  await p.waitForSelector('#mensagem');
  assert.match(await p.locator('#mensagem').innerText(), /Ana, vou fazer a trilha Pico Paraná.*20:00/s);
  assert.match(await p.locator('.pendencias').innerText(), /ponto de partida e saída/);
  await p.click('.menu-saida a[href="#/saida/checklist"]');
  await p.waitForSelector('#checklist');
  await p.locator('#checklist input').first().check();
  assert.match(await p.locator('#estado-checklist').innerText(), /^1 de/);
  await p.waitForTimeout(300);
  await p.reload();
  await p.waitForSelector('#checklist');
  assert.equal(await p.locator('#checklist input').first().isChecked(), true);
  await ir('saida');
  assert.equal(await p.inputValue('#s-para'), 'Ana');
});

await passo('folha de saída preenchida por GPX (trilha, partida, volta e coordenadas)', async () => {
  const comWpt = (await readFile(arqGPX, 'utf8')).replace('<trk>', '<wpt lat="-22.900100" lon="-46.800000"><name>Portão do parque</name></wpt><trk>');
  const arq = join(tmp, 'wikiloc.gpx');
  await writeFile(arq, comWpt);
  await ir('saida');
  await p.fill('#s-saida', '06:00');
  await p.setInputFiles('#s-gpx', arq);
  await p.waitForSelector('#gpx-limpar');
  assert.equal(await p.inputValue('#s-trilha'), 'Teste');
  assert.equal(await p.inputValue('#s-partida'), 'Portão do parque');
  assert.equal(await p.inputValue('#s-volta'), '06:45'); // 40 min do autor, arredondado
  await p.fill('#s-saida', '07:00');
  await p.locator('#s-saida').dispatchEvent('change');
  assert.equal(await p.inputValue('#s-volta'), '07:45');
  await p.reload();
  await p.waitForSelector('#gpx-limpar');
  assert.equal(await p.inputValue('#s-volta'), '07:45');
  await ir('saida/mensagem');
  assert.match(await p.locator('#mensagem').innerText(), /Coordenadas da partida: -22\.90000, -46\.80000/);
});

await passo('manifesto e service worker ativos', async () => {
  await ir('atlas');
  const r = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    return { sw: !!reg.active, nome: m.name, display: m.display, icones: m.icons.length, controlado: !!navigator.serviceWorker.controller };
  });
  assert.equal(r.sw, true);
  assert.equal(r.nome, 'Atlas Selvagem');
  assert.equal(r.display, 'standalone');
  assert.ok(r.icones >= 3);
});

await passo('offline: app abre, mostra registros e salva diário sem rede', async () => {
  await p.reload(); // garante controle pelo SW
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await p.goto(`${URL_APP}#/atlas`);
  await p.waitForSelector('.folha');
  assert.equal(await p.locator('.folha').count(), 2);
  assert.match(await p.locator('#faixas').innerText(), /Sem conexão/);
  await p.locator('.folha', { hasText: 'Pico das Cabras' }).click();
  await p.waitForSelector('#relato');
  await p.fill('#relato', 'Anotado sem sinal.');
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('#relato-estado').textContent));
  await p.reload();
  await p.waitForSelector('#relato');
  assert.equal(await p.inputValue('#relato'), 'Anotado sem sinal.');
  await ir('estatisticas');
  await ir('nova');
  await ctx.setOffline(false);
});

await passo('sem rolagem horizontal em 360 px', async () => {
  await p.setViewportSize({ width: 360, height: 780 });
  await ir('mapa');
  await p.waitForSelector('#mapa-explorar .leaflet-overlay-pane path', { state: 'attached', timeout: 8000 });
  for (const r of ['atlas', 'lista', 'estatisticas', 'mapa', 'nova', 'arquivo', 'saida', 'saida/mensagem', 'saida/checklist', 'distintivos']) {
    await ir(r);
    await p.waitForTimeout(250);
    const largura = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 361, `${r}: largura ${largura}`);
  }
});

await passo('nenhum erro de JavaScript durante os fluxos', async () => {
  assert.deepEqual(errosJS, []);
});

await nav.close();
servidor.kill();
const falhas = resultados.filter((r) => r[0] === 'falha');
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} passos ok.`);
process.exit(falhas.length ? 1 : 0);
