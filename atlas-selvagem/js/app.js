// Ponto de entrada: shell, roteamento por hash, faixas de aviso e proteção contra perda de edição.

import { estado, carregar, assinar } from './estado.js';
import { html, montar, icone, $, avisar, confirmar, bruto } from './ui.js';
import { marcaSVG, carregarIcones } from './desenho.js';
import { prefs, definir, aplicarTema, temaEscuroAtivo } from './preferencias.js';
import { registrar, assinarPWA, pwa, aplicarAtualizacao } from './pwa.js';
import { pedirPersistencia } from './armazenamento.js';

const TELAS = {
  atlas: () => import('./telas/atlas.js'),
  nova: () => import('./telas/expedicao.js'),
  editar: () => import('./telas/expedicao.js'),
  trilha: () => import('./telas/detalhe.js'),
  arquivo: () => import('./telas/arquivo.js'),
  saida: () => import('./telas/saida.js'),
  distintivos: () => import('./telas/distintivos.js'),
};
// Modos de visualização do atlas são rotas próprias (links reais, histórico do navegador).
const MODOS = { atlas: 'atlas', lista: 'lista', mapa: 'mapa', estatisticas: 'estatisticas' };

const NAV = [
  { href: '#/atlas', rotulo: 'Atlas', icone: 'atlas', ativo: ['atlas', 'lista', 'trilha'] },
  { href: '#/mapa', rotulo: 'Mapa', icone: 'mapa', ativo: ['mapa'] },
  { href: '#/nova', rotulo: 'Nova expedição', curto: 'Nova', icone: 'mais', ativo: ['nova'], nova: true },
  { href: '#/estatisticas', rotulo: 'Estatísticas', icone: 'estat', ativo: ['estatisticas'] },
  { href: '#/arquivo', rotulo: 'Arquivo', icone: 'arquivo', ativo: ['arquivo'] },
];

let limparTela = null;
let rotaAtual = null;
let hashAnterior = location.hash;
let ignorarProximo = false;

// Telas com edição em andamento registram aqui uma função que diz se há alterações não salvas.
export const protecao = { sujo: null, definir(fn) { this.sujo = fn; }, limpar() { this.sujo = null; } };

