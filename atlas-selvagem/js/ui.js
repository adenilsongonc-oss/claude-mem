// Utilitários de interface: template HTML com escape automático, ícones, diálogos e avisos.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Bruto { constructor(s) { this.s = s; } toString() { return this.s; } }
export const bruto = (s) => new Bruto(String(s ?? ''));

const valor = (v) => {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Bruto) return v.s;
  if (Array.isArray(v)) return v.map(valor).join('');
  return esc(v);
};

// html`<p>${texto}</p>` escapa interpolações; use bruto() só para HTML/SVG gerado pelo próprio app.
export function html(partes, ...vals) {
  let s = partes[0];
  for (let i = 0; i < vals.length; i++) s += valor(vals[i]) + partes[i + 1];
  return new Bruto(s);
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

export function montar(el, conteudo) { el.innerHTML = String(conteudo); return el; }

// ---------- Ícones (traço de 1,5 px, desenhados para o app) ----------
const I = {
  atlas: '<path d="M3 5.5 9 3l6 2.5L21 3v15.5L15 21l-6-2.5L3 21z"/><path d="M9 3v15.5M15 5.5V21"/>',
  mapa: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  estat: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  arquivo: '<path d="M3 7h18v13H3zM2 4h20v3H2zM9 11h6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  filtro: '<path d="M3 5h18M6 12h12M10 19h4"/>',
  setaCima: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  setaBaixo: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  duplicar: '<path d="M8 8h12v12H8z"/><path d="M4 16V4h12"/>',
  exportar: '<path d="M12 3v12M7 8l5-5 5 5M4 15v6h16v-6"/>',
  importar: '<path d="M12 15V3M7 10l5 5 5-5M4 15v6h16v-6"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  estrela: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  avancar: '<path d="M9 5l7 7-7 7"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  enquadrar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  camada: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  folha: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
  saida: '<path d="M4 4h10v16H4z"/><path d="M14 12h7M18 9l3 3-3 3"/>',
  distintivo: '<path d="M12 3 4 7v6c0 4 3.5 6.8 8 8 4.5-1.2 8-4 8-8V7z"/><path d="m9 12 2 2 4-4"/>',
  copiar: '<path d="M9 9h11v11H9z"/><path d="M5 15H4V4h11v1"/>',
  instalar: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  foto: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
};
export const icone = (nome, rotulo) => bruto(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${rotulo ? `role="img" aria-label="${esc(rotulo)}"` : 'aria-hidden="true" focusable="false"'}>${I[nome] || ''}</svg>`);

// ---------- Avisos ----------
export function avisar(texto, tipo = 'info', ms = 4200) {
  let caixa = $('#avisos');
  if (!caixa) return;
  const el = document.createElement('div');
  el.className = `aviso${tipo === 'erro' ? ' aviso--erro' : ''}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.textContent = texto;
  caixa.append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- Diálogos ----------
// Retorna o valor do botão clicado (ou null se fechado com Esc).
export function dialogo({ titulo, corpo = '', botoes = [{ valor: 'ok', texto: 'OK', primario: true }], aoAbrir }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialogo';
    d.setAttribute('aria-labelledby', 'dlg-titulo');
    montar(d, html`<form method="dialog">
      <div class="dialogo__corpo"><h2 id="dlg-titulo">${titulo}</h2>${typeof corpo === 'string' ? html`<p>${corpo}</p>` : corpo}</div>
      <div class="dialogo__acoes">${botoes.map((b) => html`<button class="botao ${b.primario ? 'botao--primario' : ''} ${b.perigo ? 'botao--perigo' : ''}" value="${b.valor}">${b.texto}</button>`)}</div>
    </form>`);
    document.body.append(d);
    d.addEventListener('close', () => { const v = d.returnValue || null; d.remove(); resolve(v === '' ? null : v); }, { once: true });
    d.showModal();
    aoAbrir?.(d);
  });
}

export async function confirmar(titulo, texto, { confirmar: ok = 'Confirmar', perigo = false } = {}) {
  const r = await dialogo({ titulo, corpo: texto, botoes: [{ valor: 'nao', texto: 'Cancelar' }, { valor: 'sim', texto: ok, primario: !perigo, perigo }] });
  return r === 'sim';
}

export function visorImagem(url, legenda) {
  const d = document.createElement('dialog');
  d.className = 'visor';
  montar(d, html`<form method="dialog"><button class="botao-icone" style="position:absolute;right:0;top:0;color:#fff" aria-label="Fechar">${icone('fechar')}</button></form><img src="${url}" alt="${legenda || 'Fotografia'}">`);
  document.body.append(d);
  d.addEventListener('close', () => d.remove(), { once: true });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
}

export async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: texto });
    document.body.append(ta); ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    return !!ok;
  }
}

export const lerArquivoTexto = (arquivo) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsText(arquivo);
});
