// Arquivo e configurações: backup e restauração, exportações, instalação, armazenamento e preferências.

import { estado, carregar, restaurarOcultas, criarFolhaEmBranco } from '../estado.js';
import { html, montar, icone, $, bruto, avisar, confirmar, lerArquivoTexto, dialogo } from '../ui.js';
import * as F from '../formato.js';
import { gerarBackup, analisarBackup, restaurar, gerarCSV, baixar } from '../backup.js';
import { estimativa, pedirPersistencia, todos, lerMeta, gravarMeta } from '../armazenamento.js';
import { prefs, definir, aplicarTema } from '../preferencias.js';
import { CAMADAS } from '../mapa.js';
import { pwa, assinarPWA, instalar, plataforma, modoStandalone, procurarAtualizacao, aplicarAtualizacao } from '../pwa.js';
import { VERSAO_APP } from '../versao.js';

export async function render({ main, rota }) {
  let est = await estimativa();
  let ultimoBackup = await lerMeta('ultimoBackup', null);
  const ocultas = await todos('ocultas').catch(() => []);

  function blocoInstalar() {
    if (pwa.instalado || modoStandalone()) return html`<p class="positivo">O Atlas está aberto como aplicativo instalado.</p>`;
    if (pwa.eventoInstalar) return html`<p>Este navegador permite instalar o Atlas como aplicativo, com ícone próprio e janela sem barra de endereço.</p><div class="botoes"><button class="botao botao--primario" type="button" id="instalar">${icone('instalar')} Instalar o Atlas</button></div>`;
    const p = plataforma();
    const passos = p === 'ios'
      ? 'No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".'
      : p === 'android' ? 'No Chrome, abra o menu ⋮ e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".'
        : 'No Chrome ou Edge, use o ícone de instalação na barra de endereço ou o menu → "Instalar Atlas Selvagem". Firefox para desktop não instala PWAs.';
    return html`<p>${passos}</p><p class="nota-dado">A instalação só aparece quando o site é servido por HTTPS (ou em localhost).</p>`;
  }

  function desenhar() {
    const p = prefs();
    const nLocais = estado.trilhas.filter((t) => t.origem === 'local').length;
    const nEditadas = estado.trilhas.filter((t) => t.editadoLocal).length;
    const nFotos = Object.values(estado.fotosPorTrilha).reduce((s, n) => s + n, 0);
    montar(main, html`<h1 class="titulo-pagina">Arquivo e configurações</h1>
    <p class="sutil" style="max-width:68ch">Seus registros pessoais ficam no banco local deste navegador (IndexedDB). Eles não são enviados a nenhum servidor e não sincronizam sozinhos entre aparelhos. O backup é a sua garantia: guarde o arquivo em um lugar seguro.</p>
    <div class="config">
      <section aria-labelledby="h-backup"><h2 id="h-backup">Backup e restauração</h2>
        <dl class="ficha"><dt>Criadas aqui</dt><dd class="dado">${nLocais}</dd><dt>Da base, editadas aqui</dt><dd class="dado">${nEditadas}</dd><dt>Fotos</dt><dd class="dado">${nFotos}</dd><dt>Último backup</dt><dd class="dado">${ultimoBackup ? F.data(ultimoBackup.slice(0, 10)) : 'nunca'}</dd></dl>
        <div class="botoes"><button class="botao botao--primario" type="button" id="exportar-backup">${icone('exportar')} Exportar backup completo</button>
          <label class="botao" for="arquivo-backup">${icone('importar')} Restaurar backup…</label><input id="arquivo-backup" type="file" class="so-leitor"></div>
        <p class="nota-dado">O backup é um arquivo JSON com registros, diário, pontos, alertas, trajetos GPX e fotos (embutidas em base64). Os registros do arquivo base do projeto não entram porque já estão no código. A restauração valida o arquivo e mostra os conflitos antes de gravar.</p>
      </section>
      <section aria-labelledby="h-exportar"><h2 id="h-exportar">Exportar dados</h2>
        <p>Planilha com todos os registros (sem fotos), para abrir no Excel, Numbers ou LibreOffice.</p>
        <div class="botoes"><button class="botao" type="button" id="exportar-csv">${icone('exportar')} Exportar CSV</button></div>
        <p class="nota-dado">Cada trilha também pode ser exportada como GPX (quando tem trajeto) ou JSON na própria página dela.</p>
      </section>
      <section aria-labelledby="h-armaz"><h2 id="h-armaz">Armazenamento</h2>
        ${est ? html`<p><span class="dado">${F.bytes(est.usado)}</span> usados de cerca de <span class="dado">${F.bytes(est.cota)}</span> disponíveis para este site.</p>
          <div class="medidor" role="img" aria-label="${F.num((est.usado / est.cota) * 100, 1)}% usado"><span style="width:${Math.min(100, Math.max(0.5, (est.usado / est.cota) * 100))}%"></span></div>
          <p>${est.persistente ? html`<span class="positivo">Armazenamento persistente concedido:</span> o navegador não apaga os dados para liberar espaço.` : html`Armazenamento <strong>não persistente</strong>: sob pouco espaço, o navegador pode apagar dados de sites. <button class="botao botao--texto" type="button" id="persistir">Pedir persistência</button>`}</p>` : html`<p class="sutil">Este navegador não informa o uso de armazenamento.</p>`}
        <p class="nota-dado">Fotos são reduzidas para até 1600 px antes de guardar (em geral 200–600 KB cada). Limpar os dados do site no navegador apaga tudo — exporte um backup antes.</p>
        ${ocultas.length ? html`<p>${ocultas.length} ${ocultas.length === 1 ? 'registro da base está oculto' : 'registros da base estão ocultos'} neste aparelho. <button class="botao botao--texto" type="button" id="restaurar-ocultas">Mostrar de novo</button></p>` : ''}
      </section>
      <section aria-labelledby="h-instalar"><h2 id="h-instalar">Instalar e usar offline</h2>
        <div id="bloco-instalar">${blocoInstalar()}</div>
        <p>Versão em uso neste aparelho: <strong class="dado">${VERSAO_APP}</strong></p>
        <div class="botoes"><button class="botao" type="button" id="procurar-atualizacao">Procurar atualização</button></div>
        <p>${pwa.suportaSW ? (pwa.offlinePronto ? html`<span class="positivo">Pronto para uso offline:</span> o aplicativo está guardado neste aparelho.` : 'Preparando o uso offline… recarregue a página uma vez com conexão.') : 'Este navegador não oferece service worker; o uso offline não está disponível.'}</p>
        <p class="nota-dado">Sem conexão funcionam: atlas, lista, detalhes, diário, fotos, estatísticas, cadastro e edição. O mapa de fundo depende de internet e não é guardado offline (por respeito às regras de uso dos servidores de mapas).</p>
      </section>
      <section aria-labelledby="h-vis"><h2 id="h-vis">Visualização</h2>
        <div class="campo"><label for="pref-tema">Tema</label><select id="pref-tema">${[['sistema', 'Seguir o sistema'], ['claro', 'Claro — papel'], ['escuro', 'Escuro — mesa noturna']].map(([v, r]) => html`<option value="${v}" ${p.tema === v ? bruto('selected') : ''}>${r}</option>`)}</select></div>
        <div class="campo"><label for="pref-camada">Mapa de fundo</label><select id="pref-camada">${Object.entries(CAMADAS).map(([k, c]) => html`<option value="${k}" ${p.camada === k ? bruto('selected') : ''}>${c.nome}</option>`)}</select><span class="ajuda">Serviços públicos e gratuitos, sem chave. Use com moderação: não são feitos para uso intenso.</span></div>
      </section>
      <section aria-labelledby="h-fb" id="folha-em-branco"><h2 id="h-fb">Nova folha em branco</h2>
        <p class="sutil" style="font-size:var(--t-s)">Uma trilha que você quer fazer. Ela aparece no atlas com a distância em "degraus" do seu nível atual.</p>
        <form id="form-fb" class="grade-campos">
          <div class="campo largo"><label for="fb-nome">Nome <span class="obrig" aria-hidden="true">*</span></label><input id="fb-nome" name="nome" required></div>
          <div class="campo largo"><label for="fb-local">Local</label><input id="fb-local" name="local"></div>
          <div class="campo campo--unidade"><label for="fb-km">Distância</label><input id="fb-km" name="distanciaKm" type="number" step="0.1" min="0" inputmode="decimal"><span class="unidade">km</span></div>
          <div class="campo campo--unidade"><label for="fb-sub">Subida</label><input id="fb-sub" name="desnivelPos" type="number" step="1" min="0" inputmode="numeric"><span class="unidade">m</span></div>
          <div class="campo campo--unidade"><label for="fb-alt">Altitude máxima</label><input id="fb-alt" name="altitudeMax" type="number" step="1" inputmode="numeric"><span class="unidade">m</span></div>
          <div class="campo"><label for="fb-fonte">Fonte dos números</label><input id="fb-fonte" name="fonte" placeholder="Ex.: placa do parque"></div>
          <div class="campo largo"><label for="fb-nota">Nota</label><input id="fb-nota" name="nota"></div>
          <div class="botoes largo"><button class="botao" type="submit">Criar folha em branco</button></div></form>
      </section>
      <section aria-labelledby="h-sobre"><h2 id="h-sobre">Sobre</h2>
        <p class="editorial" style="font-size:var(--t-l)">Atlas Selvagem · Vol. 01</p>
        <p class="sutil" style="font-size:var(--t-s)">Tipografia: Cinzel Decorative, IM Fell English, Inter e IBM Plex Mono (SIL Open Font License), servidas localmente. Mapas: Leaflet (BSD-2), dados © colaboradores do OpenStreetMap, estilo OpenTopoMap (CC-BY-SA).</p>
        <div class="botoes"><a class="botao" href="#/saida">${icone('saida')} Folha de saída</a><a class="botao" href="#/distintivos">${icone('distintivo')} Distintivos</a></div>
      </section>
    </div>`);
    ligar();
  }

  async function iniciarRestauracao(arquivo) {
    let a;
    try { a = await analisarBackup(await lerArquivoTexto(arquivo)); } catch (e) { avisar(`Não foi possível ler o arquivo: ${e.message}`, 'erro'); return; }
    if (!a.ok) { await dialogo({ titulo: 'Backup inválido', corpo: a.erros.join(' ') }); return; }
    const d = a.dados;
    const corpo = html`<dl class="ficha"><dt>Exportado em</dt><dd class="dado">${d.exportadoEm ? new Date(d.exportadoEm).toLocaleString('pt-BR') : F.VAZIO}</dd><dt>Registros</dt><dd class="dado">${d.trilhas.length}</dd><dt>Anotações</dt><dd class="dado">${d.anotacoes.length}</dd><dt>Trajetos GPX</dt><dd class="dado">${d.trajetos.length}</dd><dt>Fotos</dt><dd class="dado">${d.fotos.length}</dd></dl>
      ${a.conflitos.length ? html`<div class="pendencias"><strong>${a.conflitos.length} ${a.conflitos.length === 1 ? 'registro já existe' : 'registros já existem'} neste aparelho:</strong><ul style="margin:4px 0 0;padding-left:1.1em">${a.conflitos.slice(0, 8).map((c) => html`<li>${c.nome} — ${c.backupMaisNovo ? 'a versão do backup é mais nova' : 'a versão daqui é igual ou mais nova'}</li>`)}</ul></div>` : ''}
      ${a.avisos.length ? html`<p class="atencao" style="font-size:var(--t-s)">${a.avisos.slice(0, 5).join(' ')}</p>` : ''}
      <p style="font-size:var(--t-s)"><strong>Mesclar</strong> acrescenta o que falta e, em conflito, mantém a versão mais recente. <strong>Substituir tudo</strong> apaga a camada pessoal deste aparelho e grava só o backup.</p>`;
    const modo = await dialogo({ titulo: 'Restaurar backup', corpo, botoes: [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'substituir', texto: 'Substituir tudo', perigo: true }, { valor: 'mesclar', texto: 'Mesclar', primario: true }] });
    if (modo !== 'mesclar' && modo !== 'substituir') return;
    if (modo === 'substituir' && !(await confirmar('Substituir tudo?', 'Todos os registros pessoais, fotos e anotações deste aparelho serão apagados e trocados pelo conteúdo do backup.', { confirmar: 'Apagar e restaurar', perigo: true }))) return;
    try {
      await restaurar(d, modo);
      await carregar();
      avisar('Backup restaurado.');
      est = await estimativa();
      desenhar();
    } catch (e) { avisar(e.message, 'erro', 9000); }
  }

  function ligar() {
    $('#exportar-backup').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const dados = await gerarBackup();
        baixar(JSON.stringify(dados), `atlas-selvagem-backup-${F.hojeISO()}.json`, 'application/json');
        ultimoBackup = dados.exportadoEm;
        await gravarMeta('ultimoBackup', ultimoBackup);
        avisar(`Backup gerado: ${dados.contagem.trilhas} registros, ${dados.contagem.fotos} fotos.`);
        desenhar();
      } catch (err) { avisar(`Falha ao gerar backup: ${err.message}`, 'erro'); b.disabled = false; }
    });
    $('#arquivo-backup').addEventListener('change', (e) => { const a = e.target.files[0]; e.target.value = ''; if (a) iniciarRestauracao(a); });
    $('#exportar-csv').addEventListener('click', () => baixar(gerarCSV(estado.trilhas, estado.anotacoes), `atlas-selvagem-${F.hojeISO()}.csv`, 'text/csv;charset=utf-8'));
    $('#persistir')?.addEventListener('click', async () => { const ok = await pedirPersistencia(); avisar(ok ? 'Persistência concedida.' : 'O navegador recusou a persistência (comum antes de instalar o app).', ok ? 'info' : 'erro'); est = await estimativa(); desenhar(); });
    $('#restaurar-ocultas')?.addEventListener('click', async () => { await restaurarOcultas(); avisar('Registros da base visíveis de novo.'); desenhar(); });
    $('#procurar-atualizacao')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Procurando…';
      const r = await procurarAtualizacao();
      b.disabled = false; b.textContent = 'Procurar atualização';
      if (r === 'nova') {
        if (await confirmar('Nova versão disponível', 'Atualizar agora? O app recarrega; seus dados ficam guardados.', { confirmar: 'Atualizar' })) aplicarAtualizacao();
      } else if (r === 'atual') avisar(`Você já está na versão mais recente publicada (${VERSAO_APP}).`);
      else avisar('Não foi possível procurar agora. Confira a conexão e tente de novo.', 'erro');
    });
    $('#instalar')?.addEventListener('click', async () => { const r = await instalar(); if (r === 'accepted') avisar('Instalação iniciada.'); });
    $('#pref-tema').addEventListener('change', (e) => { definir('tema', e.target.value); aplicarTema(); window.dispatchEvent(new CustomEvent('atlas:tema')); });
    $('#pref-camada').addEventListener('change', (e) => { definir('camada', e.target.value); avisar('Mapa de fundo alterado.'); });
    $('#form-fb').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (!d.nome.trim()) { $('#fb-nome').focus(); return; }
      const n = (v) => (v === '' ? null : Number(v));
      await criarFolhaEmBranco({ nome: d.nome.trim(), local: d.local.trim() || null, distanciaKm: n(d.distanciaKm), desnivelPos: n(d.desnivelPos), altitudeMax: n(d.altitudeMax), fonte: d.fonte.trim() || null, nota: d.nota.trim() || null });
      avisar('Folha em branco criada. Ela aparece no atlas.');
      e.target.reset();
    });
  }

  desenhar();
  if (rota.query.get('secao') === 'folha-em-branco') setTimeout(() => { $('#folha-em-branco')?.scrollIntoView(); $('#fb-nome')?.focus({ preventScroll: true }); }, 0);
  const sair = assinarPWA(() => { const b = $('#bloco-instalar'); if (b) montar(b, blocoInstalar()); });
  return sair;
}
