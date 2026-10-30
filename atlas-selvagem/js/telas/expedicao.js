// Nova expedição / edição: formulário em quatro etapas com importação de GPX e revisão.
// Rotas: #/nova, #/nova?gpx=1, #/nova?folha=<id>, #/nova?de=<id> (duplicar), #/editar/<id>

import { estado, salvarTrilha, atualizarAnotacao, adicionarFotos, trajetoDuplicado, marcarFolhaRegistrada } from '../estado.js';
import { html, montar, icone, $, $$, bruto, avisar, confirmar, lerArquivoTexto, dialogo } from '../ui.js';
import * as F from '../formato.js';
import { vazio, validar, pendencias, lerCoordenadas, TIPOS, CATEGORIAS, DIFICULDADES, STATUS, TIPOS_POI, CAMPOS_NUMERICOS, ROTULOS } from '../modelo.js';
import { lerGPX, gpxExemplo, ErroGPX } from '../gpx.js';
import { folhaSVG, perfilFormaSVG } from '../desenho.js';
import { marcaFonte } from '../componentes.js';
import { protecao } from '../app.js';

const ETAPAS = ['Identificação', 'Percurso', 'Diário de campo', 'Revisão'];
const ETAPA_DOS_CAMPOS = { nome: 0, local: 0, data: 0, regiao: 0, distanciaKm: 1, tempoTotalMin: 1, tempoMovMin: 1, desnivelPos: 1, desnivelNeg: 1, altitudeMin: 1, altitudeMax: 1, coordInicio: 1, esforco: 2, wikiloc: 2 };
const CAMPOS_GPX = ['distanciaKm', 'desnivelPos', 'desnivelNeg', 'altitudeMin', 'altitudeMax', 'tempoTotalMin', 'tempoMovMin', 'tipo', 'tracado', 'pontos', 'cume', 'perfil', 'coordInicio'];

