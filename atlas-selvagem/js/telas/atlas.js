// Tela principal: índice do atlas com busca, filtros, ordenação e quatro modos (atlas, lista, mapa, estatísticas).

import { estado, assinar, BASE } from '../estado.js';
import { html, montar, icone, $, $$, bruto } from '../ui.js';
import * as F from '../formato.js';
import { resumo, filtrar, ordenar, ORDENS, FILTROS_PADRAO, filtrosAtivos, progresso, degraus } from '../calculos.js';
import { folhaCartao, linhaLista, indicador, cobertura, vazioAcervo } from '../componentes.js';
import { TIPOS, DIFICULDADES } from '../modelo.js';
import { prefs, definir } from '../preferencias.js';

// Filtros sobrevivem à navegação dentro da sessão.
export const filtros = { ...FILTROS_PADRAO };
export const selecao = { id: null };
let painelAberto = false;

const MODOS = [['atlas', 'Atlas'], ['lista', 'Lista'], ['mapa', 'Mapa'], ['estatisticas', 'Estatísticas']];

function cabecalho(R) {
  return html`<section class="indicadores" aria-label="Resumo do acervo">
    ${indicador('Trilhas', String(R.n))}
    ${indicador('Distância total', R.distancia.valor == null ? F.VAZIO : F.num(R.distancia.valor, 1), ' km', cobertura(R.distancia))}
    ${indicador('Desnível acumulado', R.subida.valor == null ? F.VAZIO : `+${F.num(R.subida.valor)}`, ' m', cobertura(R.subida))}
    ${indicador('Regiões', R.regioes.length ? String(R.regioes.length) : F.VAZIO, '', R.semRegiao ? `${R.semRegiao} sem região` : '')}
  </section>`;
}

function opcoes(lista, atual, rotuloTodos, comND) {
  return html`<option value="">${rotuloTodos}</option>${lista.map((v) => html`<option value="${v}" ${v === atual ? bruto('selected') : ''}>${v}</option>`)}${comND ? html`<option value="__nd" ${atual === '__nd' ? bruto('selected') : ''}>não informado</option>` : ''}`;
}

