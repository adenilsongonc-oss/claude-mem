// Estatísticas do acervo (ou da seleção filtrada). Regras em README.md ("Regras de cálculo").

import { html, montar, bruto, $ } from '../ui.js';
import * as F from '../formato.js';
import { resumo, porMes, distribuicao, compararPeriodos, regioes } from '../calculos.js';
import { barrasMensaisSVG } from '../desenho.js';

const ISO = F.hojeISO;

function recorde(rotulo, r, fmt) {
  return html`<div><dt>${rotulo}</dt><dd>${r.valor == null ? F.VAZIO : fmt(r.valor)}${r.trilha ? html`<a href="#/trilha/${encodeURIComponent(r.trilha.id)}">${r.trilha.nome}</a>` : ''}</dd></div>`;
}

function barras(itens, total) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  return html`<div class="barras-h">${itens.map((i) => html`<div class="barra"><span>${i.nome}</span>
    <span class="trilho" role="img" aria-label="${i.nome}: ${i.n} de ${total}"><span class="enchimento ${i.ausente ? 'enchimento--nd' : ''}" style="width:${(i.n / max) * 100}%"></span></span>
    <span class="dado" style="text-align:right">${i.n}</span></div>`)}</div>`;
}

function linhaComp(rotulo, a, b, fmt) {
  const dif = a == null || b == null ? null : b - a;
  return html`<tr><td>${rotulo}</td><td>${a == null ? F.VAZIO : fmt(a)}</td><td>${b == null ? F.VAZIO : fmt(b)}</td><td>${dif == null ? F.VAZIO : `${dif >= 0 ? '+' : '−'}${fmt(Math.abs(dif))}`}</td></tr>`;
}

