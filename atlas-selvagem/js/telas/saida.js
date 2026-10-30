// Folha de saída: roteiro de segurança para avisar alguém antes da trilha, e checklist de equipamento.
// Rascunho e checklist ficam salvos no aparelho (funciona sem sinal).

import { html, montar, icone, $, $$, bruto, avisar, copiarTexto } from '../ui.js';
import * as F from '../formato.js';
import { CHECKLIST } from '../../dados/checklist.js';
import { lerMeta, gravarMeta } from '../armazenamento.js';

const somarHoras = (hhmm, h) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return null;
  const [a, b] = hhmm.split(':').map(Number);
  const t = a * 60 + b + h * 60;
  const dia = Math.floor(t / 1440);
  return `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}${dia ? ' (dia seguinte)' : ''}`;
};

export function mensagem(d) {
  const v = (x, ph) => (x && String(x).trim()) || ph;
  const prazo = somarHoras(d.volta, Number(d.prazo || 2));
  return `${v(d.para, '[nome]')}, vou fazer a trilha ${v(d.trilha, '[trilha]')}, saindo de ${v(d.partida, '[ponto de partida]')}, em ${d.data ? F.data(d.data) : '[data]'}, às ${v(d.saida, '[hora]')}. `
    + `${d.companhia === 'acompanhado' ? `Vou acompanhado${d.quem ? ` (${d.quem.trim()})` : ''}.` : 'Vou sozinho.'} Volta prevista: ${v(d.volta, '[hora]')}. `
    + `Se eu não der notícia até ${prazo || '[volta + prazo]'}, tente me ligar; sem resposta, acione os bombeiros (193) e passe este roteiro.`;
}

export async function render({ main, rota }) {
  const d = { trilha: '', partida: '', data: F.hojeISO(), saida: '', volta: '', para: '', companhia: 'sozinho', quem: '', prazo: '2', ...(await lerMeta('rascunhoSaida', {})) };
  if (rota.query.get('trilha')) d.trilha = rota.query.get('trilha');
  const marcados = new Set(await lerMeta('checklist', []));
  const total = CHECKLIST.reduce((s, g) => s + g.itens.length, 0);
  let espera;

  const campo = (k, rotulo, tipo = 'text', extra = '') => html`<div class="campo"><label for="s-${k}">${rotulo}</label><input id="s-${k}" name="${k}" type="${tipo}" value="${d[k]}" ${bruto(extra)}></div>`;

  function desenhar() {
    montar(main, html`<h1 class="titulo-pagina">Folha de saída</h1>
    <p class="sutil" style="max-width:68ch">Antes de sair, deixe com alguém o roteiro e a hora de volta. Os campos ficam salvos neste aparelho, mesmo sem sinal.</p>
    <div class="trilha-grade">
      <form id="form-saida" class="grade-campos">
        ${campo('trilha', 'Trilha')}${campo('partida', 'Ponto de partida')}
        ${campo('data', 'Data', 'date')}${campo('para', 'Para quem (nome)')}
        ${campo('saida', 'Saída', 'time')}${campo('volta', 'Volta prevista', 'time')}
        <div class="campo"><label for="s-companhia">Companhia</label><select id="s-companhia" name="companhia"><option value="sozinho" ${d.companhia === 'sozinho' ? bruto('selected') : ''}>Sozinho</option><option value="acompanhado" ${d.companhia === 'acompanhado' ? bruto('selected') : ''}>Acompanhado</option></select></div>
        <div class="campo"><label for="s-prazo">Acionar ajuda após a volta</label><select id="s-prazo" name="prazo">${['1', '2', '3'].map((h) => html`<option value="${h}" ${d.prazo === h ? bruto('selected') : ''}>${h} h depois</option>`)}</select></div>
        ${d.companhia === 'acompanhado' ? html`<div class="campo largo"><label for="s-quem">Com quem</label><input id="s-quem" name="quem" value="${d.quem}"></div>` : ''}
      </form>
      <div><h2 class="rotulo" style="margin-bottom:var(--e2)">Mensagem</h2>
        <p class="mensagem" id="mensagem" aria-live="polite">${mensagem(d)}</p>
        <div class="botoes" style="margin-top:var(--e3)"><button class="botao botao--primario" type="button" id="copiar">${icone('copiar')} Copiar</button><a class="botao" id="whats" href="https://wa.me/?text=${encodeURIComponent(mensagem(d))}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a></div>
        <p class="nota-dado">O WhatsApp precisa de conexão. Sem sinal, copie e envie por SMS.</p></div>
    </div>
    <h2 class="secao-titulo"><span class="controle">✓</span> Checklist · <span id="contagem">${marcados.size} de ${total}</span></h2>
    <div class="checklist grade-campos" id="checklist">${CHECKLIST.map((g) => html`<fieldset><legend>${g.grupo}</legend>${g.itens.map((i) => html`<label class="caixa"><input type="checkbox" value="${i.id}" ${marcados.has(i.id) ? bruto('checked') : ''}> <span>${i.t}${i.sub ? html` <small>· ${i.sub}</small>` : ''}</span></label>`)}</fieldset>`)}</div>
    <div class="botoes"><button class="botao botao--texto" type="button" id="zerar">Desmarcar tudo</button></div>`);
    ligar();
  }

  function atualizarMensagem() {
    const m = mensagem(d);
    $('#mensagem').textContent = m;
    $('#whats').href = `https://wa.me/?text=${encodeURIComponent(m)}`;
  }

  function ligar() {
    $('#form-saida').addEventListener('input', (e) => {
      d[e.target.name] = e.target.value;
      if (e.target.name === 'companhia') { gravarMeta('rascunhoSaida', d); desenhar(); $('#s-companhia').focus(); return; }
      atualizarMensagem();
      clearTimeout(espera);
      espera = setTimeout(() => gravarMeta('rascunhoSaida', d).catch(() => {}), 400);
    });
    $('#copiar').addEventListener('click', async () => { const ok = await copiarTexto(mensagem(d)); avisar(ok ? 'Mensagem copiada.' : 'Não foi possível copiar.', ok ? 'info' : 'erro'); });
    $('#checklist').addEventListener('change', (e) => {
      if (e.target.checked) marcados.add(e.target.value); else marcados.delete(e.target.value);
      $('#contagem').textContent = `${marcados.size} de ${total}`;
      gravarMeta('checklist', [...marcados]).catch((err) => avisar(err.message, 'erro'));
    });
    $('#zerar').addEventListener('click', () => { marcados.clear(); gravarMeta('checklist', []); $$('#checklist input').forEach((i) => { i.checked = false; }); $('#contagem').textContent = `0 de ${total}`; });
  }

  desenhar();
  return () => { clearTimeout(espera); gravarMeta('rascunhoSaida', d).catch(() => {}); };
}
