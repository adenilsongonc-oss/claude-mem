// Folha de saída: roteiro de segurança para avisar alguém antes da trilha, e checklist de equipamento.
// Rascunho e checklist ficam salvos no aparelho (funciona sem sinal).

import { html, montar, icone, $, $$, bruto, avisar, copiarTexto } from '../ui.js';
import * as F from '../formato.js';
import { CHECKLIST } from '../../dados/checklist.js';
import { lerMeta, gravarMeta } from '../armazenamento.js';
import { lerGPX, haversine, ErroGPX } from '../gpx.js';
import { lerArquivoTexto } from '../ui.js';

const somarHoras = (hhmm, h) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return null;
  const [a, b] = hhmm.split(':').map(Number);
  const t = a * 60 + b + h * 60;
  const dia = Math.floor(t / 1440);
  return `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}${dia ? ' (dia seguinte)' : ''}`;
};

// Soma minutos a "HH:MM" e arredonda para cima em 15 min. Retorna "HH:MM" (mesmo dia ou não).
export function voltaEstimada(saida, minutos) {
  if (!/^\d{2}:\d{2}$/.test(saida || '') || !(minutos > 0)) return null;
  const [h, m] = saida.split(':').map(Number);
  const t = Math.ceil((h * 60 + m + minutos) / 15) * 15;
  return `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Dados úteis para resgate, tirados do GPX da trilha planejada.
export function resumoGPX(L, nomeArquivo) {
  const ini = { lat: L.coordInicio[0], lon: L.coordInicio[1] };
  const perto = (L.waypoints || []).map((w) => ({ ...w, d: haversine(ini, w) })).filter((w) => w.nome && w.d <= 300).sort((a, b) => a.d - b.d)[0];
  return {
    arquivo: nomeArquivo, nome: (L.nomeGPX || '').trim() || null, partida: perto ? perto.nome.trim() : null,
    km: L.distanciaKm, sub: L.desnivelPos, altMax: L.altitudeMax, tempoMin: L.tempoTotalMin, tipo: L.tipo,
    lat: ini.lat, lon: ini.lon,
  };
}

export function mensagem(d) {
  const v = (x, ph) => (x && String(x).trim()) || ph;
  const prazo = somarHoras(d.volta, Number(d.prazo || 2));
  const g = d.gpx;
  const percurso = g ? ` Percurso: ${[g.km != null ? F.km(g.km, 1) : null, g.sub != null ? `${F.subida(g.sub)} de subida` : null, g.altMax != null ? `ponto mais alto ${F.metros(g.altMax)}` : null, g.tipo].filter(Boolean).join(', ')}. `
    + `Coordenadas da partida: ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} (https://maps.google.com/?q=${g.lat.toFixed(5)},${g.lon.toFixed(5)}).` : '';
  return `${v(d.para, '[nome]')}, vou fazer a trilha ${v(d.trilha, '[trilha]')}, saindo de ${v(d.partida, '[ponto de partida]')}, em ${d.data ? F.data(d.data) : '[data]'}, às ${v(d.saida, '[hora]')}. `
    + `${d.companhia === 'acompanhado' ? `Vou acompanhado${d.quem ? ` (${d.quem.trim()})` : ''}.` : 'Vou sozinho.'} Volta prevista: ${v(d.volta, '[hora]')}. `
    + `Se eu não der notícia até ${prazo || '[volta + prazo]'}, tente me ligar; sem resposta, acione os bombeiros (193) e passe este roteiro.${percurso}`;
}

