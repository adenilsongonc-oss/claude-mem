// Desenhos SVG do Atlas: folha (esboço do percurso), curvas de nível decorativas, perfil altimétrico,
// gráficos, rosa dos ventos, marca e símbolos. Tudo gerado a partir de dados registrados; nada aleatório
// é apresentado como mapa. Curvas de nível do esboço são ornamentais e marcadas como tal.

import { esc } from './ui.js';
import { controlesPorKm } from './calculos.js';
import { num } from './formato.js';

const r1 = (v) => Math.round(v * 10) / 10;

function semente(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

// Anéis ornamentais ao redor do cume (determinísticos pelo id). Mestra a cada cinco.
export function curvasDecorativas(cx, cy, id, escala = 1) {
  let s = semente(id) % 2147483647;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const fino = [], mestra = [];
  [4, 8, 12.5, 17, 22, 27.5, 33, 39, 45.5, 52].forEach((R0, i) => {
    const R = R0 * escala;
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const q = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * 2 * Math.PI;
      const rr = R * (1 + 0.1 * Math.sin(2 * a + ph[0]) + 0.07 * Math.sin(3 * a + ph[1]) + 0.05 * Math.sin(5 * a + ph[2]));
      q.push(`${r1(cx + rr * Math.cos(a) * 1.3)} ${r1(cy + rr * Math.sin(a) * 0.85)}`);
    }
    ((i + 1) % 5 === 0 ? mestra : fino).push(`M${q.join(' L')} Z`);
  });
  return { fino: fino.join(' '), mestra: mestra.join(' ') };
}

function triangulo(p0, p1, R) {
  const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  return [0, 2.094, 4.189].map((o) => `${r1(p0[0] + R * Math.cos(a + o))},${r1(p0[1] + R * Math.sin(a + o))}`).join(' ');
}

// Folha: esboço normalizado (100 x 70). `completo` acrescenta controles por km, cota e pontos de interesse.
export function folhaSVG(t, { completo = false, pois = [], titulo } = {}) {
  const P = t.pontos;
  if (!Array.isArray(P) || P.length < 2) return null;
  const tracado = t.tracado || `M${P.map((p) => `${p[0]} ${p[1]}`).join(' L')}`;
  const ini = P[0], fim = P[P.length - 1];
  let j = 1;
  while (j < P.length - 1 && Math.hypot(P[j][0] - ini[0], P[j][1] - ini[1]) < 0.8) j++;
  const cume = t.cume;
  const an = cume ? curvasDecorativas(cume[0], cume[1], t.id, 0.42) : null;
  const sw = completo ? 0.55 : 0.9;
  const ctrl = completo ? controlesPorKm(P, t.distanciaKm, t.tipo) : [];
  const fechado = Math.hypot(fim[0] - ini[0], fim[1] - ini[1]) < 2;
  const desc = titulo || `Esboço do percurso de ${t.nome}`;
  return `<svg viewBox="0 0 100 70" role="img" aria-label="${esc(desc)}" preserveAspectRatio="xMidYMid meet">
  ${an ? `<g class="deco-curvas" stroke-width="${completo ? 0.18 : 0.3}" aria-hidden="true"><path d="${an.fino}"/><path class="mestra" stroke-width="${completo ? 0.4 : 0.6}" d="${an.mestra}"/></g>` : ''}
  <path d="${tracado}" fill="none" stroke="var(--percurso)" stroke-width="${sw}" stroke-dasharray="${completo ? '1.6 0.9' : '2.2 1.2'}" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="${triangulo(ini, P[j], completo ? 2.2 : 3)}" fill="none" stroke="var(--atencao)" stroke-width="${completo ? 0.45 : 0.7}"/>
  ${fechado ? '' : `<circle cx="${fim[0]}" cy="${fim[1]}" r="${completo ? 1.5 : 2}" fill="none" stroke="var(--atencao)" stroke-width="${completo ? 0.4 : 0.6}"/>`}
  <circle cx="${fim[0]}" cy="${fim[1]}" r="${completo ? 2.4 : 3.1}" fill="none" stroke="var(--atencao)" stroke-width="${completo ? 0.4 : 0.6}"/>
  ${ctrl.map((c) => `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="1.5" fill="none" stroke="var(--atencao)" stroke-width="0.35"/><text x="${r1(c.lx)}" y="${r1(c.ly)}" font-size="2.3" text-anchor="middle" dominant-baseline="middle" fill="var(--atencao-texto)" font-family="var(--f-dados)">${c.n}</text>`).join('')}
  ${completo && cume ? `<circle cx="${cume[0]}" cy="${cume[1]}" r="0.6" fill="var(--texto)"/>${t.altitudeMax != null ? `<text x="${r1(cume[0] + 1.5)}" y="${r1(cume[1] - 1.3)}" font-size="2.4" fill="var(--texto)" font-family="var(--f-dados)">${esc(num(t.altitudeMax))}</text>` : ''}` : ''}
  ${pois.filter((p) => p.x != null).map((p) => `<g transform="translate(${r1(p.x - 2)} ${r1(p.y - 2)}) scale(0.25)"><circle cx="8" cy="8" r="9" fill="var(--fundo-folha)" stroke="var(--atencao)" stroke-width="1.2"/>${simboloPOI(p.tipo, true)}</g>`).join('')}
</svg>`;
}

