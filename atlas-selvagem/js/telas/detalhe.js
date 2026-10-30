// Detalhes de uma expedição: página editorial com mapa, resumo técnico, perfil, progresso, diário, fotos,
// pontos de interesse, alertas e anotações. Diário e anotações salvam automaticamente no aparelho.

import { estado, assinar, anotacao, atualizarAnotacao, excluirTrilha, descartarEdicaoLocal, obterTrajeto, fotosDa, adicionarFotos, atualizarFoto, removerFoto, ehDaBase } from '../estado.js';
import { html, montar, icone, $, $$, bruto, avisar, confirmar, copiarTexto, visorImagem, dialogo } from '../ui.js';
import * as F from '../formato.js';
import { pendencias, TIPOS_POI, TIPOS_ALERTA, ROTULOS, comoRegistroBase, STATUS } from '../modelo.js';
import { progresso, leitura, distintivos, encaixarNoTracado, filtrar, ordenar } from '../calculos.js';
import { folhaSVG, semMapaSVG, perfilRealSVG, perfilFormaSVG, simboloPOI, rosaDosVentosSVG } from '../desenho.js';
import { perfilReal, gerarGPX } from '../gpx.js';
import { criarMapa, desenharPercurso, marcarLocal, linkOSM } from '../mapa.js';
import { marcaFonte, selo } from '../componentes.js';
import { baixar } from '../backup.js';
import { filtros as filtrosAtlas, selecao } from './atlas.js';
import { prefs } from '../preferencias.js';

const SECOES = [['folha', 'Folha'], ['progresso', 'Progresso'], ['diario', 'Diário'], ['fotos', 'Fotos'], ['pontos', 'Pontos'], ['alertas', 'Alertas'], ['anotacoes', 'Anotações']];