export function render(vista, lista, todas) {
  let campoMes = 'km';
  const desenhar = () => {
    const R = resumo(lista);
    const meses = porMes(lista, 12);
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const d = (n) => ISO(new Date(hoje.getTime() - n * 86400000));
    const C = compararPeriodos(lista, [d(89), ISO(hoje)], [d(179), d(90)]);
    const CA = compararPeriodos(lista, [`${ano - 1}-01-01`, `${ano - 1}-12-31`], [`${ano}-01-01`, `${ano}-12-31`]);
    const ativos = new Set(lista.map((t) => (t.data || '').slice(0, 7))).size;
    const tempoNota = R.tempoTotal.com < R.n ? ` · ${R.tempoTotal.com} de ${R.n} trilhas têm tempo total` : '';
    montar(vista, html`<h2 class="secao-titulo">Estatísticas${lista.length !== todas.length ? ` · ${lista.length} de ${todas.length} trilhas` : ''}</h2>
    <div class="estat-grade">
      <section class="estat-bloco largo"><h3>Totais e recordes</h3>
        <dl class="recordes">
          <div><dt>Trilhas</dt><dd>${R.n}</dd></div>
          <div><dt>Distância total</dt><dd>${R.distancia.valor == null ? F.VAZIO : F.km(R.distancia.valor, 1)}</dd></div>
          <div><dt>Desnível positivo acumulado</dt><dd>${R.subida.valor == null ? F.VAZIO : F.subida(R.subida.valor)}</dd></div>
          <div><dt>Tempo total registrado</dt><dd>${F.duracao(R.tempoTotal.valor)}</dd></div>
          <div><dt>Tempo em movimento</dt><dd>${F.duracao(R.tempoMov.valor)}</dd></div>
          ${recorde('Maior distância', R.maiorDistancia, (v) => F.km(v))}
          ${recorde('Maior desnível positivo', R.maiorSubida, F.subida)}
          ${recorde('Maior altitude registrada', R.maiorAltitude, F.metros)}
          <div><dt>Frequência</dt><dd>${R.n ? `${F.num(R.n / Math.max(1, ativos), 1)}` : F.VAZIO}<span class="sutil" style="font:400 var(--t-xs) var(--f-ui);display:block">trilhas por mês ativo (${ativos} ${ativos === 1 ? 'mês' : 'meses'})</span></dd></div>
        </dl>
        <p class="nota-dado">Somas usam só as trilhas que têm o dado; valor ausente não conta como zero. Cobertura: distância ${R.distancia.com}/${R.n}, desnível ${R.subida.com}/${R.n}${tempoNota}. Desnível positivo e negativo são somados separadamente e nunca combinados.</p>
      </section>
      <section class="estat-bloco largo graf"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--e3);flex-wrap:wrap"><h3>Evolução mensal · últimos 12 meses</h3>
        <div class="segmentado" style="width:auto" role="group" aria-label="Medida"><button type="button" data-campo="km" aria-pressed="${campoMes === 'km'}">Distância</button><button type="button" data-campo="n" aria-pressed="${campoMes === 'n'}">Trilhas</button></div></div>
        ${bruto(barrasMensaisSVG(meses, campoMes))}
        ${campoMes === 'km' && meses.some((m) => m.n && m.km.com < m.n) ? html`<p class="nota-dado">Alguns meses têm trilhas sem distância registrada; as barras mostram só o que foi informado.</p>` : ''}
      </section>
      <section class="estat-bloco"><h3>Distribuição por região</h3>
        ${R.n ? barras([...regioes(lista).map((r) => ({ nome: r.nome, n: r.n })), ...(R.semRegiao ? [{ nome: 'não informada', n: R.semRegiao, ausente: true }] : [])], R.n) : html`<p class="sutil">Sem trilhas.</p>`}
      </section>
      <section class="estat-bloco"><h3>Distribuição por tipo de percurso</h3>
        ${R.n ? barras(distribuicao(lista, 'tipo'), R.n) : html`<p class="sutil">Sem trilhas.</p>`}
        <h3 style="margin-top:var(--e4)">Por dificuldade</h3>
        ${R.n ? barras(distribuicao(lista, 'dificuldade', 'não informada'), R.n) : ''}
      </section>
      <section class="estat-bloco largo"><h3>Comparação entre períodos</h3>
        <div style="overflow-x:auto"><table class="comparacao"><caption class="so-leitor">Últimos 90 dias comparados aos 90 dias anteriores</caption>
          <thead><tr><th>Medida</th><th>90 dias anteriores</th><th>Últimos 90 dias</th><th>Diferença</th></tr></thead>
          <tbody>${linhaComp('Trilhas', C.b.n, C.a.n, (v) => F.num(v))}${linhaComp('Distância', C.b.distancia.valor, C.a.distancia.valor, (v) => F.km(v, 1))}${linhaComp('Desnível positivo', C.b.subida.valor, C.a.subida.valor, F.metros)}${linhaComp('Tempo em movimento', C.b.tempoMov.valor, C.a.tempoMov.valor, F.duracao)}</tbody></table></div>
        <div style="overflow-x:auto;margin-top:var(--e4)"><table class="comparacao"><caption class="so-leitor">Ano anterior comparado a este ano</caption>
          <thead><tr><th>Medida</th><th>${ano - 1}</th><th>${ano}</th><th>Diferença</th></tr></thead>
          <tbody>${linhaComp('Trilhas', CA.a.n, CA.b.n, (v) => F.num(v))}${linhaComp('Distância', CA.a.distancia.valor, CA.b.distancia.valor, (v) => F.km(v, 1))}${linhaComp('Desnível positivo', CA.a.subida.valor, CA.b.subida.valor, F.metros)}${linhaComp('Tempo em movimento', CA.a.tempoMov.valor, CA.b.tempoMov.valor, F.duracao)}</tbody></table></div>
        <p class="nota-dado">"—" indica que nenhuma trilha do período tem aquele dado. A diferença só é calculada quando os dois períodos têm valor.</p>
      </section>
    </div>
    <p style="margin-top:var(--e5)"><a class="botao" href="#/distintivos">Ver distintivos e marcos</a></p>`);
    vista.querySelectorAll('[data-campo]').forEach((b) => b.addEventListener('click', () => { campoMes = b.dataset.campo; desenhar(); }));
  };
  desenhar();
  return null;
}