export function lerRota(hash = location.hash) {
  const [caminho, busca = ''] = hash.replace(/^#\/?/, '').split('?');
  const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
  const nome = partes[0] || 'atlas';
  return { nome, params: partes.slice(1), query: new URLSearchParams(busca) };
}

export const ir = (hash) => { if (location.hash === hash) rotear(); else location.hash = hash; };

function desenharNav(nome) {
  montar($('#nav'), html`${NAV.map((n) => html`<a href="${n.href}" class="${n.nova ? 'nav__nova' : ''}" ${n.ativo.includes(nome) ? bruto('aria-current="page"') : ''}>
      ${n.nova ? html`<span class="circulo">${icone(n.icone)}</span>` : icone(n.icone)}${n.nova ? html`<span class="rot-curto">${n.curto}</span><span class="rot-longo">${n.rotulo}</span>` : html`<span>${n.rotulo}</span>`}</a>`)}
    <div class="nav__extra">
      <a href="#/saida" ${nome === 'saida' ? bruto('aria-current="page"') : ''}>${icone('saida')} Folha de saída</a>
      <a href="#/distintivos" ${nome === 'distintivos' ? bruto('aria-current="page"') : ''}>${icone('distintivo')} Distintivos</a>
    </div>
    <p class="nav__colofao">Vol. 01 · ${estado.trilhas.length} ${estado.trilhas.length === 1 ? 'folha' : 'folhas'}<br>Dados neste aparelho</p>`);
}

function desenharTema() {
  const escuro = temaEscuroAtivo();
  const b = $('#alternar-tema');
  montar(b, icone(escuro ? 'sol' : 'lua'));
  b.setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro');
  b.title = b.getAttribute('aria-label');
}

function desenharFaixas() {
  const f = [];
  if (estado.erro) f.push(html`<div class="faixa faixa--atencao" role="alert"><strong>Armazenamento local indisponível.</strong> ${estado.erro} Os registros da base continuam visíveis, mas nada novo pode ser salvo.</div>`);
  if (!navigator.onLine) f.push(html`<div class="faixa faixa--atencao">Sem conexão. Seus registros, o diário e as estatísticas funcionam normalmente; os mapas de fundo não carregam.</div>`);
  if (pwa.atualizacao) f.push(html`<div class="faixa faixa--destaque"><span>Há uma nova versão do Atlas.</span><button class="botao" type="button" data-acao="atualizar-app">Atualizar agora</button></div>`);
  montar($('#faixas'), html`${f}`);
}

async function rotear() {
  const rota = lerRota();
  if (ignorarProximo) { ignorarProximo = false; return; }
  if (protecao.sujo?.() && location.hash !== hashAnterior) {
    const sair = await confirmar('Descartar alterações?', 'Há dados não salvos nesta expedição. Se sair agora, eles serão perdidos.', { confirmar: 'Descartar e sair', perigo: true });
    if (!sair) { ignorarProximo = true; location.hash = hashAnterior; return; }
    protecao.limpar();
  }
  hashAnterior = location.hash;
  limparTela?.();
  limparTela = null;
  protecao.limpar();
  const nome = MODOS[rota.nome] ? 'atlas' : rota.nome;
  const carregarTela = TELAS[nome] || TELAS.atlas;
  rotaAtual = { ...rota, modo: MODOS[rota.nome] || null };
  desenharNav(rota.nome);
  const main = $('#conteudo');
  try {
    const mod = await carregarTela();
    if (rotaAtual.nome !== rota.nome || rotaAtual.params.join('/') !== rota.params.join('/')) return; // navegação mudou durante o carregamento
    limparTela = (await mod.render({ main, rota: rotaAtual, ir })) || null;
  } catch (e) {
    console.error(e);
    montar(main, html`<div class="vazio"><h2>Não foi possível abrir esta tela</h2><p class="sutil">${e.message}</p><a class="botao" href="#/atlas">Voltar ao atlas</a></div>`);
  }
  if (!rota.query.has('manter')) window.scrollTo({ top: 0 });
  main.focus({ preventScroll: true });
  document.title = `${main.querySelector('h1')?.textContent?.trim() || 'Atlas'} · Atlas Selvagem`;
}

async function iniciar() {
  aplicarTema();
  montar($('#marca-simbolo'), bruto(marcaSVG));
  montar($('#atalho-config'), icone('arquivo'));
  desenharTema();
  $('#alternar-tema').addEventListener('click', () => {
    definir('tema', temaEscuroAtivo() ? 'claro' : 'escuro');
    aplicarTema();
    window.dispatchEvent(new CustomEvent('atlas:tema'));
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs().tema === 'sistema') { aplicarTema(); window.dispatchEvent(new CustomEvent('atlas:tema')); } });
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-acao="atualizar-app"]')) {
      if (protecao.sujo?.()) { avisar('Salve ou cancele a expedição em edição antes de atualizar.', 'erro'); return; }
      aplicarAtualizacao();
    }
  });
  window.addEventListener('atlas:tema', desenharTema);
  window.addEventListener('online', desenharFaixas);
  window.addEventListener('offline', desenharFaixas);
  window.addEventListener('beforeunload', (e) => { if (protecao.sujo?.()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', rotear);
  assinarPWA(desenharFaixas);
  await Promise.all([carregar(), carregarIcones()]);
  assinar(() => { desenharFaixas(); desenharNav(lerRota().nome); });
  desenharFaixas();
  if (!location.hash) history.replaceState(null, '', '#/atlas');
  hashAnterior = location.hash;
  await rotear();
  registrar();
  // Pede ao navegador para não apagar o banco sob pressão de espaço (depois que já há registros pessoais).
  if (estado.trilhas.some((t) => t.origem === 'local')) pedirPersistencia();
}

iniciar();