// "5:42", "5h42", "342" (min) -> minutos
export function lerDuracao(txt) {
  const s = String(txt || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { valor: null };
  let m = s.match(/^(\d{1,3})[:h](\d{1,2})(?:m(?:in)?)?$/);
  if (m) { const mm = Number(m[2]); if (mm > 59) return { erro: 'Minutos devem ir de 0 a 59.' }; return { valor: Number(m[1]) * 60 + mm }; }
  m = s.match(/^(\d{1,3})h$/);
  if (m) return { valor: Number(m[1]) * 60 };
  m = s.match(/^(\d{1,5})(?:m|min)?$/);
  if (m) return { valor: Number(m[1]) };
  return { erro: 'Use horas:minutos (ex.: 5:42) ou minutos (ex.: 342).' };
}
const durTxt = (min) => (min == null ? '' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);

export async function render({ main, rota, ir }) {
  const editando = rota.nome === 'editar';
  const original = editando ? estado.porId.get(rota.params[0]) : null;
  if (editando && !original) {
    montar(main, html`<div class="vazio"><h1 class="titulo-pagina">Registro não encontrado</h1><p class="sutil">Ele pode ter sido excluído.</p><a class="botao" href="#/atlas">Voltar ao atlas</a></div>`);
    return null;
  }
  const folhaOrigem = rota.query.get('folha') ? estado.folhasEmBranco.find((f) => f.id === rota.query.get('folha')) : null;
  const modelo = rota.query.get('de') ? estado.porId.get(rota.query.get('de')) : null;

  let f;
  if (original) f = structuredClone(original);
  else if (modelo) {
    f = { ...vazio(), ...structuredClone(modelo), id: null, numero: null, nome: `${modelo.nome} (cópia)`, origem: 'local', status: 'rascunho', criadoEm: null, atualizadoEm: null, temTrajeto: false };
    f.fontes = { ...modelo.fontes };
    for (const c of Object.keys(f.fontes)) if (f.fontes[c] === 'gpx') f.fontes[c] = 'manual';
  } else {
    f = vazio();
    f.data = F.hojeISO();
    if (folhaOrigem) { f.nome = folhaOrigem.nome; f.local = folhaOrigem.local || ''; }
  }
  f.fontes = f.fontes || {};
  delete f.editadoLocal;
  let etapa = rota.query.get('gpx') ? 1 : 0;
  let erros = {};
  let gpx = null; // { leitura, nomeArquivo, texto }
  let trajeto = null; // pendente de gravação
  const fotosNovas = []; // File[]
  const poisNovos = [];
  let tentouAvancar = new Set();
  const textoDur = { tempoTotalMin: durTxt(f.tempoTotalMin), tempoMovMin: durTxt(f.tempoMovMin) };
  let textoCoord = f.coordInicio ? f.coordInicio.join(', ') : '';
  const instantaneo = () => JSON.stringify([f, textoDur, textoCoord, fotosNovas.length, poisNovos.length, !!trajeto]);
  const inicial = instantaneo();
  protecao.definir(() => instantaneo() !== inicial);

  const valorCampo = (c) => (f[c] == null ? '' : f[c]);
  const erroDe = (c) => (erros[c] ? html`<span class="erro" id="erro-${c}">${erros[c]}</span>` : '');
  const aria = (c) => bruto(erros[c] ? `aria-invalid="true" aria-describedby="erro-${c}"` : '');
  const sel = (nome, lista, atual, rotulos) => html`<select id="c-${nome}" name="${nome}" ${aria(nome)}><option value="">— não informado —</option>${lista.map((v) => html`<option value="${v}" ${v === atual ? bruto('selected') : ''}>${rotulos ? rotulos[v] : v}</option>`)}</select>`;
  const numCampo = (c, unidade, passo = 'any', ajuda = '') => html`<div class="campo campo--unidade"><label for="c-${c}">${ROTULOS[c]} ${marcaFonte(f.fontes[c])}</label>
    <input id="c-${c}" name="${c}" type="number" inputmode="decimal" step="${passo}" min="${c.startsWith('altitude') ? -500 : 0}" value="${valorCampo(c)}" ${aria(c)}><span class="unidade">${unidade}</span>${ajuda ? html`<span class="ajuda">${ajuda}</span>` : ''}${erroDe(c)}</div>`;
  const durCampo = (c, ajuda) => html`<div class="campo"><label for="c-${c}">${ROTULOS[c]} ${marcaFonte(f.fontes[c])}</label>
    <input id="c-${c}" name="${c}" data-dur type="text" inputmode="numeric" placeholder="h:mm" value="${textoDur[c]}" ${aria(c)} style="font-family:var(--f-dados)"><span class="ajuda">${ajuda}</span>${erroDe(c)}</div>`;

  function etapaIdent() {
    return html`<fieldset style="border:0;padding:0;margin:0"><legend class="secao-titulo" style="width:100%"><span class="controle">1</span> Identificação</legend>
    <div class="grade-campos">
      <div class="campo largo"><label for="c-nome">Nome da trilha <span class="obrig" aria-hidden="true">*</span></label><input id="c-nome" name="nome" required value="${f.nome}" autocomplete="off" ${aria('nome')} placeholder="Ex.: Pico das Cabras">${erroDe('nome')}</div>
      <div class="campo"><label for="c-local">Localidade <span class="obrig" aria-hidden="true">*</span></label><input id="c-local" name="local" required value="${f.local}" ${aria('local')} placeholder="Ex.: Joaquim Egídio, Campinas-SP">${erroDe('local')}</div>
      <div class="campo"><label for="c-regiao">Região</label><input id="c-regiao" name="regiao" value="${f.regiao ?? ''}" list="regioes-conhecidas" placeholder="Ex.: Serra da Mantiqueira"><datalist id="regioes-conhecidas">${[...new Set(estado.trilhas.map((t) => t.regiao).filter(Boolean))].map((r) => html`<option value="${r}">`)}</datalist><span class="ajuda">Usada para contar regiões exploradas e filtrar o mapa.</span></div>
      <div class="campo"><label for="c-data">Data <span class="obrig" aria-hidden="true">*</span></label><input id="c-data" name="data" type="date" required value="${f.data}" max="${F.hojeISO(new Date(Date.now() + 366 * 86400000))}" ${aria('data')}>${erroDe('data')}</div>
      <div class="campo"><label for="c-categoria">Categoria de atividade</label>${sel('categoria', CATEGORIAS, f.categoria)}</div>
      <div class="campo"><label for="c-tipo">Tipo de percurso ${marcaFonte(f.fontes.tipo)}</label>${sel('tipo', TIPOS, f.tipo)}<span class="ajuda">Travessia: início e fim em lugares diferentes.</span></div>
      <div class="campo"><label for="c-status">Status do registro</label><select id="c-status" name="status">${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${f.status === k ? bruto('selected') : ''}>${v}</option>`)}</select><span class="ajuda">Rascunho: você ainda pretende completar.</span></div>
    </div></fieldset>`;
  }

  function blocoGPX() {
    if (!gpx) {
      return html`<div class="gpx-zona" id="gpx-zona"><strong>Arquivo GPX</strong>
        <p class="sutil" style="margin:0;font-size:var(--t-s)">Importe a gravação do relógio, GPS ou aplicativo (Wikiloc, Strava, Garmin…). Distância, desnível, tempos e traçado são calculados do arquivo; você revisa antes de salvar.</p>
        <div class="botoes"><label class="botao botao--primario" for="gpx-arquivo">${icone('importar')} Escolher arquivo .gpx</label><input id="gpx-arquivo" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" class="so-leitor"><button class="botao" type="button" id="gpx-exemplo">Usar GPX de exemplo</button></div>
        ${f.temTrajeto ? html`<p class="nota-dado">Este registro já tem um trajeto GPX. Importar outro substituirá o trajeto e os valores calculados.</p>` : ''}
        <div id="gpx-erro" role="alert"></div></div>`;
    }
    const L = gpx.leitura;
    return html`<div class="gpx-zona"><div style="display:flex;justify-content:space-between;gap:var(--e3);flex-wrap:wrap"><strong>GPX lido: ${gpx.nomeArquivo}${gpx.exemplo ? ' (exemplo fictício)' : ''}</strong><button class="botao botao--texto" type="button" id="gpx-remover">Remover GPX</button></div>
      <div class="gpx-lido"><div class="quadro esboco">${bruto(folhaSVG({ ...L, id: 'gpx', nome: 'GPX', distanciaKm: L.distanciaKm, altitudeMax: L.altitudeMax }, { completo: true }) || '')}</div>
      <div><dl class="revisao-lista">
        <dt>Pontos</dt><dd>${F.num(L.nPontos)} (${L.origemPontos})${L.descartados ? ` · ${L.descartados} inválidos ignorados` : ''}</dd>
        <dt>Distância</dt><dd>${F.km(L.distanciaKm)}</dd><dt>Desnível</dt><dd>${F.subida(L.desnivelPos)} / ${F.descida(L.desnivelNeg)}</dd>
        <dt>Altitude</dt><dd>${F.metros(L.altitudeMin)} – ${F.metros(L.altitudeMax)}</dd><dt>Tempo total</dt><dd>${F.duracao(L.tempoTotalMin)}</dd><dt>Em movimento</dt><dd>${F.duracao(L.tempoMovMin)}</dd>
        <dt>Data</dt><dd>${F.data(L.data)}</dd><dt>Tipo</dt><dd>${L.tipo}</dd><dt>Partida</dt><dd>${F.coord(L.coordInicio[0], L.coordInicio[1])}</dd></dl>
        ${L.ausentes.length ? html`<p class="pendencias" style="margin-top:var(--e3)">O arquivo não tem ${F.juntar(L.ausentes)}. Esses campos ficam vazios — preencha à mão se souber.</p>` : ''}
        ${L.perfil ? html`<div class="perfil" style="margin-top:var(--e3)">${bruto(perfilFormaSVG(L.perfil, L.altitudeMax, L.distanciaKm, { altura: 110 }))}</div>` : ''}
        <p class="nota-dado">Desnível calculado com média móvel de 5 pontos e histerese de 3 m; pode diferir do mostrado pelo Wikiloc ou pelo relógio. "Em movimento" soma intervalos de até 10 min com velocidade ≥ 0,3 m/s.</p>
      </div></div></div>`;
  }

  function etapaPercurso() {
    return html`<fieldset style="border:0;padding:0;margin:0"><legend class="secao-titulo" style="width:100%"><span class="controle">2</span> Dados do percurso</legend>
      ${blocoGPX()}
      <div class="grade-campos grade-campos--3" style="margin-top:var(--e4)">
        ${numCampo('distanciaKm', 'km', '0.01')}${durCampo('tempoTotalMin', 'Do início ao fim, com paradas.')}${durCampo('tempoMovMin', 'Só o tempo andando.')}
        ${numCampo('desnivelPos', 'm', '1', 'Soma das subidas.')}${numCampo('desnivelNeg', 'm', '1', 'Soma das descidas (valor positivo).')}<div></div>
        ${numCampo('altitudeMin', 'm', '1')}${numCampo('altitudeMax', 'm', '1')}
        <div class="campo"><label for="c-coord">Coordenadas de partida ${marcaFonte(f.fontes.coordInicio)}</label><input id="c-coord" name="coordInicio" data-coord value="${textoCoord}" placeholder="-22.8900, -46.8600" inputmode="decimal" style="font-family:var(--f-dados)" ${aria('coordInicio')}><span class="ajuda">Latitude, longitude em graus decimais. Posiciona a trilha no mapa quando não há GPX.</span>${erroDe('coordInicio')}</div>
      </div>
      <p class="nota-dado">Deixe em branco o que você não sabe: campo vazio fica como "—" e não entra em somas. Nunca é tratado como zero.</p></fieldset>`;
  }

  function etapaDiario() {
    return html`<fieldset style="border:0;padding:0;margin:0"><legend class="secao-titulo" style="width:100%"><span class="controle">3</span> Diário de campo</legend>
    <div class="grade-campos">
      <div class="campo"><label for="c-clima">Condições meteorológicas</label><input id="c-clima" name="clima" value="${f.clima ?? ''}" placeholder="Ex.: nublado, chuva fraca à tarde"></div>
      <div class="campo"><label for="c-terreno">Tipo de terreno</label><input id="c-terreno" name="terreno" value="${f.terreno ?? ''}" placeholder="Ex.: estrada de terra, trilha de mata, pedra"></div>
      <div class="campo"><label for="c-dificuldade">Dificuldade percebida</label>${sel('dificuldade', DIFICULDADES, f.dificuldade)}</div>
      <div class="campo campo--unidade"><label for="c-esforco">Esforço percebido</label><input id="c-esforco" name="esforco" type="number" min="1" max="10" step="1" inputmode="numeric" value="${valorCampo('esforco')}" ${aria('esforco')}><span class="unidade">/ 10</span>${erroDe('esforco')}</div>
      <div class="campo"><label for="c-companhia">Companhia</label><input id="c-companhia" name="companhia" value="${f.companhia ?? ''}" placeholder="Ex.: sozinho"></div>
      <div class="campo"><label for="c-wikiloc">Link da gravação</label><input id="c-wikiloc" name="wikiloc" type="url" value="${f.wikiloc ?? ''}" placeholder="https://…" ${aria('wikiloc')}>${erroDe('wikiloc')}</div>
      <div class="campo largo"><label for="c-equipamentos">Equipamentos utilizados</label><input id="c-equipamentos" name="equipamentos" value="${f.equipamentos ?? ''}" placeholder="Ex.: bota MH500, bastão, 3 L de água"></div>
      <div class="campo largo"><label for="c-notas">Observações pessoais</label><textarea id="c-notas" name="notas" placeholder="Como foi a experiência, o que ver, o que evitar…">${f.notas ?? ''}</textarea></div>
      <div class="campo largo"><label for="c-ocorrencias">Ocorrências</label><textarea id="c-ocorrencias" name="ocorrencias" style="min-height:72px" placeholder="Quedas, trechos fechados, animais, mudanças de rota…">${f.ocorrencias ?? ''}</textarea></div>
      <div class="campo largo"><span class="rotulo-campo">Fotografias</span>
        <div class="botoes"><label class="botao" for="c-fotos">${icone('foto')} Adicionar fotos</label><input id="c-fotos" type="file" accept="image/*" multiple class="so-leitor"></div>
        <span class="ajuda">Reduzidas para até 1600 px (JPEG) antes de guardar, para poupar espaço do aparelho. Limite de 25 MB por arquivo original.</span>
        ${fotosNovas.length ? html`<ul class="lista-pois">${fotosNovas.map((a, i) => html`<li style="grid-template-columns:1fr auto"><span>${a.name} <span class="sutil dado">${F.bytes(a.size)}</span></span><button class="botao botao--texto" type="button" data-rm-foto="${i}">Remover</button></li>`)}</ul>` : ''}
        ${editando && estado.fotosPorTrilha[f.id] ? html`<span class="ajuda">Este registro já tem ${estado.fotosPorTrilha[f.id]} foto(s); legendas e exclusões ficam na página da trilha.</span>` : ''}</div>
      <div class="campo largo"><span class="rotulo-campo">Pontos de interesse</span>
        <div class="grade-campos grade-campos--3" style="align-items:end">
          <div class="campo"><label for="poi-tipo">Tipo</label><select id="poi-tipo">${Object.entries(TIPOS_POI).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
          <div class="campo"><label for="poi-nome">Nome</label><input id="poi-nome" placeholder="Ex.: mirante da pedra"></div>
          <div class="campo"><label for="poi-km">Km aproximado</label><input id="poi-km" type="number" min="0" step="0.1" inputmode="decimal"></div>
        </div>
        <div class="botoes"><button class="botao" type="button" id="poi-add">Adicionar ponto</button></div>
        <span class="ajuda">Também é possível marcar pontos tocando no esboço, na página da trilha.</span>
        ${poisNovos.length ? html`<ul class="lista-pois">${poisNovos.map((p, i) => html`<li style="grid-template-columns:1fr auto"><span>${TIPOS_POI[p.tipo]} · ${p.nome || 'sem nome'}${p.km != null ? ` · km ${F.num(p.km, 1)}` : ''}</span><button class="botao botao--texto" type="button" data-rm-poi="${i}">Remover</button></li>`)}</ul>` : ''}
      </div>
    </div></fieldset>`;
  }

  function etapaRevisao() {
    const pend = pendencias(f);
    const errs = validar(f);
    const linha = (c, v) => html`<dt>${ROTULOS[c] || c}</dt><dd>${v} ${marcaFonte(f.fontes[c])}</dd>`;
    return html`<section><h2 class="secao-titulo"><span class="controle">4</span> Revisão</h2>
      ${Object.keys(errs).length ? html`<div class="pendencias" role="alert"><strong>Corrija antes de salvar:</strong><ul>${Object.entries(errs).map(([c, m]) => html`<li><button class="botao botao--texto" type="button" data-ir-campo="${c}">${ROTULOS[c] || c}</button>: ${m}</li>`)}</ul></div>` : ''}
      <div class="trilha-grade">
        <div><h3 class="titulo-pagina">${f.nome || 'Sem nome'}</h3><p class="editorial sutil" style="font-size:var(--t-l)">${f.local || F.VAZIO}${f.regiao ? ` · ${f.regiao}` : ''}</p>
        <dl class="revisao-lista">${linha('data', F.data(f.data))}${linha('categoria', f.categoria || F.VAZIO)}${linha('tipo', f.tipo || F.VAZIO)}${linha('status', STATUS[f.status])}
          ${linha('distanciaKm', F.km(f.distanciaKm))}${linha('tempoTotalMin', F.duracao(f.tempoTotalMin))}${linha('tempoMovMin', F.duracao(f.tempoMovMin))}
          ${linha('desnivelPos', F.subida(f.desnivelPos))}${linha('desnivelNeg', F.descida(f.desnivelNeg))}${linha('altitudeMin', F.metros(f.altitudeMin))}${linha('altitudeMax', F.metros(f.altitudeMax))}
          ${linha('dificuldade', f.dificuldade || F.VAZIO)}${linha('esforco', f.esforco == null ? F.VAZIO : `${f.esforco} / 10`)}
          <dt>Partida</dt><dd>${f.coordInicio ? F.coord(...f.coordInicio) : F.VAZIO} ${marcaFonte(f.fontes.coordInicio)}</dd>
          <dt>Trajeto</dt><dd>${trajeto ? `GPX novo (${F.num(trajeto.pontos.length)} pontos)` : f.temTrajeto ? 'GPX já armazenado' : f.pontos ? 'só esboço' : F.VAZIO}</dd>
          <dt>Fotos novas</dt><dd>${fotosNovas.length || F.VAZIO}</dd><dt>Pontos novos</dt><dd>${poisNovos.length || F.VAZIO}</dd></dl></div>
        <div>${pend.length ? html`<div class="pendencias"><strong>Dados pendentes (${pend.length}):</strong> ${F.juntar(pend)}.<br><span class="sutil">Você pode salvar assim mesmo; a folha ficará marcada com dados faltando.</span></div>` : html`<p class="positivo"><strong>Registro completo.</strong></p>`}
          <p class="nota-dado">Etiquetas indicam a origem: <strong>manual</strong> (digitado), <strong>GPX</strong> (importado do arquivo), <strong>print</strong> (lido de captura de tela), <strong>calc.</strong> (calculado).</p></div>
      </div></section>`;
  }

  const CORPOS = [etapaIdent, etapaPercurso, etapaDiario, etapaRevisao];

  function desenhar(foco) {
    montar(main, html`
      <nav class="migalha" aria-label="Trilha de navegação"><a href="${editando ? `#/trilha/${encodeURIComponent(f.id)}` : '#/atlas'}">${icone('voltar')} ${editando ? f.nome : 'Atlas'}</a></nav>
      <h1 class="titulo-pagina">${editando ? `Editar ${F.numero(f.numero)}` : modelo ? 'Duplicar expedição' : 'Nova expedição'}</h1>
      ${editando && original.origem === 'base' ? html`<p class="nota-dado">Este registro vem do arquivo base. A edição fica guardada neste aparelho e pode ser desfeita na página da trilha.</p>` : ''}
      ${folhaOrigem ? html`<p class="nota-dado">Registrando a folha em branco "${folhaOrigem.nome}". Ao salvar, ela sai da lista de folhas em branco.</p>` : ''}
      <ol class="etapas">${ETAPAS.map((e, i) => html`<li><button type="button" data-etapa="${i}" ${i === etapa ? bruto('aria-current="step"') : ''} class="${i < etapa ? 'feita' : ''}"><span class="controle">${i + 1}</span>${e}</button></li>`)}</ol>
      <form id="form-exp" novalidate>${CORPOS[etapa]()}
        <div class="form-acoes">
          <div class="botoes"><button class="botao" type="button" id="cancelar">Cancelar</button>${etapa > 0 ? html`<button class="botao" type="button" id="voltar">${icone('voltar')} Voltar</button>` : ''}</div>
          <div class="botoes">${etapa < 3 ? html`<button class="botao" type="button" id="ir-revisao">Revisar</button><button class="botao botao--primario" type="submit">Próximo ${icone('avancar')}</button>` : html`<button class="botao botao--primario" type="submit">${editando ? 'Salvar alterações' : 'Salvar expedição'}</button>`}</div>
        </div></form>`);
    ligar();
    if (foco) $(foco)?.focus();
  }

  function lerCampos() {
    const form = $('#form-exp');
    for (const el of $$('input[name], select[name], textarea[name]', form)) {
      const c = el.name;
      if (el.dataset.dur !== undefined) {
        textoDur[c] = el.value;
        const r = lerDuracao(el.value);
        if (r.erro) erros[c] = r.erro; else { delete erros[c]; if (r.valor !== f[c]) { f[c] = r.valor; f.fontes[c] = r.valor == null ? undefined : 'manual'; } }
      } else if (el.dataset.coord !== undefined) {
        textoCoord = el.value;
        const r = lerCoordenadas(el.value);
        if (r.erro) erros.coordInicio = r.erro;
        else { delete erros.coordInicio; if (JSON.stringify(r.valor) !== JSON.stringify(f.coordInicio)) { f.coordInicio = r.valor; f.fontes.coordInicio = r.valor ? 'manual' : undefined; } }
      } else if (el.type === 'number') {
        const v = el.value === '' ? null : Number(el.value);
        if (v !== f[c]) { f[c] = v; if (CAMPOS_NUMERICOS.includes(c)) f.fontes[c] = v == null ? undefined : 'manual'; }
      } else {
        const v = el.value.trim();
        const novo = v === '' ? (['nome', 'local', 'data'].includes(c) ? '' : null) : v;
        if (novo !== f[c]) { f[c] = novo; if (c === 'tipo') f.fontes.tipo = novo ? 'manual' : undefined; }
      }
    }
    for (const k of Object.keys(f.fontes)) if (f.fontes[k] === undefined) delete f.fontes[k];
  }

  function validarEtapa(i) {
    const e = validar(f);
    const campos = Object.keys(e).filter((c) => (ETAPA_DOS_CAMPOS[c] ?? 3) === i);
    const parse = Object.keys(erros).filter((c) => (ETAPA_DOS_CAMPOS[c] ?? 3) === i && ['tempoTotalMin', 'tempoMovMin', 'coordInicio'].includes(c));
    erros = { ...Object.fromEntries(Object.entries(erros).filter(([c]) => parse.includes(c))), ...Object.fromEntries(campos.map((c) => [c, e[c]])) };
    return campos.length + parse.length === 0;
  }

  function irPara(i) {
    lerCampos();
    if (i > etapa && !validarEtapa(etapa)) {
      tentouAvancar.add(etapa);
      desenhar();
      const primeiro = Object.keys(erros)[0];
      $(`[name="${primeiro}"]`)?.focus();
      avisar('Há campos para corrigir nesta etapa.', 'erro');
      return;
    }
    etapa = i;
    erros = {};
    desenhar('.etapas [aria-current="step"]');
  }

  async function aplicarGPX(texto, nomeArquivo, exemplo = false) {
    const caixa = $('#gpx-erro');
    let L;
    try { L = lerGPX(texto); } catch (e) {
      const msg = e instanceof ErroGPX ? e.message : `Não foi possível ler o arquivo: ${e.message}`;
      if (caixa) montar(caixa, html`<p class="pendencias">${msg}</p>`);
      return;
    }
    const dup = await trajetoDuplicado(L.assinatura);
    if (dup && dup.id !== f.id) {
      const ok = await confirmar('GPX já importado', `Este mesmo arquivo já está no registro "${dup.nome}" (${F.data(dup.data)}). Importar de novo criaria uma trilha duplicada nas estatísticas.`, { confirmar: 'Importar mesmo assim' });
      if (!ok) return;
    }
    const manuais = CAMPOS_GPX.filter((c) => f.fontes[c] === 'manual' && L[c] != null && JSON.stringify(L[c]) !== JSON.stringify(f[c]));
    let substituir = true;
    if (manuais.length) {
      const r = await dialogo({ titulo: 'Valores já preenchidos', corpo: `Você digitou ${F.juntar(manuais.map((c) => (ROTULOS[c] || c).toLowerCase()))}. Usar os valores calculados do GPX ou manter os seus?`, botoes: [{ valor: 'manter', texto: 'Manter os meus' }, { valor: 'gpx', texto: 'Usar os do GPX', primario: true }] });
      if (!r) return;
      substituir = r === 'gpx';
    }
    for (const c of CAMPOS_GPX) {
      if (L[c] == null) continue;
      if (!substituir && manuais.includes(c)) continue;
      f[c] = L[c];
      if (['tracado', 'pontos', 'cume', 'perfil'].includes(c)) continue;
      f.fontes[c] = 'gpx';
    }
    f.fontePerfil = L.perfil ? 'gpx' : f.fontePerfil;
    if (L.data && (!f.data || f.data === F.hojeISO()) && !editando) f.data = L.data;
    if (!f.nome && L.nomeGPX) f.nome = L.nomeGPX;
    textoDur.tempoTotalMin = durTxt(f.tempoTotalMin); textoDur.tempoMovMin = durTxt(f.tempoMovMin);
    textoCoord = f.coordInicio ? f.coordInicio.join(', ') : '';
    trajeto = { pontos: L.trajeto.map((p) => [p.lat, p.lon, p.ele, p.t]), assinatura: L.assinatura, arquivo: nomeArquivo, importadoEm: new Date().toISOString(), waypoints: L.waypoints };
    gpx = { leitura: L, nomeArquivo, exemplo };
    if (exemplo && !f.nome) f.nome = 'Trilha de exemplo (GPX fictício)';
    desenhar('#gpx-remover');
    avisar('GPX lido. Confira os valores antes de salvar.');
  }

  async function salvar() {
    lerCampos();
    const e = validar(f);
    if (Object.keys(e).length) {
      const c = Object.keys(e)[0];
      etapa = ETAPA_DOS_CAMPOS[c] ?? 0;
      erros = e;
      desenhar();
      $(`[name="${c}"]`)?.focus();
      avisar('Corrija os campos destacados antes de salvar.', 'erro');
      return;
    }
    const botao = $('#form-exp [type="submit"]');
    botao.disabled = true;
    try {
      const salvo = await salvarTrilha(f, { trajeto });
      if (poisNovos.length) await atualizarAnotacao(salvo.id, (a) => { a.pois.push(...poisNovos.map((p) => ({ ...p, id: crypto.randomUUID() }))); return a; });
      if (fotosNovas.length) {
        const r = await adicionarFotos(salvo.id, fotosNovas);
        if (r.erros.length) avisar(`Algumas fotos não foram guardadas: ${r.erros.join(' ')}`, 'erro', 8000);
      }
      if (folhaOrigem) await marcarFolhaRegistrada(folhaOrigem.id);
      protecao.limpar();
      avisar(editando ? 'Alterações salvas.' : `Expedição salva como ${F.numero(salvo.numero)}.`);
      ir(`#/trilha/${encodeURIComponent(salvo.id)}`);
    } catch (err) {
      botao.disabled = false;
      avisar(err.message || String(err), 'erro', 9000);
    }
  }

  function ligar() {
    const form = $('#form-exp');
    form.addEventListener('submit', (e) => { e.preventDefault(); if (etapa < 3) irPara(etapa + 1); else salvar(); });
    form.addEventListener('input', () => lerCampos());
    $$('[data-etapa]').forEach((b) => b.addEventListener('click', () => irPara(Number(b.dataset.etapa))));
    $('#voltar')?.addEventListener('click', () => irPara(etapa - 1));
    $('#ir-revisao')?.addEventListener('click', () => irPara(3));
    $('#cancelar').addEventListener('click', async () => {
      lerCampos();
      if (protecao.sujo() && !(await confirmar('Cancelar?', 'As informações digitadas serão descartadas.', { confirmar: 'Descartar', perigo: true }))) return;
      protecao.limpar();
      ir(editando ? `#/trilha/${encodeURIComponent(f.id)}` : '#/atlas');
    });
    $('#gpx-arquivo')?.addEventListener('change', async (e) => {
      const a = e.target.files[0];
      if (!a) return;
      if (a.size > 30 * 1024 * 1024) { montar($('#gpx-erro'), html`<p class="pendencias">O arquivo tem mais de 30 MB; isso não parece um GPX de trilha.</p>`); return; }
      try { await aplicarGPX(await lerArquivoTexto(a), a.name); } catch (err) { montar($('#gpx-erro'), html`<p class="pendencias">${err.message}</p>`); }
    });
    $('#gpx-exemplo')?.addEventListener('click', () => aplicarGPX(gpxExemplo(), 'exemplo.gpx', true));
    $('#gpx-remover')?.addEventListener('click', () => {
      for (const c of CAMPOS_GPX) if (f.fontes[c] === 'gpx') { f[c] = null; delete f.fontes[c]; }
      if (!f.temTrajeto) { f.tracado = original?.tracado ?? null; f.pontos = original?.pontos ?? null; f.cume = original?.cume ?? null; f.perfil = original?.perfil ?? null; f.fontePerfil = original?.fontePerfil ?? null; }
      textoDur.tempoTotalMin = durTxt(f.tempoTotalMin); textoDur.tempoMovMin = durTxt(f.tempoMovMin); textoCoord = f.coordInicio ? f.coordInicio.join(', ') : '';
      gpx = null; trajeto = null; desenhar('#gpx-arquivo');
    });
    $('#c-fotos')?.addEventListener('change', (e) => { lerCampos(); fotosNovas.push(...e.target.files); desenhar('#c-fotos'); });
    $$('[data-rm-foto]').forEach((b) => b.addEventListener('click', () => { lerCampos(); fotosNovas.splice(Number(b.dataset.rmFoto), 1); desenhar(); }));
    $('#poi-add')?.addEventListener('click', () => {
      lerCampos();
      const km = parseFloat($('#poi-km').value);
      poisNovos.push({ tipo: $('#poi-tipo').value, nome: $('#poi-nome').value.trim(), nota: '', km: Number.isFinite(km) ? km : null, x: null, y: null });
      desenhar('#poi-nome');
    });
    $$('[data-rm-poi]').forEach((b) => b.addEventListener('click', () => { lerCampos(); poisNovos.splice(Number(b.dataset.rmPoi), 1); desenhar(); }));
    $$('[data-ir-campo]').forEach((b) => b.addEventListener('click', () => { const c = b.dataset.irCampo; etapa = ETAPA_DOS_CAMPOS[c] ?? 0; erros = validar(f); desenhar(); $(`[name="${c}"]`)?.focus(); }));
  }

  desenhar();
  return () => protecao.limpar();
}
