// Mapa de exploração: percursos reais (GPX) e pontos de partida informados, sobre cartografia real (Leaflet).
// Trilhas sem geometria geográfica são listadas à parte — nunca posicionadas por aproximação.

import { html, montar, icone, $, $$, esc } from '../ui.js';
import * as F from '../formato.js';
import { obterTrajeto } from '../estado.js';
import { criarMapa, desenharPercurso, marcarLocal } from '../mapa.js';
import { regioes } from '../calculos.js';

export function render(vista, lista) {
  let destruir = null;
  let vivo = true;
  const camadas = new Map();
  const comTrajeto = lista.filter((t) => t.temTrajeto);
  const soPonto = lista.filter((t) => !t.temTrajeto && Array.isArray(t.coordInicio));
  const semGeo = lista.filter((t) => !t.temTrajeto && !Array.isArray(t.coordInicio));
  const R = regioes(lista);

  montar(vista, html`<h2 class="secao-titulo">Mapa de exploração</h2>
  <div class="mapa-explorar">
    <div>
      <div class="quadro"><div class="mapa-real" id="mapa-explorar" role="region" aria-label="Mapa com os percursos registrados"></div>
        <div class="mapa-aviso" id="mapa-aviso" ${navigator.onLine ? 'hidden' : ''}>Sem conexão: o mapa de fundo não carrega. Os percursos e a lista ao lado continuam disponíveis.</div>
        <div class="quadro__legenda"><span>${comTrajeto.length} ${comTrajeto.length === 1 ? 'percurso GPX' : 'percursos GPX'} · ${soPonto.length} só com ponto de partida</span>
          <span><span class="marcador-ponto marcador-ponto--inicio" style="display:inline-block;vertical-align:-2px"></span> início <span class="marcador-ponto marcador-ponto--fim" style="display:inline-block;vertical-align:-2px;margin-left:8px"></span> fim <span class="marcador-ponto marcador-ponto--local" style="display:inline-block;vertical-align:-2px;margin-left:8px"></span> partida informada</span></div>
      </div>
      <div class="botoes" style="margin-top:var(--e3)"><button class="botao" type="button" id="enquadrar">${icone('enquadrar')} Enquadrar percursos</button></div>
      ${R.length ? html`<p class="sutil" style="font-size:var(--t-s);margin-top:var(--e3)">Regiões exploradas nesta seleção: ${R.map((r) => `${r.nome} (${r.n})`).join(' · ')}. Use o filtro de região para recortar o mapa.</p>` : ''}
    </div>
    <aside>
      <h3 class="rotulo" style="margin-bottom:var(--e2)">Trilhas no mapa</h3>
      <div class="mapa-lista">${[...comTrajeto, ...soPonto].map((t) => html`<button type="button" data-id="${t.id}" aria-pressed="false"><span class="editorial" style="font-size:1.0625rem">${t.nome}</span><span class="dado sutil" style="font-size:var(--t-xs)">${F.numero(t.numero)} · ${F.data(t.data)} · ${t.temTrajeto ? F.km(t.distanciaKm) : 'só ponto de partida'}</span></button>`)}
        ${!comTrajeto.length && !soPonto.length ? html`<p class="sutil" style="padding:var(--e3) 0;font-size:var(--t-s)">Nenhuma trilha desta seleção tem geometria geográfica. Importe um GPX ou informe as coordenadas de partida na edição.</p>` : ''}</div>
      ${semGeo.length ? html`<h3 class="rotulo" style="margin:var(--e4) 0 var(--e2)">Sem geometria geográfica (${semGeo.length})</h3>
        <ul class="lista-pois" style="grid-template-columns:1fr">${semGeo.map((t) => html`<li style="grid-template-columns:1fr auto"><a href="#/trilha/${encodeURIComponent(t.id)}" class="editorial">${t.nome}</a><span class="sutil dado" style="font-size:var(--t-xs)">${t.pontos ? 'só esboço' : 'sem traçado'}</span></li>`)}</ul>
        <p class="nota-dado">Esboços desenhados a partir de prints não têm coordenadas e por isso não são posicionados no mapa.</p>` : ''}
    </aside>
  </div>`);

  (async () => {
    const el = $('#mapa-explorar', vista);
    let m;
    try {
      m = await criarMapa(el, { aoFalharTiles: () => { const a = $('#mapa-aviso', vista); if (a) { a.hidden = false; a.textContent = 'Não foi possível carregar o mapa de fundo (sem conexão ou serviço indisponível). Os percursos continuam desenhados.'; } } });
    } catch (e) {
      montar(el, html`<div class="sem-mapa"><p>O componente de mapa não pôde ser carregado: ${e.message}</p></div>`);
      return;
    }
    if (!vivo) { m.destruir(); return; }
    destruir = m.destruir;
    const { mapa, L } = m;
    const limites = L.latLngBounds([]);
    const abrir = (t) => () => {
      selecionar(t.id);
      L.popup().setLatLng(camadas.get(t.id).centro).setContent(`<span class="editorial">${esc(t.nome)}</span>${esc(F.data(t.data))} · ${esc(F.km(t.distanciaKm))}<br><a href="#/trilha/${encodeURIComponent(t.id)}">Abrir detalhes</a>`).openOn(mapa);
    };
    for (const t of comTrajeto) {
      const tr = await obterTrajeto(t.id);
      if (!tr?.pontos?.length || !vivo) continue;
      const g = desenharPercurso(L, mapa, tr.pontos, { nome: t.nome, ativo: false, aoClicar: abrir(t) });
      const b = g.getBounds();
      limites.extend(b);
      camadas.set(t.id, { g, limites: b, centro: b.getCenter() });
    }
    for (const t of soPonto) {
      const ll = L.latLng(t.coordInicio[0], t.coordInicio[1]);
      const mk = marcarLocal(L, mapa, t.coordInicio, t.nome, abrir(t));
      limites.extend(ll);
      camadas.set(t.id, { g: mk, limites: L.latLngBounds([ll, ll]), centro: ll });
    }
    const enquadrar = () => {
      if (limites.isValid()) mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 14 });
      else mapa.setView([-15.8, -47.9], 4); // visão do Brasil quando não há geometria
    };
    enquadrar();
    $('#enquadrar', vista).addEventListener('click', enquadrar);
    function selecionar(id) {
      $$('.mapa-lista button', vista).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    }
    $$('.mapa-lista button', vista).forEach((b) => b.addEventListener('click', () => {
      const c = camadas.get(b.dataset.id);
      if (!c) return;
      selecionar(b.dataset.id);
      mapa.fitBounds(c.limites, { padding: [32, 32], maxZoom: 15 });
      const t = lista.find((x) => x.id === b.dataset.id);
      abrir(t)();
    }));
  })();

  return () => { vivo = false; destruir?.(); };
}
