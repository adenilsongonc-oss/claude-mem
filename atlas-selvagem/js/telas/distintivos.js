// Distintivos: marcos e desafios calculados a partir das trilhas registradas.

import { estado } from '../estado.js';
import { html, montar, $$, bruto } from '../ui.js';
import { distintivos } from '../calculos.js';
import { distintivoSVG } from '../desenho.js';

export async function render({ main, rota }) {
  const D = distintivos(estado.trilhas);
  let sel = Number(rota.query.get('d')) || (D.find((d) => d.ganho)?.cod ?? D[0].cod);

  function desenhar() {
    const d = D.find((x) => x.cod === sel);
    const grupo = (g, titulo) => html`<h2 class="secao-titulo">${titulo} · ${D.filter((x) => x.g === g && x.ganho).length} de ${D.filter((x) => x.g === g).length}</h2>
      <div class="grade-distintivos" role="group" aria-label="${titulo}">${D.filter((x) => x.g === g).map((x) => html`<button type="button" class="distintivo ${x.ganho ? 'distintivo--ganho' : ''}" data-cod="${x.cod}" aria-pressed="${x.cod === sel}" aria-label="${x.nome}: ${x.ganho ? 'conquistado' : 'em aberto'}">
        <span class="dado" style="font-size:var(--t-xs);align-self:start;justify-self:start">${x.cod}</span>${bruto(distintivoSVG(x.cod, x.ganho))}<span class="nome">${x.nome}</span></button>`)}</div>`;
    montar(main, html`<h1 class="titulo-pagina">Distintivos</h1>
      <p class="sutil" style="max-width:68ch">Calculados a partir das trilhas registradas. A conquista fica com a primeira trilha, em ordem de data, que atinge a regra. Sem dado, o distintivo mostra "sem dado ainda" — nunca zero.</p>
      <section class="meta-bloco" aria-live="polite" style="margin:var(--e4) 0">
        <h2>${d.cod} · ${d.nome}</h2>
        <p style="color:var(--texto);font-size:var(--t-m)">${d.regra}</p>
        <p><strong class="${d.ganho ? 'positivo' : ''}">${d.situacao}</strong>${d.ganho && d.trilhaId ? html` · <a href="#/trilha/${encodeURIComponent(d.trilhaId)}">abrir a folha</a>` : ''}</p>
        <div class="progresso-linha" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(d.pct)}" aria-label="Progresso"><span style="width:${d.pct}%"></span></div>
        <p class="dado">${d.atualTxt} / ${d.alvoTxt}</p>
      </section>
      ${grupo('marco', 'Marcos')}${grupo('desafio', 'Desafios')}`);
    $$('[data-cod]').forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.cod); desenhar(); main.querySelector(`[data-cod="${sel}"]`).focus(); }));
  }
  desenhar();
  return null;
}