function painelFiltros() {
  const regioesExistentes = [...new Set(estado.trilhas.map((t) => t.regiao).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const n = (k, ph) => html`<input class="entrada" type="number" inputmode="decimal" min="0" step="any" name="${k}" value="${filtros[k] ?? ''}" placeholder="${ph}" aria-label="${ph}">`;
  return html`<form class="painel-filtros" id="painel-filtros" ${painelAberto ? '' : bruto('hidden')}>
    <div class="campo"><label for="f-periodo">Período</label><select id="f-periodo" name="periodo">
      ${[['tudo', 'Todo o acervo'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['ano', 'Este ano']].map(([v, r]) => html`<option value="${v}" ${filtros.periodo === v ? bruto('selected') : ''}>${r}</option>`)}</select></div>
    <div class="campo"><label for="f-regiao">Região</label><select id="f-regiao" name="regiao">${opcoes(regioesExistentes, filtros.regiao, 'Todas', true)}</select></div>
    <div class="campo"><label for="f-tipo">Tipo de percurso</label><select id="f-tipo" name="tipo">${opcoes(TIPOS, filtros.tipo, 'Todos', true)}</select></div>
    <div class="campo"><label for="f-dif">Dificuldade</label><select id="f-dif" name="dificuldade">${opcoes(DIFICULDADES, filtros.dificuldade, 'Todas', true)}</select></div>
    <div class="campo"><span class="rotulo-campo">Distância (km)</span><div class="faixa-num">${n('kmMin', 'mín. km')}${n('kmMax', 'máx. km')}</div></div>
    <div class="campo"><span class="rotulo-campo">Duração (h)</span><div class="faixa-num">${n('durMin', 'mín. h')}${n('durMax', 'máx. h')}</div><span class="ajuda">Usa o tempo total; sem ele, o tempo em movimento.</span></div>
    <div class="campo"><span class="rotulo-campo">Desnível positivo (m)</span><div class="faixa-num">${n('subMin', 'mín. m')}${n('subMax', 'máx. m')}</div></div>
    <div class="campo"><label for="f-pre">Preenchimento</label><select id="f-pre" name="preenchimento">
      ${[['', 'Todos'], ['incompleto', 'Com dados faltando'], ['completo', 'Completos'], ['rascunho', 'Rascunhos']].map(([v, r]) => html`<option value="${v}" ${filtros.preenchimento === v ? bruto('selected') : ''}>${r}</option>`)}</select></div>
    <label class="caixa"><input type="checkbox" name="favoritos" ${filtros.favoritos ? bruto('checked') : ''}> Só favoritas</label>
  </form>`;
}

function metaBloco() {
  const { porId, ultima, best } = progresso(estado.trilhas);
  if (!ultima) return '';
  const meta = porId[ultima.id].meta;
  if (!meta.opcoes.length) return '';
  const encaixe = estado.folhasEmBranco.map((f) => ({ f, d: degraus(f, best) })).filter((x) => x.d.n === 1);
  return html`<section class="meta-bloco" aria-labelledby="meta-tit">
    <h2 id="meta-tit">Próxima meta · depois da ${F.numero(ultima.numero)}</h2>
    ${meta.opcoes.map((o) => html`<div class="meta-op ${o.rec ? 'meta-op--rec' : ''}"><span class="meta-op__marca" aria-hidden="true"></span>
      <span><span class="meta-op__eixo">${o.eixo}${o.rec ? ' · recomendada' : ''}</span><span class="meta-op__alvo">${o.alvoTxt}</span></span>
      <span class="dado sutil" style="font-size:var(--t-xs)">atual ${o.atualTxt}</span></div>`)}
    <p>${meta.porque} Cumprir qualquer uma conta.</p>
    ${meta.semDif ? html`<p>Registre a dificuldade das trilhas para ganhar também um degrau de dificuldade.</p>` : ''}
    ${encaixe.length ? html`<p><strong>Folha em branco que encaixa:</strong> ${encaixe.map((x) => x.f.nome).join(', ')}.</p>` : ''}
  </section>`;
}

function folhasEmBranco() {
  if (!estado.folhasEmBranco.length) return '';
  const { best } = progresso(estado.trilhas);
  return html`<section aria-labelledby="fb-tit"><h2 class="secao-titulo" id="fb-tit">Folhas em branco</h2>
    <div class="folhas-branco">${estado.folhasEmBranco.map((f) => {
      const d = degraus(f, best);
      return html`<article class="folha-branco"><h3>${f.nome}</h3>
        <p class="folha__meta" style="margin:0">${f.local || F.VAZIO}<br>${F.km(f.distanciaKm, 1)} · ${F.subida(f.desnivelPos)} · ${F.metros(f.altitudeMax)}${f.tempoMin ? ` · ${F.duracao(f.tempoMin)}` : ''}</p>
        <p class="sutil" style="font-size:var(--t-xs);margin:0">${f.fonte ? `Fonte: ${f.fonte}. ` : ''}${d.texto}.</p>
        ${f.nota ? html`<p style="font-size:var(--t-xs);margin:0">${f.nota}</p>` : ''}
        <div class="botoes" style="margin-top:6px"><a class="botao" href="#/saida?trilha=${encodeURIComponent(f.nome)}">${icone('saida')} Folha de saída</a><a class="botao" href="#/nova?gpx=1&folha=${encodeURIComponent(f.id)}">${icone('importar')} Registrar com GPX</a></div>
      </article>`;
    })}</div>
    <p style="margin-top:var(--e3)"><a class="botao botao--texto" href="#/arquivo?secao=folha-em-branco">Criar folha em branco</a></p></section>`;
}

export async function render({ main, rota }) {
  const modo = rota.modo || 'atlas';
  const p = prefs();
  let ordem = p.ordem, dir = p.dir;
  let limparVista = null;

  const desenhar = async () => {
    limparVista?.(); limparVista = null;
    const todas = estado.trilhas;
    const F1 = ordenar(filtrar(todas, filtros, estado.anotacoes), ordem, dir);
    const nAtivos = filtrosAtivos(filtros);
    const R = resumo(F1);
    const titulo = { atlas: 'Índice de folhas', lista: 'Lista de trilhas', mapa: 'Mapa de exploração', estatisticas: 'Estatísticas' }[modo];
    montar(main, html`
      <h1 class="so-leitor">${titulo}</h1>
      <div class="atlas-topo">
        ${cabecalho(R)}
        ${nAtivos || filtros.q ? html`<p class="sutil" style="font-size:var(--t-xs);margin:0">Indicadores calculados sobre as ${F1.length} trilhas exibidas (de ${todas.length}).</p>` : ''}
        <div class="busca">${icone('busca')}<input type="search" id="busca" value="${filtros.q}" placeholder="Buscar por nome, localidade, região ou nº…" aria-label="Buscar trilhas" autocomplete="off"></div>
        <nav class="segmentado" aria-label="Modo de visualização">${MODOS.map(([m, r]) => html`<a href="#/${m}" ${m === modo ? bruto('aria-current="page"') : ''}>${r}</a>`)}</nav>
        <div class="ferramentas">
          <button class="botao ${nAtivos ? 'botao--filtrando' : ''}" type="button" id="abrir-filtros" aria-expanded="${painelAberto}" aria-controls="painel-filtros">${icone('filtro')} Filtros ${nAtivos ? html`<span class="contador-filtros" aria-label="${nAtivos} ativos">${nAtivos}</span>` : ''}</button>
          ${nAtivos || filtros.q ? html`<button class="botao botao--texto" type="button" id="limpar-filtros">Limpar filtros</button>` : ''}
          ${modo === 'atlas' || modo === 'lista' ? html`<div class="ordenar"><label class="so-leitor" for="ordem">Ordenar por</label>
            <select id="ordem">${Object.entries(ORDENS).map(([k, o]) => html`<option value="${k}" ${k === ordem ? bruto('selected') : ''}>${o.rotulo}</option>`)}</select>
            <button class="botao-icone" type="button" id="dir" aria-label="${dir === 'desc' ? 'Ordem decrescente — inverter' : 'Ordem crescente — inverter'}" title="${dir === 'desc' ? 'Decrescente' : 'Crescente'}">${icone(dir === 'desc' ? 'setaBaixo' : 'setaCima')}</button></div>` : ''}
          <span class="resultado" aria-live="polite">${F1.length} de ${todas.length} ${todas.length === 1 ? 'trilha' : 'trilhas'}</span>
        </div>
        ${painelFiltros()}
      </div>
      <div id="vista"></div>`);
    ligar();
    const vista = $('#vista');
    if (!todas.length) { montar(vista, vazioAcervo()); return; }
    if (modo === 'mapa') { limparVista = (await import('./exploracao.js')).render(vista, F1); return; }
    if (modo === 'estatisticas') { limparVista = (await import('./estatisticas.js')).render(vista, F1, todas); return; }
    if (!F1.length) {
      montar(vista, html`<div class="vazio"><h2>Nenhuma trilha com estes critérios</h2><p class="sutil">Ajuste a busca ou limpe os filtros para ver o acervo completo.</p><button class="botao" type="button" data-limpar>Limpar filtros</button></div>`);
      vista.querySelector('[data-limpar]').addEventListener('click', limpar);
      return;
    }
    const corpo = modo === 'lista'
      ? html`<div class="lista"><div class="lista__cab rotulo" aria-hidden="true"><span></span><span>Trilha</span><span>Distância</span><span>Subida</span><span>Duração</span><span>Alt. máx.</span><span></span></div>${F1.map((t) => linhaLista(t, { anot: estado.anotacoes[t.id] }))}</div>`
      : html`<div class="grade-folhas">${F1.map((t) => folhaCartao(t, { anot: estado.anotacoes[t.id], nFotos: estado.fotosPorTrilha[t.id] || 0, sel: t.id === selecao.id }))}</div>`;
    montar(vista, html`<div class="layout-atlas layout-atlas--lateral"><section aria-label="${titulo}"><h2 class="secao-titulo">${titulo}</h2>${corpo}
      ${BASE.length && !todas.some((t) => t.origem === 'local') ? html`<p class="nota-dado" style="margin-top:var(--e4)">As folhas acima vêm do arquivo base do projeto (registradas a partir de prints). Novas expedições criadas aqui ficam neste aparelho — faça backups em Arquivo.</p>` : ''}</section>
      <aside>${metaBloco()}${folhasEmBranco()}</aside></div>`);
    $$('.folha, .linha-trilha', vista).forEach((a) => a.addEventListener('click', () => { selecao.id = a.dataset.id; }));
  };

  const limpar = () => { Object.assign(filtros, FILTROS_PADRAO); desenhar(); };

  function ligar() {
    const busca = $('#busca');
    let espera;
    busca.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        filtros.q = busca.value;
        const pos = busca.selectionStart;
        desenhar().then(() => { const b = $('#busca'); b.focus(); b.setSelectionRange(pos, pos); });
      }, 220);
    });
    $('#abrir-filtros').addEventListener('click', () => { painelAberto = !painelAberto; desenhar().then(() => $('#abrir-filtros').focus()); });
    $('#limpar-filtros')?.addEventListener('click', limpar);
    $('#ordem')?.addEventListener('change', (e) => { ordem = e.target.value; definir('ordem', ordem); desenhar().then(() => $('#ordem').focus()); });
    $('#dir')?.addEventListener('click', () => { dir = dir === 'desc' ? 'asc' : 'desc'; definir('dir', dir); desenhar().then(() => $('#dir').focus()); });
    $('#painel-filtros').addEventListener('change', (e) => {
      const el = e.target;
      if (el.type === 'checkbox') filtros[el.name] = el.checked;
      else if (el.type === 'number') { const v = parseFloat(el.value); filtros[el.name] = Number.isFinite(v) ? v : null; }
      else filtros[el.name] = el.value;
      const nome = el.name;
      desenhar().then(() => $(`#painel-filtros [name="${nome}"]`)?.focus());
    });
  }

  await desenhar();
  const sair = assinar(() => { if (!document.activeElement?.closest('#painel-filtros, #busca')) desenhar(); });
  return () => { sair(); limparVista?.(); };
}