export function semMapaSVG(rotulo = 'Sem traçado registrado') {
  return `<svg viewBox="0 0 64 64" role="img" aria-label="${esc(rotulo)}" fill="none" stroke="currentColor" stroke-width="1.2">
  <path d="M8 46c6-2 10-10 18-10s10 6 16 6 8-4 14-6" stroke-dasharray="2 2.5"/>
  <path d="M14 52c6-2 12-6 18-6s12 4 18 4" opacity="0.6"/>
  <path d="M26 26 32 14l6 12z"/><path d="M22 32h20" />
  <circle cx="32" cy="32" r="22" stroke-dasharray="1 3"/>
</svg>`;
}

let ICONES = null;
export async function carregarIcones() {
  if (ICONES) return ICONES;
  try { ICONES = await (await fetch(new URL('../dados/icones.json', import.meta.url))).json(); } catch { ICONES = { distintivos: {}, pontosDeInteresse: {} }; }
  return ICONES;
}
export const icones = () => ICONES || { distintivos: {}, pontosDeInteresse: {} };

export function simboloPOI(tipo, interno = false) {
  const s = icones().pontosDeInteresse[tipo];
  if (!s) return interno ? '' : '';
  const cor = s.cor === 'over' ? 'var(--atencao)' : 'var(--texto)';
  const g = `<path d="${s.d}" fill="none" stroke="${cor}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>${s.acento ? `<path d="${s.acento}" fill="none" stroke="var(--atencao)" stroke-width="1.8" stroke-linecap="round"/>` : ''}`;
  return interno ? g : `<svg viewBox="0 0 16 16" role="img" aria-label="${esc(s.t)}">${g}</svg>`;
}

export function distintivoSVG(cod, ganho) {
  const d = icones().distintivos[String(cod)];
  if (!d) return '';
  const cL = ganho ? 'var(--texto)' : 'var(--texto-sutil)';
  const cA = ganho ? 'var(--atencao)' : 'var(--texto-sutil)';
  return `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
  ${d.linha ? `<path d="${d.linha}" stroke="${cL}" stroke-width="1.6"/>` : ''}
  ${d.trac ? `<path d="${d.trac}" stroke="${cL}" stroke-width="1.6" stroke-dasharray="3 2.5"/>` : ''}
  ${d.forte ? `<path d="${d.forte}" stroke="${cL}" stroke-width="2.6"/>` : ''}
  ${d.cheio ? `<path d="${d.cheio}" fill="${cL}" stroke="none"/>` : ''}
  ${d.acento ? `<path d="${d.acento}" stroke="${cA}" stroke-width="2"/>` : ''}
  ${d.txt ? `<text x="${d.tx}" y="${d.ty}" font-size="${d.ts}" text-anchor="middle" font-family="var(--f-dados)" font-weight="500" fill="${cL}" stroke="var(--fundo-folha)" stroke-width="2.5" paint-order="stroke">${esc(d.txt)}</text>` : ''}
  ${ganho ? '<path d="M38 2 H46 V10 Z" fill="var(--atencao)" stroke="none"/><path d="M38 2 L46 10" stroke="var(--fundo-folha)" stroke-width="0.8"/>' : ''}
</svg>`;
}

// ---------- Perfil altimétrico ----------
function passoBonito(intervalo, alvo = 4) {
  const bruto = intervalo / alvo;
  const p = 10 ** Math.floor(Math.log10(bruto || 1));
  const n = bruto / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}