export async function render({ main, rota, ir }) {
  const id = rota.params[0];
  let t = estado.porId.get(id);
  if (!t) {
    montar(main, html`<div class="vazio">${bruto(semMapaSVG())}<h1 class="titulo-pagina">Trilha não encontrada</h1><p class="sutil">O registro pode ter sido excluído ou o endereço está incorreto.</p><a class="botao" href="#/atlas">Voltar ao atlas</a></div>`);
    return null;
  }
  selecao.id = id;
  let aba = null; // 'real' | 'esboco'
  let marcando = false;
  let poiPendente = null;
  let trajeto = t.temTrajeto ? await obterTrajeto(id) : null;
  let fotos = await fotosDa(id);
  const urls = new Map();
  let destruirMapa = null;
  let observador = null;
  const urlFoto = (f) => { if (!urls.has(f.id)) urls.set(f.id, URL.createObjectURL(f.blob)); return urls.get(f.id); };

  function vizinhos() {
    const L = ordenar(filtrar(estado.trilhas, filtrosAtlas, estado.anotacoes), prefs().ordem, prefs().dir);
    const lista = L.some((x) => x.id === id) ? L : ordenar(estado.trilhas, prefs().ordem, prefs().dir);
    const i = lista.findIndex((x) => x.id === id);
    return { ant: i > 0 ? lista[i - 1] : null, prox: i >= 0 && i < lista.length - 1 ? lista[i + 1] : null };
  }

  const linhaResumo = (c, v, vazio = false) => html`<div><dt>${ROTULOS[c] || c}</dt><dd class="${vazio ? 'vazio-dado' : ''}">${v} ${vazio ? '' : marcaFonte(t.fontes?.[c])}</dd></div>`;

  function resumo() {
    const r = F.ritmo(t.distanciaKm, t.tempoMovMin);
    const L = (c, fmt) => linhaResumo(c, fmt(t[c]), F.ausente(t[c]));
    return html`<dl class="resumo">
      ${L('distanciaKm', (v) => F.km(v))}${L('desnivelPos', F.subida)}${L('tempoTotalMin', F.duracao)}${L('tempoMovMin', F.duracao)}
      ${L('desnivelNeg', F.descida)}${L('altitudeMax', F.metros)}${L('altitudeMin', F.metros)}
      <div><dt>Ritmo em movimento</dt><dd class="${r == null ? 'vazio-dado' : ''}">${r == null ? F.VAZIO : `${F.num(r, 1)} km/h`} ${r == null ? '' : marcaFonte('calculado')}</dd></div>
      ${linhaResumo('tipo', t.tipo || F.VAZIO, !t.tipo)}<div><dt>Categoria</dt><dd class="${t.categoria ? '' : 'vazio-dado'}">${t.categoria || F.VAZIO}</dd></div>
      ${linhaResumo('dificuldade', t.dificuldade || F.VAZIO, !t.dificuldade)}${linhaResumo('esforco', t.esforco == null ? F.VAZIO : `${t.esforco} / 10`, t.esforco == null)}
      <div style="grid-column:1/-1"><dt>Partida</dt><dd class="${t.coordInicio ? '' : 'vazio-dado'}" style="font-size:var(--t-s)">${t.coordInicio ? html`<a href="${linkOSM(...t.coordInicio)}" target="_blank" rel="noopener">${F.coord(...t.coordInicio)}</a> ${marcaFonte(t.fontes?.coordInicio)}` : F.VAZIO}</dd></div>
    </dl>`;
  }

  function quadroMapa(an) {
    const temReal = !!(trajeto?.pontos?.length || t.coordInicio);
    const temEsboco = Array.isArray(t.pontos) && t.pontos.length > 1;
    if (!aba) aba = temReal ? 'real' : 'esboco';
    if (!temReal && !temEsboco) {
      return html`<div class="quadro"><div class="sem-mapa">${bruto(semMapaSVG())}<p>Sem geometria registrada para esta trilha.<br>Importe um GPX ou informe as coordenadas de partida na edição.</p><a class="botao" href="#/editar/${encodeURIComponent(id)}">${icone('editar')} Editar registro</a></div></div>`;
    }
    const abas = temReal && temEsboco ? html`<div class="quadro__abas" role="group" aria-label="Tipo de mapa"><button type="button" data-aba="real" aria-pressed="${aba === 'real'}">Mapa real</button><button type="button" data-aba="esboco" aria-pressed="${aba === 'esboco'}">Esboço da folha</button></div>` : '';
    if (aba === 'real' && temReal) {
      return html`<div class="quadro">${abas}<div class="mapa-real" id="mapa-trilha" role="region" aria-label="Mapa do percurso sobre cartografia"></div>
        <div class="mapa-aviso" id="mapa-aviso" ${navigator.onLine ? bruto('hidden') : ''}>Sem conexão: o mapa de fundo não carrega${trajeto ? '; o percurso continua desenhado' : ''}.</div>
        <div class="quadro__legenda"><span>${trajeto ? `Trajeto GPX · ${F.num(trajeto.pontos.length)} pontos${trajeto.arquivo ? ` · ${trajeto.arquivo}` : ''}` : 'Só o ponto de partida informado (sem trajeto)'}</span><span>Use + e − ou dois dedos para ampliar</span></div></div>`;
    }
    const pois = an.pois.filter((p) => p.x != null);
    return html`<div class="quadro">${abas}<div class="esboco ${marcando ? 'esboco--marcando' : ''}" id="esboco">${bruto(folhaSVG(t, { completo: true, pois, titulo: `Esboço do percurso de ${t.nome}` }))}</div>
      <div class="quadro__legenda"><span>${t.fontePerfil === 'print' || (!t.temTrajeto && t.fontes?.distanciaKm === 'print') ? 'Esboço desenhado a partir de print · não é GPS' : 'Esboço normalizado do GPX · sem escala'} · curvas de nível ornamentais</span>
        <span>▲ largada · ◎ chegada · ○ controle por km</span></div>
      <div class="botoes" style="padding:var(--e2) var(--e3);border-top:var(--borda-fina)"><button class="botao ${marcando ? 'botao--primario' : ''}" type="button" id="marcar-ponto" aria-pressed="${marcando}">${icone('alvo')} ${marcando ? 'Toque no esboço…' : 'Marcar ponto'}</button>${marcando ? html`<button class="botao botao--texto" type="button" id="cancelar-marcar">Cancelar</button>` : ''}</div>
      ${poiPendente ? formPOI(poiPendente) : ''}</div>`;
  }

  function formPOI(p) {
    return html`<form id="form-poi" class="grade-campos" style="padding:var(--e3);border-top:var(--borda-fina)">
      <p class="largo" style="margin:0;font-size:var(--t-s)">Novo ponto ${p.km != null ? html`no <strong class="dado">km ${F.num(p.km, 1)}</strong> (aproximado, pelo esboço)` : ''}</p>
      <div class="campo"><label for="p-tipo">Tipo</label><select id="p-tipo" name="tipo">${Object.entries(TIPOS_POI).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
      <div class="campo"><label for="p-nome">Nome</label><input id="p-nome" name="nome" placeholder="Ex.: mirante da pedra"></div>
      <div class="campo largo"><label for="p-nota">Nota</label><input id="p-nota" name="nota" placeholder="Opcional"></div>
      <div class="botoes largo"><button class="botao botao--primario" type="submit">Guardar ponto</button><button class="botao" type="button" id="p-cancelar">Cancelar</button></div></form>`;
  }

  function perfil() {
    const amostras = trajeto ? perfilReal(trajeto.pontos) : null;
    if (amostras) return html`<div class="perfil">${bruto(perfilRealSVG(amostras))}</div><p class="nota-dado">Altitude em função da distância, a partir das elevações do GPX (valores brutos, sem suavização).</p>`;
    if (Array.isArray(t.perfil) && t.perfil.length > 2) {
      return html`<div class="perfil">${bruto(perfilFormaSVG(t.perfil, t.altitudeMax, t.distanciaKm))}</div><p class="nota-dado">Forma do perfil ${t.fontePerfil === 'print' ? 'copiada do gráfico do print' : 'normalizada'}: mostra onde se sobe e desce, mas não tem escala vertical. Só a altitude máxima registrada é rotulada.</p>`;
    }
    return html`<p class="sutil">Perfil altimétrico indisponível: não há dados de elevação suficientes. Importe um GPX com elevação para gerá-lo.</p>`;
  }

  function progressoSecao() {
    const PG = progresso(estado.trilhas);
    const p = PG.porId[id];
    const ehUltima = PG.ultima?.id === id;
    const conquistas = distintivos(estado.trilhas).filter((d) => d.trilhaId === id);
    return html`
      <h3 class="rotulo" style="margin-bottom:var(--e2)">O que esta folha mudou</h3>
      ${p.recordes.length ? html`<ul style="margin:0 0 var(--e4);padding-left:1.1em">${p.recordes.map((r) => html`<li>${r.txt}</li>`)}</ul>` : html`<p class="sutil">Nenhum recorde nesta folha.</p>`}
      ${p.cumprida ? html`<h3 class="rotulo" style="margin-bottom:var(--e2)">Meta da folha anterior</h3><p class="${p.cumprida.ok ? 'positivo' : ''}">${p.cumprida.texto}</p>` : ''}
      ${p.meta.opcoes.length ? html`<div class="meta-bloco" style="margin:var(--e4) 0"><h2>${ehUltima ? 'Próxima meta' : 'A meta que esta folha propôs'}</h2>
        ${p.meta.opcoes.map((o) => html`<div class="meta-op ${o.rec ? 'meta-op--rec' : ''}"><span class="meta-op__marca" aria-hidden="true"></span><span><span class="meta-op__eixo">${o.eixo}${o.rec ? ' · recomendada' : ''}</span><span class="meta-op__alvo">${o.alvoTxt}</span></span><span class="dado sutil" style="font-size:var(--t-xs)">melhor ${o.atualTxt}</span></div>`)}
        <p>${p.meta.porque} Cumprir qualquer uma conta.</p></div>` : ''}
      <h3 class="rotulo" style="margin-bottom:var(--e2)">Leitura</h3>
      <ul style="margin:0;padding-left:1.1em">${leitura(t, estado.trilhas).map((l) => html`<li>${l}</li>`)}</ul>
      ${conquistas.length ? html`<p style="margin-top:var(--e4)"><strong>Marcos conquistados nesta folha:</strong> ${conquistas.map((d) => html`<a href="#/distintivos?d=${d.cod}">${d.nome}</a>`).reduce((a, b) => html`${a}, ${b}`)}.</p>` : ''}`;
  }

  function diario(an) {
    const ficha = [['Clima', t.clima], ['Companhia', t.companhia], ['Terreno', t.terreno], ['Equipamentos', t.equipamentos], ['Dificuldade', t.dificuldade], ['Esforço', t.esforco != null ? `${t.esforco} / 10` : null]];
    return html`<dl class="ficha">${ficha.map(([k, v]) => html`<dt>${k}</dt><dd>${v || F.VAZIO}</dd>`)}</dl>
      ${t.notas ? html`<h3 class="rotulo" style="margin:var(--e4) 0 var(--e2)">Observações do registro</h3><p class="texto-diario">${t.notas}</p>` : ''}
      <div class="campo" style="margin-top:var(--e4)"><label for="relato">Relato da expedição</label><textarea id="relato" style="font:400 1.0625rem/1.6 var(--f-editorial);min-height:160px" placeholder="Escreva como foi o dia, sem pressa. Salva sozinho neste aparelho.">${an.diario.relato}</textarea><span class="ajuda" id="relato-estado" aria-live="polite">${an.diario.relato ? 'Salvo neste aparelho.' : 'Salva automaticamente, mesmo sem internet.'}</span></div>
      <h3 class="rotulo" style="margin:var(--e4) 0 var(--e2)">Registro de campo</h3>
      ${an.diario.entradas.length ? html`<ul class="entradas">${an.diario.entradas.map((e) => html`<li><span class="quando">${e.quando || F.VAZIO}</span><span>${e.texto}</span><button class="botao botao--texto" type="button" data-rm-entrada="${e.id}" aria-label="Remover anotação ${e.quando}">Remover</button></li>`)}</ul>` : html`<p class="sutil" style="font-size:var(--t-s)">Anote marcos por km ou por hora (ex.: "km 4,2 — bica d'água").</p>`}
      <form id="form-entrada" class="grade-campos" style="margin-top:var(--e3);align-items:end"><div class="campo"><label for="e-quando">Km ou hora</label><input id="e-quando" name="quando" placeholder="km 4,2 ou 09:40" style="font-family:var(--f-dados)"></div>
        <div class="campo"><label for="e-texto">Anotação</label><input id="e-texto" name="texto" required></div><div class="botoes largo"><button class="botao" type="submit">Adicionar ao registro</button></div></form>`;
  }

  function galeria(an) {
    return html`<div class="botoes" style="margin-bottom:var(--e3)"><label class="botao" for="add-fotos">${icone('foto')} Adicionar fotos</label><input id="add-fotos" type="file" accept="image/*" multiple class="so-leitor"></div>
      ${fotos.length ? html`<div class="galeria">${fotos.map((f) => html`<figure><img src="${urlFoto(f)}" alt="${f.legenda || `Fotografia de ${t.nome}`}" data-ver="${f.id}" loading="lazy">
        <figcaption><input value="${f.legenda || ''}" placeholder="Legenda" aria-label="Legenda da foto" data-legenda="${f.id}">
          ${an.pois.length ? html`<select data-ponto="${f.id}" aria-label="Ligar a um ponto"><option value="">Sem ponto ligado</option>${an.pois.map((p) => html`<option value="${p.id}" ${p.id === f.pontoId ? bruto('selected') : ''}>${TIPOS_POI[p.tipo]} · ${p.nome || 'sem nome'}</option>`)}</select>` : ''}
          <button class="botao botao--texto" type="button" data-rm-foto="${f.id}" style="justify-self:start;min-height:32px">Remover</button></figcaption></figure>`)}</div>
        <p class="nota-dado">${fotos.length} ${fotos.length === 1 ? 'foto guardada' : 'fotos guardadas'} neste aparelho (${F.bytes(fotos.reduce((s, f) => s + (f.blob?.size || 0), 0))}). Elas entram no arquivo de backup.</p>` : html`<p class="sutil">Nenhuma fotografia ainda.</p>`}`;
  }

  function pontos(an) {
    const lista = an.pois.slice().sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
    return html`${lista.length ? html`<ul class="lista-pois">${lista.map((p) => {
      const nf = fotos.filter((f) => f.pontoId === p.id).length;
      return html`<li><span>${bruto(simboloPOI(p.tipo))}</span><span><strong>${p.nome || TIPOS_POI[p.tipo]}</strong> <span class="sutil dado" style="font-size:var(--t-xs)">${TIPOS_POI[p.tipo]}${p.km != null ? ` · km ${F.num(p.km, 1)}` : ''}${nf ? ` · ${nf} ${nf === 1 ? 'foto' : 'fotos'}` : ''}</span>${p.nota ? html`<br><span style="font-size:var(--t-s)">${p.nota}</span>` : ''}</span>
        <button class="botao botao--texto" type="button" data-rm-poi="${p.id}">Remover</button></li>`;
    })}</ul>` : html`<p class="sutil">Nenhum ponto de interesse marcado.</p>`}
      ${Array.isArray(t.pontos) ? html`<p><button class="botao" type="button" id="ir-marcar">${icone('alvo')} Marcar no esboço ↑</button></p>` : ''}`;
  }

  function alertas(an) {
    const sugerir = /propriedade particular/i.test(t.notas || '') && !an.alertas.some((a) => a.tipo === 'propriedade particular') && !an.descartadas.includes('propriedade particular');
    return html`${sugerir ? html`<div class="pendencias" style="margin-bottom:var(--e3)">As observações mencionam <strong>propriedade particular</strong>. Registrar como alerta para quem for repetir a trilha?
        <div class="botoes" style="margin-top:var(--e2)"><button class="botao" type="button" id="sug-registrar">Registrar</button><button class="botao botao--texto" type="button" id="sug-descartar">Descartar</button></div></div>` : ''}
      ${an.alertas.length ? html`<ul class="lista-pois alertas">${an.alertas.map((a) => html`<li><span><strong class="atencao">${a.tipo}</strong>${a.onde ? html` · <span class="dado" style="font-size:var(--t-xs)">${a.onde}</span>` : ''}${a.nota ? html`<br><span style="font-size:var(--t-s)">${a.nota}</span>` : ''}</span><button class="botao botao--texto" type="button" data-rm-alerta="${a.id}">Remover</button></li>`)}</ul>` : html`<p class="sutil">Nenhum alerta registrado.</p>`}
      <form id="form-alerta" class="grade-campos" style="margin-top:var(--e3);align-items:end">
        <div class="campo"><label for="a-tipo">Tipo de alerta</label><select id="a-tipo" name="tipo">${TIPOS_ALERTA.map((x) => html`<option>${x}</option>`)}</select></div>
        <div class="campo"><label for="a-onde">Onde</label><input id="a-onde" name="onde" placeholder="km 3 ou trecho"></div>
        <div class="campo largo"><label for="a-nota">Nota</label><input id="a-nota" name="nota"></div>
        <div class="botoes largo"><button class="botao" type="submit">Adicionar alerta</button></div></form>`;
  }

  function anotacoes(an) {
    return html`<div class="campo"><label for="tags">Tags</label><input id="tags" value="${an.tags.join(', ')}" placeholder="serra, solo, treino Pico Paraná"><span class="ajuda">Separe por vírgulas. A busca do atlas também encontra tags. Salva ao sair do campo.</span></div>
      ${t.ocorrencias ? html`<h3 class="rotulo" style="margin:var(--e4) 0 var(--e2)">Ocorrências</h3><p class="texto-diario" style="font-size:var(--t-m)">${t.ocorrencias}</p>` : ''}
      ${t.wikiloc ? html`<p style="margin-top:var(--e4)"><a href="${t.wikiloc}" target="_blank" rel="noopener">Abrir a gravação original</a> <span class="sutil" style="font-size:var(--t-xs)">(link externo)</span></p>` : ''}`;
  }

  function desenhar() {
    t = estado.porId.get(id);
    if (!t) { ir('#/atlas'); return; }
    const an = anotacao(id);
    const pend = pendencias(t);
    const { ant, prox } = vizinhos();
    destruirMapa?.(); destruirMapa = null;
    observador?.disconnect();
    montar(main, html`
      <nav class="migalha" aria-label="Trilha de navegação"><a href="#/atlas">${icone('voltar')} Atlas</a><span aria-hidden="true">/</span><span>${F.numero(t.numero)}</span></nav>
      <header class="trilha-cab">
        <div class="trilha-cab__linha"><span>REG. ${F.numero(t.numero)}</span><span>ID ${t.id}</span>${selo(t)}${an.favorito ? html`<span class="selo" style="color:var(--texto)">Favorita</span>` : ''}${pend.length ? html`<span class="selo selo--falta">faltam ${pend.length}</span>` : ''}</div>
        <h1>${t.nome}</h1>
        <p class="local" style="margin:0">${t.local || F.VAZIO}${t.regiao ? ` · ${t.regiao}` : ''}</p>
        <div class="trilha-cab__linha"><span>${F.data(t.data)}</span><span>${t.categoria || 'categoria —'}</span><span>origem: ${t.origem === 'base' ? 'arquivo base' : 'este aparelho'}${t.editadoLocal ? ' (editado aqui)' : ''}</span>${t.atualizadoEm ? html`<span>atualizado ${F.data(t.atualizadoEm.slice(0, 10))}</span>` : ''}</div>
        <div class="acoes">
          <a class="botao" href="#/editar/${encodeURIComponent(id)}">${icone('editar')} Editar</a>
          <button class="botao" type="button" id="favoritar" aria-pressed="${an.favorito}">${icone('estrela')} ${an.favorito ? 'Favorita' : 'Favoritar'}</button>
          <a class="botao" href="#/nova?de=${encodeURIComponent(id)}">${icone('duplicar')} Duplicar</a>
          <button class="botao" type="button" id="exportar">${icone('exportar')} Exportar</button>
          ${t.editadoLocal ? html`<button class="botao" type="button" id="descartar-edicao">Desfazer edição local</button>` : ''}
          <button class="botao botao--perigo" type="button" id="excluir">${icone('lixo')} Excluir</button>
        </div>
      </header>
      <nav class="menu-secoes" aria-label="Seções da folha">${SECOES.map(([k, r]) => html`<a href="#s-${k}" data-secao-link="${k}">${r}</a>`)}</nav>

      <section id="s-folha" class="secao" data-secao="folha" aria-labelledby="h-folha">
        <h2 class="secao-titulo" id="h-folha"><span class="controle">1</span> Folha</h2>
        ${pend.length ? html`<p class="pendencias">Dados faltando: ${F.juntar(pend)}. <a href="#/editar/${encodeURIComponent(id)}">Completar agora</a>${t.origem === 'base' ? html` ou peça no chat: <code class="dado">corrigir ${t.nome}</code>` : ''}.</p>` : ''}
        <div class="trilha-grade">
          <div>${quadroMapa(an)}</div>
          <div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--e2)"><h3 class="rotulo">Resumo técnico</h3><span style="width:40px;color:var(--texto-sutil)">${bruto(rosaDosVentosSVG)}</span></div>${resumo()}</div>
        </div>
        <h3 class="rotulo" style="margin:var(--e5) 0 var(--e2)">Perfil altimétrico</h3>
        ${perfil()}
      </section>
      <section id="s-progresso" class="secao" data-secao="progresso" aria-labelledby="h-progresso"><h2 class="secao-titulo" id="h-progresso"><span class="controle">2</span> Progresso</h2>${progressoSecao()}</section>
      <section id="s-diario" class="secao" data-secao="diario" aria-labelledby="h-diario"><h2 class="secao-titulo" id="h-diario"><span class="controle">3</span> Diário de campo</h2>${diario(an)}</section>
      <section id="s-fotos" class="secao" data-secao="fotos" aria-labelledby="h-fotos"><h2 class="secao-titulo" id="h-fotos"><span class="controle">4</span> Fotografias</h2>${galeria(an)}</section>
      <section id="s-pontos" class="secao" data-secao="pontos" aria-labelledby="h-pontos"><h2 class="secao-titulo" id="h-pontos"><span class="controle">5</span> Pontos de interesse</h2>${pontos(an)}</section>
      <section id="s-alertas" class="secao" data-secao="alertas" aria-labelledby="h-alertas"><h2 class="secao-titulo" id="h-alertas"><span class="controle">6</span> Alertas</h2>${alertas(an)}</section>
      <section id="s-anotacoes" class="secao" data-secao="anotacoes" aria-labelledby="h-anotacoes"><h2 class="secao-titulo" id="h-anotacoes"><span class="controle">7</span> Anotações</h2>${anotacoes(an)}</section>
      <nav class="nav-folhas" aria-label="Folhas vizinhas na ordem do índice">
        ${ant ? html`<a href="#/trilha/${encodeURIComponent(ant.id)}"><span class="rotulo">← Anterior · ${F.numero(ant.numero)}</span><span class="editorial">${ant.nome}</span></a>` : html`<span><span class="rotulo">Início do índice</span></span>`}
        ${prox ? html`<a href="#/trilha/${encodeURIComponent(prox.id)}"><span class="rotulo">Próxima · ${F.numero(prox.numero)} →</span><span class="editorial">${prox.nome}</span></a>` : html`<span><span class="rotulo">Fim do índice</span></span>`}
      </nav>`);
    ligar();
    montarMapa();
    observarSecoes();
  }

  async function montarMapa() {
    const el = $('#mapa-trilha');
    if (!el) return;
    try {
      const m = await criarMapa(el, { aoFalharTiles: () => { const a = $('#mapa-aviso'); if (a) a.hidden = false; } });
      if (!document.body.contains(el)) { m.destruir(); return; }
      destruirMapa = m.destruir;
      if (trajeto?.pontos?.length) {
        const g = desenharPercurso(m.L, m.mapa, trajeto.pontos, { nome: t.nome });
        for (const w of trajeto.waypoints || []) m.L.circleMarker([w.lat, w.lon], { radius: 4, color: getComputedStyle(document.documentElement).getPropertyValue('--c-terracota'), weight: 2, fillOpacity: 0.2 }).bindTooltip(w.nome || 'waypoint').addTo(m.mapa);
        m.mapa.fitBounds(g.getBounds(), { padding: [20, 20] });
      } else {
        marcarLocal(m.L, m.mapa, t.coordInicio, `Partida · ${t.nome}`);
        m.mapa.setView(t.coordInicio, 14);
      }
    } catch (e) {
      montar(el, html`<div class="sem-mapa"><p>O mapa não pôde ser carregado: ${e.message}</p></div>`);
    }
  }

  function observarSecoes() {
    const links = new Map($$('[data-secao-link]').map((a) => [a.dataset.secaoLink, a]));
    observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) if (e.isIntersecting) { links.forEach((a) => a.removeAttribute('aria-current')); links.get(e.target.dataset.secao)?.setAttribute('aria-current', 'true'); }
    }, { rootMargin: '-120px 0px -60% 0px' });
    $$('[data-secao]').forEach((s) => observador.observe(s));
  }

  const salvarAn = (fn, msg) => atualizarAnotacao(id, fn).then(() => { if (msg) avisar(msg); }).catch((e) => avisar(e.message, 'erro'));

  async function exportar() {
    const r = await dialogo({
      titulo: 'Exportar registro',
      corpo: html`<p>Escolha o formato. Os arquivos ficam no seu aparelho e podem ser abertos em outros aplicativos.</p>
        <ul style="margin:0;padding-left:1.1em;font-size:var(--t-s)"><li><strong>GPX</strong>: o trajeto original com elevação e horários${trajeto ? '' : ' (indisponível: este registro não tem trajeto GPX)'}.</li><li><strong>JSON</strong>: o registro completo com diário, pontos e alertas (sem fotos).</li><li><strong>Copiar como registro</strong>: objeto no formato de <code>dados/trilhas.js</code>, para colar no chat e promover à base.</li></ul>`,
      botoes: [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'base', texto: 'Copiar como registro' }, { valor: 'json', texto: 'JSON' }, ...(trajeto ? [{ valor: 'gpx', texto: 'GPX', primario: true }] : [])],
    });
    const nomeArq = t.id;
    if (r === 'gpx') baixar(gerarGPX(t, trajeto.pontos), `${nomeArq}.gpx`, 'application/gpx+xml');
    if (r === 'json') baixar(JSON.stringify({ formato: 'atlas-selvagem-registro', versao: 1, exportadoEm: new Date().toISOString(), trilha: t, anotacao: anotacao(id) }, null, 2), `${nomeArq}.json`, 'application/json');
    if (r === 'base') { const ok = await copiarTexto(`${JSON.stringify(comoRegistroBase(t), null, 2)},`); avisar(ok ? 'Registro copiado. Cole no chat para promover à base.' : 'Não foi possível copiar automaticamente.', ok ? 'info' : 'erro'); }
  }

  function ligar() {
    $('#favoritar').addEventListener('click', () => salvarAn((a) => { a.favorito = !a.favorito; return a; }));
    $('#exportar').addEventListener('click', exportar);
    $('#descartar-edicao')?.addEventListener('click', async () => {
      if (await confirmar('Desfazer edição local?', 'O registro volta a mostrar os dados do arquivo base. Diário, fotos e pontos são mantidos.', { confirmar: 'Desfazer edição' })) { await descartarEdicaoLocal(id); avisar('Edição local desfeita.'); }
    });
    $('#excluir').addEventListener('click', async () => {
      const nf = fotos.length;
      const texto = `"${t.nome}" (${F.numero(t.numero)}) será removida deste aparelho${nf ? ` junto com ${nf} ${nf === 1 ? 'foto' : 'fotos'}` : ''}, diário, pontos e trajeto. Isso não pode ser desfeito, exceto restaurando um backup.${ehDaBase(id) ? ' Como o registro vem do arquivo base, ele fica oculto aqui; para removê-lo de vez, peça no chat.' : ''}`;
      if (!(await confirmar('Excluir esta trilha?', texto, { confirmar: 'Excluir definitivamente', perigo: true }))) return;
      try { await excluirTrilha(id); avisar('Trilha excluída.'); ir('#/atlas'); } catch (e) { avisar(e.message, 'erro'); }
    });
    $$('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; marcando = false; poiPendente = null; desenhar(); }));
    const ativarMarcacao = () => { aba = 'esboco'; marcando = true; poiPendente = null; desenhar(); $('#esboco')?.scrollIntoView({ block: 'center' }); avisar('Toque no esboço onde fica o ponto.'); };
    $('#marcar-ponto')?.addEventListener('click', () => { if (marcando) { marcando = false; desenhar(); } else ativarMarcacao(); });
    $('#ir-marcar')?.addEventListener('click', ativarMarcacao);
    $('#cancelar-marcar')?.addEventListener('click', () => { marcando = false; desenhar(); });
    $('#esboco svg')?.addEventListener('click', (e) => {
      if (!marcando) return;
      const svg = e.currentTarget;
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const enc = encaixarNoTracado(t.pontos, t.distanciaKm, loc.x, loc.y);
      if (!enc) return;
      poiPendente = enc; marcando = false; desenhar();
      $('#p-nome')?.focus();
    });
    $('#form-poi')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const p = { id: crypto.randomUUID(), tipo: d.tipo, nome: d.nome.trim(), nota: d.nota.trim(), x: poiPendente.x, y: poiPendente.y, km: poiPendente.km };
      poiPendente = null;
      salvarAn((a) => { a.pois.push(p); return a; }, 'Ponto guardado.');
    });
    $('#p-cancelar')?.addEventListener('click', () => { poiPendente = null; desenhar(); });

    let espera;
    const relato = $('#relato');
    const estadoRelato = $('#relato-estado');
    const gravarRelato = () => atualizarAnotacao(id, (a) => { a.diario.relato = relato.value; return a; })
      .then(() => { estadoRelato.textContent = `Salvo neste aparelho às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`; })
      .catch((e) => { estadoRelato.textContent = `Não foi possível salvar: ${e.message}`; });
    relato.addEventListener('input', () => { estadoRelato.textContent = 'Salvando…'; clearTimeout(espera); espera = setTimeout(gravarRelato, 700); });
    relato.addEventListener('blur', () => { clearTimeout(espera); if (relato.value !== anotacao(id).diario.relato) gravarRelato(); });

    $('#form-entrada').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (!d.texto.trim()) return;
      salvarAn((a) => { a.diario.entradas.push({ id: crypto.randomUUID(), quando: d.quando.trim(), texto: d.texto.trim() }); return a; }, 'Anotação adicionada.');
    });
    $$('[data-rm-entrada]').forEach((b) => b.addEventListener('click', () => salvarAn((a) => { a.diario.entradas = a.diario.entradas.filter((x) => x.id !== b.dataset.rmEntrada); return a; })));

    $('#add-fotos').addEventListener('change', async (e) => {
      const arqs = [...e.target.files];
      if (!arqs.length) return;
      avisar(`Otimizando ${arqs.length} ${arqs.length === 1 ? 'foto' : 'fotos'}…`);
      const r = await adicionarFotos(id, arqs).catch((err) => ({ adicionadas: 0, erros: [err.message] }));
      fotos = await fotosDa(id);
      if (r.erros.length) avisar(r.erros.join(' '), 'erro', 8000); else avisar(`${r.adicionadas} ${r.adicionadas === 1 ? 'foto adicionada' : 'fotos adicionadas'}.`);
      desenhar();
    });
    $$('[data-ver]').forEach((img) => img.addEventListener('click', () => visorImagem(img.src, img.alt)));
    $$('[data-legenda]').forEach((inp) => inp.addEventListener('change', async () => { const f = fotos.find((x) => x.id === inp.dataset.legenda); f.legenda = inp.value.trim(); await atualizarFoto(f); }));
    $$('[data-ponto]').forEach((s) => s.addEventListener('change', async () => { const f = fotos.find((x) => x.id === s.dataset.ponto); f.pontoId = s.value || null; await atualizarFoto(f); desenhar(); }));
    $$('[data-rm-foto]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('Remover foto?', 'A foto será apagada deste aparelho.', { confirmar: 'Remover', perigo: true }))) return;
      const f = fotos.find((x) => x.id === b.dataset.rmFoto);
      await removerFoto(f);
      URL.revokeObjectURL(urls.get(f.id)); urls.delete(f.id);
      fotos = await fotosDa(id);
      desenhar();
    }));
    $$('[data-rm-poi]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('Remover ponto?', 'As fotos ligadas a ele continuam guardadas.', { confirmar: 'Remover' }))) return;
      salvarAn((a) => { a.pois = a.pois.filter((p) => p.id !== b.dataset.rmPoi); return a; });
    }));
    $('#sug-registrar')?.addEventListener('click', () => salvarAn((a) => { a.alertas.push({ id: crypto.randomUUID(), tipo: 'propriedade particular', onde: '', nota: 'Sugerido a partir das observações.' }); return a; }, 'Alerta registrado.'));
    $('#sug-descartar')?.addEventListener('click', () => salvarAn((a) => { a.descartadas.push('propriedade particular'); return a; }));
    $('#form-alerta').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      salvarAn((a) => { a.alertas.push({ id: crypto.randomUUID(), tipo: d.tipo, onde: d.onde.trim(), nota: d.nota.trim() }); return a; }, 'Alerta adicionado.');
    });
    $$('[data-rm-alerta]').forEach((b) => b.addEventListener('click', () => salvarAn((a) => { a.alertas = a.alertas.filter((x) => x.id !== b.dataset.rmAlerta); return a; })));
    $('#tags').addEventListener('change', (e) => {
      const tags = [...new Set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))];
      salvarAn((a) => { a.tags = tags; return a; }, 'Tags salvas.');
    });
    $$('[data-secao-link]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(`s-${a.dataset.secaoLink}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }));
  }

  desenhar();
  // Redesenha em mudanças vindas de outras ações, preservando o foco no relato e a rolagem.
  const sair = assinar(() => {
    if (document.activeElement?.id === 'relato' || document.activeElement?.id === 'tags') return;
    const y = window.scrollY;
    desenhar();
    window.scrollTo({ top: y });
  });
  const aoTema = () => { if (aba === 'real') desenhar(); };
  window.addEventListener('atlas:tema', aoTema);
  return () => { sair(); window.removeEventListener('atlas:tema', aoTema); destruirMapa?.(); observador?.disconnect(); urls.forEach((u) => URL.revokeObjectURL(u)); };
}