export async function render({ main, rota }) {
  const d = { trilha: '', partida: '', data: F.hojeISO(), saida: '', volta: '', para: '', companhia: 'sozinho', quem: '', prazo: '2', gpx: null, voltaAuto: false, ...(await lerMeta('rascunhoSaida', {})) };
  let erroGPX = '';
  const salvar = () => gravarMeta('rascunhoSaida', { ...d }).catch((err) => avisar(err.message, 'erro'));
  if (rota.query.get('trilha')) d.trilha = rota.query.get('trilha');
  const marcados = new Set(await lerMeta('checklist', []));
  const total = CHECKLIST.reduce((s, g) => s + g.itens.length, 0);

  const campo = (k, rotulo, tipo = 'text', extra = '') => html`<div class="campo"><label for="s-${k}">${rotulo}</label><input id="s-${k}" name="${k}" type="${tipo}" value="${d[k]}" ${bruto(extra)}></div>`;

  function desenhar() {
    montar(main, html`<h1 class="titulo-pagina">Folha de saída</h1>
    <p class="sutil" style="max-width:68ch">Antes de sair, deixe com alguém o roteiro e a hora de volta. Os campos ficam salvos neste aparelho, mesmo sem sinal.</p>
    ${blocoGPX()}
    <div class="trilha-grade">
      <form id="form-saida" class="grade-campos">
        ${campo('trilha', 'Trilha')}${campo('partida', 'Ponto de partida')}
        ${campo('data', 'Data', 'date')}${campo('para', 'Para quem (nome)')}
        ${campo('saida', 'Saída', 'time')}
        <div class="campo"><label for="s-volta">Volta prevista</label><input id="s-volta" name="volta" type="time" value="${d.volta}">${d.voltaAuto && d.gpx?.tempoMin ? html`<span class="ajuda">Estimada: saída + ${F.duracao(d.gpx.tempoMin)} (tempo de quem gravou o GPX), arredondada para cima. Ajuste ao seu ritmo.</span>` : d.gpx && !d.gpx.tempoMin ? html`<span class="ajuda">O GPX não tem horários: informe a volta você mesmo.</span>` : d.gpx && !d.saida ? html`<span class="ajuda">Informe a saída para estimar a volta pelo GPX.</span>` : ''}</div>
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

  function blocoGPX() {
    const g = d.gpx;
    return html`<section class="gpx-zona" style="margin:var(--e4) 0" aria-labelledby="h-gpx-saida">
      <div style="display:flex;justify-content:space-between;gap:var(--e3);flex-wrap:wrap;align-items:baseline"><strong id="h-gpx-saida">Preencher com o GPX da trilha</strong>${g ? html`<button class="botao botao--texto" type="button" id="gpx-limpar">Remover dados do GPX</button>` : ''}</div>
      ${g ? html`<dl class="revisao-lista"><dt>Arquivo</dt><dd>${g.arquivo}</dd><dt>Percurso</dt><dd>${F.km(g.km, 1)} · ${F.subida(g.sub)} · máx. ${F.metros(g.altMax)}${g.tipo ? ` · ${g.tipo}` : ''}</dd>
          <dt>Partida</dt><dd>${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</dd><dt>Tempo do autor</dt><dd>${F.duracao(g.tempoMin)}</dd></dl>
          <p class="nota-dado" style="margin:0">Distância, subida e coordenadas da partida entram na mensagem, com link de mapa para quem precisar acionar resgate.</p>`
        : html`<p class="sutil" style="margin:0;font-size:var(--t-s)">Escolha o GPX baixado do Wikiloc: o app preenche trilha, ponto de partida e estima a volta. Os dados ficam só neste aparelho.</p>`}
      <div class="botoes"><label class="botao ${g ? '' : 'botao--primario'}" for="s-gpx">${icone('importar')} ${g ? 'Trocar arquivo .gpx' : 'Escolher arquivo .gpx'}</label><input id="s-gpx" type="file" class="so-leitor"></div>
      ${erroGPX ? html`<p class="pendencias" role="alert" style="margin:0">${erroGPX}</p>` : ''}
    </section>`;
  }

  async function aplicarGPX(arquivo) {
    erroGPX = '';
    try {
      if (arquivo.size > 30 * 1024 * 1024) throw new ErroGPX('O arquivo tem mais de 30 MB; isso não parece um GPX de trilha.');
      const L = lerGPX(await lerArquivoTexto(arquivo));
      const g = resumoGPX(L, arquivo.name);
      d.gpx = g;
      if (g.nome) d.trilha = g.nome;
      d.partida = g.partida || 'início do percurso do GPX (coordenadas abaixo)';
      const v = voltaEstimada(d.saida, g.tempoMin);
      if (v) { d.volta = v; d.voltaAuto = true; } else d.voltaAuto = !!g.tempoMin;
      avisar('GPX lido. Confira os campos e ajuste o que precisar.');
    } catch (e) {
      erroGPX = e instanceof ErroGPX ? e.message : `Não foi possível ler o arquivo: ${e.message}`;
    }
    salvar();
    desenhar();
    $('#s-gpx')?.focus();
  }

  function atualizarMensagem() {
    const m = mensagem(d);
    $('#mensagem').textContent = m;
    $('#whats').href = `https://wa.me/?text=${encodeURIComponent(m)}`;
  }

  function ligar() {
    $('#form-saida').addEventListener('input', (e) => {
      const nome = e.target.name;
      d[nome] = e.target.value;
      if (nome === 'volta') d.voltaAuto = false;
      if (nome === 'saida' && d.gpx && (d.voltaAuto || !d.volta)) {
        const v = voltaEstimada(d.saida, d.gpx.tempoMin);
        if (v) { d.volta = v; d.voltaAuto = true; $('#s-volta').value = v; }
      }
      salvar();
      if (nome === 'companhia') { desenhar(); $('#s-companhia').focus(); return; }
      atualizarMensagem();
    });
    // Atualiza a dica da volta estimada só ao concluir a edição da saída (não a cada tecla).
    $('#form-saida').addEventListener('change', (e) => { if (e.target.name === 'saida' && d.gpx) { desenhar(); $('#s-saida')?.focus(); } });
    $('#s-gpx').addEventListener('change', (e) => { const a = e.target.files[0]; e.target.value = ''; if (a) aplicarGPX(a); });
    $('#gpx-limpar')?.addEventListener('click', () => { d.gpx = null; d.voltaAuto = false; erroGPX = ''; salvar(); desenhar(); });
    $('#copiar').addEventListener('click', async () => { const ok = await copiarTexto(mensagem(d)); avisar(ok ? 'Mensagem copiada.' : 'Não foi possível copiar.', ok ? 'info' : 'erro'); });
    $('#checklist').addEventListener('change', (e) => {
      if (e.target.checked) marcados.add(e.target.value); else marcados.delete(e.target.value);
      $('#contagem').textContent = `${marcados.size} de ${total}`;
      gravarMeta('checklist', [...marcados]).catch((err) => avisar(err.message, 'erro'));
    });
    $('#zerar').addEventListener('click', () => { marcados.clear(); gravarMeta('checklist', []); $$('#checklist input').forEach((i) => { i.checked = false; }); $('#contagem').textContent = `0 de ${total}`; });
  }

  desenhar();
  return () => { gravarMeta('rascunhoSaida', d).catch(() => {}); };
}