// Perfil real: amostras [[km, altitude], ...]
export function perfilRealSVG(amostras, { largura = 640, altura = 200 } = {}) {
  const m = { e: 44, d: 10, t: 12, b: 26 };
  const W = largura - m.e - m.d, H = altura - m.t - m.b;
  const kmMax = amostras[amostras.length - 1][0];
  const eles = amostras.map((a) => a[1]);
  let lo = Math.min(...eles), hi = Math.max(...eles);
  const pe = passoBonito(hi - lo || 10);
  lo = Math.floor(lo / pe) * pe; hi = Math.ceil(hi / pe) * pe;
  if (hi === lo) hi = lo + pe;
  const x = (k) => m.e + (k / (kmMax || 1)) * W;
  const y = (e) => m.t + H - ((e - lo) / (hi - lo)) * H;
  const linha = amostras.map((a, i) => `${i ? 'L' : 'M'}${r1(x(a[0]))} ${r1(y(a[1]))}`).join(' ');
  const area = `${linha} L${r1(x(kmMax))} ${m.t + H} L${m.e} ${m.t + H} Z`;
  const pk = passoBonito(kmMax || 1, 5);
  const ticksX = [];
  for (let k = 0; k <= kmMax + 1e-9; k += pk) ticksX.push(k);
  const ticksY = [];
  for (let e = lo; e <= hi + 1e-9; e += pe) ticksY.push(e);
  const iMax = eles.indexOf(Math.max(...eles));
  const pat = `hach-${Math.random().toString(36).slice(2, 7)}`;
  return `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Perfil altimétrico: de ${num(Math.min(...eles))} a ${num(Math.max(...eles))} m ao longo de ${num(kmMax, 1)} km">
  <defs><pattern id="${pat}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--linha-fina)" stroke-width="1.2"/></pattern></defs>
  <g class="eixo">${ticksY.map((e) => `<line class="grade-linha" x1="${m.e}" x2="${m.e + W}" y1="${r1(y(e))}" y2="${r1(y(e))}"/><text x="${m.e - 6}" y="${r1(y(e)) + 3}" text-anchor="end">${num(e)}</text>`).join('')}
  ${ticksX.map((k) => `<text x="${r1(x(k))}" y="${altura - 8}" text-anchor="middle">${num(k, pk < 1 ? 1 : 0)}</text>`).join('')}<text x="${m.e + W}" y="${altura - 8}" text-anchor="end" dx="0" dy="0"> km</text></g>
  <path d="${area}" fill="url(#${pat})"/>
  <path d="${linha}" fill="none" stroke="var(--destaque)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="${linha}" fill="none" stroke="var(--texto)" stroke-width="0.8" stroke-linejoin="round"/>
  <circle cx="${r1(x(amostras[iMax][0]))}" cy="${r1(y(eles[iMax]))}" r="3.5" fill="var(--destaque)" stroke="var(--c-tinta)"/>
  <text x="${r1(x(amostras[iMax][0]))}" y="${r1(y(eles[iMax])) - 8}" text-anchor="middle" font-family="var(--f-dados)" font-size="11" fill="var(--texto)">${num(eles[iMax])} m</text>
</svg>`;
}

// Forma do perfil copiada do print (0..1, sem escala de altitude). Só rotula o que é conhecido.
export function perfilFormaSVG(perfil, altitudeMax, distanciaKm, { largura = 640, altura = 150 } = {}) {
  const m = { e: 10, d: 10, t: 22, b: 22 };
  const W = largura - m.e - m.d, H = altura - m.t - m.b;
  const x = (i) => m.e + (i / (perfil.length - 1)) * W;
  const y = (v) => m.t + H - v * H;
  const linha = perfil.map((v, i) => `${i ? 'L' : 'M'}${r1(x(i))} ${r1(y(v))}`).join(' ');
  const iMax = perfil.indexOf(Math.max(...perfil));
  const pat = `hachf-${Math.random().toString(36).slice(2, 7)}`;
  return `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Forma do perfil altimétrico copiada do print, sem escala vertical">
  <defs><pattern id="${pat}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--linha-fina)" stroke-width="1.2"/></pattern></defs>
  <line class="grade-linha" x1="${m.e}" x2="${m.e + W}" y1="${m.t + H}" y2="${m.t + H}"/>
  <path d="${linha} L${m.e + W} ${m.t + H} L${m.e} ${m.t + H} Z" fill="url(#${pat})"/>
  <path d="${linha}" fill="none" stroke="var(--destaque)" stroke-width="2.4"/><path d="${linha}" fill="none" stroke="var(--texto)" stroke-width="0.8"/>
  ${altitudeMax != null ? `<circle cx="${r1(x(iMax))}" cy="${r1(y(1))}" r="3.5" fill="var(--destaque)" stroke="var(--c-tinta)"/><text x="${r1(x(iMax))}" y="${m.t - 8}" text-anchor="middle" font-family="var(--f-dados)" font-size="11" fill="var(--texto)">${num(altitudeMax)} m</text>` : ''}
  <g class="eixo"><text x="${m.e}" y="${altura - 6}">0 km</text>${distanciaKm != null ? `<text x="${m.e + W}" y="${altura - 6}" text-anchor="end">${num(distanciaKm, 2)} km</text>` : ''}</g>
</svg>`;
}

