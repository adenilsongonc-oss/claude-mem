// Componentes visuais reutilizados entre telas.

import { html, bruto, icone } from './ui.js';
import { folhaSVG, semMapaSVG } from './desenho.js';
import * as F from './formato.js';
import { pendencias, STATUS } from './modelo.js';

export function selo(t) {
  return t.status === 'rascunho'
    ? html`<span class="selo selo--rascunho">${STATUS.rascunho}</span>`
    : html`<span class="selo selo--concluido">${STATUS.concluido}</span>`;
}

export function camadaPessoal(anot, nFotos) {
  const partes = [];
  const np = anot?.pois?.length || 0;
  if (np) partes.push(`${np} ${np === 1 ? 'ponto' : 'pontos'}`);
  if (nFotos) partes.push(`${nFotos} ${nFotos === 1 ? 'foto' : 'fotos'}`);
  if (anot?.diario?.relato || anot?.diario?.entradas?.length) partes.push('diário');
  return partes.join(' · ');
}

export function miniatura(t, titulo) {
  const svg = folhaSVG(t, { titulo });
  return bruto(svg || `<div class="sem-mapa" style="aspect-ratio:auto;height:100%;padding:0">${semMapaSVG('Sem traçado registrado')}</div>`);
}

// Folha cartográfica do índice.
export function folhaCartao(t, { anot, nFotos = 0, sel = false } = {}) {
  const falta = pendencias(t).length;
  const pessoal = camadaPessoal(anot, nFotos);
  return html`<a class="folha ${sel ? 'folha--sel' : ''}" href="#/trilha/${encodeURIComponent(t.id)}" data-id="${t.id}">
    <div class="folha__topo"><span>${F.numero(t.numero)}</span>${anot?.favorito ? html`<span title="Favorita" aria-label="Favorita" style="width:14px;height:14px;display:inline-block">${icone('estrela')}</span>` : ''}</div>
    <div class="folha__mapa">${miniatura(t, `Esboço do percurso de ${t.nome}${t.fontePerfil === 'print' ? ' (desenhado a partir de print, não é GPS)' : ''}`)}</div>
    <div class="folha__corpo">
      <h3 class="folha__nome">${t.nome}</h3>
      <p class="folha__meta" style="margin:0">${F.data(t.data)}<br>${t.local || F.VAZIO}<br>${F.km(t.distanciaKm)} · ${F.subida(t.desnivelPos)} · ${F.duracao(t.tempoTotalMin ?? t.tempoMovMin)}<br>${t.tipo || 'tipo —'}</p>
      ${pessoal ? html`<p class="folha__meta" style="margin:0">${pessoal}</p>` : ''}
      <div class="folha__rodape">${selo(t)}${falta ? html`<span class="selo selo--falta">faltam ${falta}</span>` : ''}</div>
    </div>
  </a>`;
}

export function linhaLista(t, { anot } = {}) {
  const falta = pendencias(t).length;
  return html`<a class="linha-trilha" href="#/trilha/${encodeURIComponent(t.id)}" data-id="${t.id}">
    <span class="linha-trilha__mini">${miniatura(t, `Esboço de ${t.nome}`)}</span>
    <span><span class="linha-trilha__nome">${t.nome}${anot?.favorito ? ' ★' : ''}</span><br>
      <span class="linha-trilha__meta">${F.numero(t.numero)} · ${F.data(t.data)} · ${t.local || F.VAZIO}${t.regiao ? ` · ${t.regiao}` : ''}</span><br>
      <span class="linha-trilha__meta">${F.km(t.distanciaKm)} · ${F.subida(t.desnivelPos)} · ${F.duracao(t.tempoTotalMin ?? t.tempoMovMin)} · ${t.tipo || 'tipo —'}</span></span>
    <span class="linha-trilha__nums"><span>${F.km(t.distanciaKm)}</span><span>${F.subida(t.desnivelPos)}</span><span>${F.duracao(t.tempoTotalMin ?? t.tempoMovMin)}</span><span>${F.metros(t.altitudeMax)}</span></span>
    <span>${selo(t)}${falta ? html`<br><span class="linha-trilha__meta">faltam ${falta}</span>` : ''}</span>
  </a>`;
}

// Valor com nota de cobertura ("3 de 5 com dado"). Ausente aparece como "—".
export function indicador(rotulo, valor, unidade, nota) {
  return html`<div class="indicador"><span class="rotulo">${rotulo}</span>
    <span class="indicador__valor">${valor}${valor !== F.VAZIO && unidade ? html`<small>${unidade}</small>` : ''}</span>
    ${nota ? html`<span class="indicador__nota">${nota}</span>` : ''}</div>`;
}

export const cobertura = (s) => (s.total && s.com < s.total ? `${s.com} de ${s.total} com dado` : '');

export function vazioAcervo() {
  return html`<div class="vazio">${bruto(semMapaSVG('Atlas vazio'))}<h2>O atlas ainda está em branco</h2>
    <p class="sutil">Registre a primeira expedição manualmente ou importe um arquivo GPX gravado no relógio, GPS ou aplicativo.</p>
    <div class="botoes"><a class="botao botao--primario" href="#/nova">${icone('mais')} Nova expedição</a><a class="botao" href="#/nova?gpx=1">${icone('importar')} Importar GPX</a></div></div>`;
}

export function marcaFonte(f) {
  if (!f) return '';
  const r = { manual: 'manual', gpx: 'GPX', print: 'print', calculado: 'calc.' }[f] || f;
  return html`<span class="marca-fonte-dado" data-f="${f}" title="Origem do dado: ${r}">${r}</span>`;
}