// ---------- Gráficos de estatística ----------
export function barrasMensaisSVG(meses, campo = 'km', { largura = 640, altura = 190 } = {}) {
  const m = { e: 38, d: 6, t: 14, b: 24 };
  const W = largura - m.e - m.d, H = altura - m.t - m.b;
  const val = (x) => (campo === 'n' ? x.n : x.km.valor ?? 0);
  const max = Math.max(...meses.map(val), 0);
  const passo = passoBonito(max || 1, 3);
  const topo = Math.max(passo, Math.ceil(max / passo) * passo);
  const bw = W / meses.length;
  const ticks = [];
  for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v);
  return `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${campo === 'n' ? 'Trilhas' : 'Distância'} por mês nos últimos ${meses.length} meses">
  ${ticks.map((v) => { const yy = r1(m.t + H - (v / topo) * H); return `<line class="grade-linha" x1="${m.e}" x2="${m.e + W}" y1="${yy}" y2="${yy}"/><text x="${m.e - 6}" y="${yy + 3}" text-anchor="end">${num(v, passo < 1 ? 1 : 0)}</text>`; }).join('')}
  ${meses.map((x, i) => {
    const v = val(x); const h = (v / topo) * H; const xx = m.e + i * bw;
    const [a, mm] = x.chave.split('-');
    const rot = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][Number(mm) - 1];
    return `${v ? `<rect x="${r1(xx + bw * 0.22)}" y="${r1(m.t + H - h)}" width="${r1(bw * 0.56)}" height="${r1(h)}" fill="var(--destaque)" stroke="var(--c-tinta)" stroke-width="0.8"><title>${x.chave}: ${campo === 'n' ? `${x.n} trilha(s)` : `${num(v, 1)} km`}</title></rect>` : ''}
    <text x="${r1(xx + bw / 2)}" y="${altura - 8}" text-anchor="middle">${rot}${mm === '01' ? `’${a.slice(2)}` : ''}</text>`;
  }).join('')}
  <line x1="${m.e}" x2="${m.e + W}" y1="${m.t + H}" y2="${m.t + H}" stroke="var(--linha)" stroke-width="1"/>
</svg>`;
}

// ---------- Marca, rosa dos ventos ----------
export const marcaSVG = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
  <circle cx="16" cy="16" r="14.5" stroke-width="1"/><circle cx="16" cy="16" r="12" stroke-width="0.6" stroke-dasharray="0.8 1.6"/>
  <path d="M7 22.5 13 12l3.2 5L19 13l6 9.5z" stroke-linejoin="round"/><path d="M12.4 13.2 13 12l1.1 1.8" stroke-width="1"/>
  <path d="M16 2.5v3M16 26.5v3" stroke-width="1"/><circle cx="22.5" cy="9.5" r="1.6" fill="var(--destaque)" stroke="none"/>
</svg>`;

export const rosaDosVentosSVG = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="0.8">
  <circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="18" stroke-dasharray="1 2"/>
  <path d="M32 6 36 32 32 58 28 32z" fill="currentColor" fill-opacity="0.08"/><path d="M32 6 36 32H28z" fill="currentColor"/>
  <path d="M6 32 32 28 58 32 32 36z"/><text x="32" y="4.5" font-size="5" text-anchor="middle" fill="currentColor" stroke="none" font-family="var(--f-dados)">N</text>
</svg>`;
