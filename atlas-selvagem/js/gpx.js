// Leitura, análise e exportação de GPX.
// `lerGPX` usa DOMParser (navegador). `analisarPontos` é matemática pura e testável em Node.
// Nunca inventa elevação ou horário: se o arquivo não tem, o campo fica null.

const R = 6371000;
const RAD = Math.PI / 180;

export function haversine(a, b) {
  const dLa = (b.lat - a.lat) * RAD, dLo = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class ErroGPX extends Error {}

export function extrairPontos(texto, Parser = globalThis.DOMParser) {
  if (typeof texto !== 'string' || !texto.trim()) throw new ErroGPX('O arquivo está vazio.');
  const doc = new Parser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ErroGPX('O arquivo não é um XML válido. Confira se é mesmo um .gpx.');
  const raiz = doc.documentElement;
  if (!raiz || raiz.localName !== 'gpx') throw new ErroGPX('O XML não tem a raiz <gpx>: não parece um arquivo GPX.');
  const porTag = (n, tag) => Array.from(n.getElementsByTagNameNS ? n.getElementsByTagNameNS('*', tag) : n.getElementsByTagName(tag));
  let nos = porTag(doc, 'trkpt');
  let origem = 'trilha (trkpt)';
  if (!nos.length) { nos = porTag(doc, 'rtept'); origem = 'rota (rtept)'; }
  if (!nos.length) throw new ErroGPX('O GPX não tem pontos de trilha (trkpt) nem de rota (rtept). Arquivos só com waypoints não descrevem um percurso.');
  const filho = (n, tag) => { const e = porTag(n, tag)[0]; return e ? e.textContent.trim() : null; };
  let descartados = 0;
  const pontos = [];
  for (const n of nos) {
    const lat = parseFloat(n.getAttribute('lat')), lon = parseFloat(n.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { descartados++; continue; }
    const e = filho(n, 'ele'), tm = filho(n, 'time');
    const ele = e != null && Number.isFinite(parseFloat(e)) ? parseFloat(e) : null;
    const t = tm && !Number.isNaN(Date.parse(tm)) ? Date.parse(tm) : null;
    pontos.push({ lat, lon, ele, t });
  }
  const meta = porTag(doc, 'metadata')[0];
  const trk = porTag(doc, 'trk')[0] || porTag(doc, 'rte')[0];
  const nome = (trk && filho(trk, 'name')) || (meta && filho(meta, 'name')) || '';
  const waypoints = porTag(doc, 'wpt').map((w) => ({
    lat: parseFloat(w.getAttribute('lat')), lon: parseFloat(w.getAttribute('lon')), nome: filho(w, 'name') || '',
  })).filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon));
  return { pontos, nome, origem, descartados, waypoints };
}

// Análise do percurso. P: [{lat, lon, ele|null, t|null}]
export function analisarPontos(P) {
  if (P.length < 2) throw new ErroGPX('Há menos de dois pontos válidos: não dá para formar um percurso.');
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + haversine(P[i - 1], P[i]));
  const total = cum[cum.length - 1];
  if (total < 50) throw new ErroGPX('O percurso tem menos de 50 m. Confira se o arquivo é a gravação completa.');
  const ausentes = [];

  // Elevação: só quando ao menos metade dos pontos tem <ele>.
  const comEle = P.filter((p) => p.ele != null).length;
  let desnivelPos = null, desnivelNeg = null, altitudeMax = null, altitudeMin = null;
  if (comEle >= P.length * 0.5) {
    const E = [];
    let ult = P.find((p) => p.ele != null).ele;
    for (const p of P) { if (p.ele != null) ult = p.ele; E.push(ult); }
    const S = E.map((_, i) => {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(E.length - 1, i + 2); j++) { s += E[j]; n++; }
      return s / n;
    });
    let ref = S[0]; let pos = 0; let neg = 0;
    for (const v of S) {
      if (v - ref >= 3) { pos += v - ref; ref = v; } else if (ref - v >= 3) { neg += ref - v; ref = v; }
    }
    desnivelPos = Math.round(pos); desnivelNeg = Math.round(neg);
    const brutas = P.filter((p) => p.ele != null).map((p) => p.ele);
    altitudeMax = Math.round(Math.max(...brutas)); altitudeMin = Math.round(Math.min(...brutas));
  } else ausentes.push(comEle ? `elevação (só ${comEle} de ${P.length} pontos têm)` : 'elevação');

  // Tempo: só quando início e fim têm horário e ao menos metade dos pontos também.
  let tempoTotalMin = null, tempoMovMin = null, data = null, inicio = null;
  const comT = P.filter((p) => p.t != null).length;
  const t0 = P[0].t, t1 = P[P.length - 1].t;
  if (t0 != null && t1 != null && t1 > t0 && comT >= P.length * 0.5) {
    tempoTotalMin = Math.round((t1 - t0) / 60000);
    let mov = 0;
    for (let i = 1; i < P.length; i++) {
      if (P[i].t == null || P[i - 1].t == null) continue;
      const dt = (P[i].t - P[i - 1].t) / 1000;
      if (dt <= 0 || dt > 600) continue;
      if ((cum[i] - cum[i - 1]) / dt >= 0.3) mov += dt;
    }
    tempoMovMin = Math.round(mov / 60);
    const d0 = new Date(t0);
    data = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    inicio = new Date(t0).toISOString();
  } else ausentes.push('horários (sem eles não há duração nem data)');

  const idxDe = (f) => {
    const alvo = f * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < alvo) lo = m + 1; else hi = m; }
    return lo;
  };
  const at = (f) => P[idxDe(f)];

  let tipo = 'travessia';
  if (haversine(P[0], P[P.length - 1]) < 200) {
    let s = 0, n = 0;
    for (let f = 0.05; f < 0.45; f += 0.04) { s += haversine(at(f), at(1 - f)); n++; }
    tipo = s / n < 80 ? 'ida e volta' : 'circular';
  }

  // Esboço normalizado (100 x 70, margem 6), reamostrado em 141 pontos por distância.
  const N = 140;
  const lat0 = P[0].lat * RAD;
  const proj = (p) => [p.lon * Math.cos(lat0) * 111320, -p.lat * 110540];
  const XY = [];
  for (let k = 0; k <= N; k++) XY.push(proj(at(k / N)));
  XY[0] = proj(P[0]); XY[N] = proj(P[P.length - 1]);
  const xs = XY.map((p) => p[0]), ys = XY.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 100, H = 70, M = 6;
  const sc = Math.min((W - 2 * M) / ((x1 - x0) || 1), (H - 2 * M) / ((y1 - y0) || 1));
  const ox = M + ((W - 2 * M) - (x1 - x0) * sc) / 2, oy = M + ((H - 2 * M) - (y1 - y0) * sc) / 2;
  const r1 = (v) => Math.round(v * 10) / 10;
  const norm = (p) => [r1(ox + (p[0] - x0) * sc), r1(oy + (p[1] - y0) * sc)];
  const pontos = XY.map(norm);
  const tracado = `M${pontos.map((p) => `${p[0]} ${p[1]}`).join(' L')}`;
  let iMax = -1;
  P.forEach((p, i) => { if (p.ele != null && (iMax < 0 || p.ele > P[iMax].ele)) iMax = i; });
  const cume = iMax >= 0 ? norm(proj(P[iMax])) : null;
  let perfil = null;
  if (altitudeMax != null) {
    const E2 = [];
    for (let k = 0; k < 40; k++) { const p = at(k / 39); E2.push(p.ele ?? (E2.length ? E2[E2.length - 1] : altitudeMin)); }
    const lo = Math.min(...E2), hi = Math.max(...E2);
    perfil = E2.map((v) => Math.round(((v - lo) / ((hi - lo) || 1)) * 1000) / 1000);
  }

  return {
    distanciaKm: Math.round((total / 1000) * 100) / 100,
    desnivelPos, desnivelNeg, altitudeMax, altitudeMin, tempoTotalMin, tempoMovMin, data, inicio, tipo,
    tracado, pontos, cume, perfil,
    coordInicio: [round6(P[0].lat), round6(P[0].lon)],
    coordFim: [round6(P[P.length - 1].lat), round6(P[P.length - 1].lon)],
    nPontos: P.length, ausentes,
    assinatura: assinatura(P),
  };
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

// Identifica o mesmo arquivo importado duas vezes (contagem + extremos + horário inicial).
export function assinatura(P) {
  const a = P[0], b = P[P.length - 1];
  return [P.length, round6(a.lat), round6(a.lon), round6(b.lat), round6(b.lon), a.t ?? ''].join('|');
}

export function lerGPX(texto, Parser) {
  const ext = extrairPontos(texto, Parser);
  const r = analisarPontos(ext.pontos);
  return { ...r, nomeGPX: ext.nome, origemPontos: ext.origem, descartados: ext.descartados, waypoints: ext.waypoints, trajeto: ext.pontos };
}

// Perfil real (altitude × distância) a partir do trajeto armazenado. null se faltar elevação.
export function perfilReal(trajeto, amostras = 160) {
  if (!trajeto || trajeto.length < 2) return null;
  const P = trajeto.map(([lat, lon, ele]) => ({ lat, lon, ele }));
  if (P.filter((p) => p.ele != null).length < P.length * 0.5) return null;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + haversine(P[i - 1], P[i]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0, ult = P.find((p) => p.ele != null).ele;
  for (let k = 0; k < amostras; k++) {
    const alvo = (k / (amostras - 1)) * total;
    while (j < cum.length - 1 && cum[j] < alvo) { j++; if (P[j].ele != null) ult = P[j].ele; }
    out.push([alvo / 1000, P[j].ele ?? ult]);
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Exporta o trajeto real como GPX 1.1. Sem trajeto armazenado, não há o que exportar.
export function gerarGPX(t, trajeto) {
  const pts = trajeto.map(([lat, lon, ele, tm]) =>
    `      <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ''}${tm != null ? `<time>${new Date(tm).toISOString()}</time>` : ''}</trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Atlas Selvagem" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(t.nome)}</name>${t.data ? `<desc>${esc(t.local)} · ${esc(t.data)}</desc>` : ''}</metadata>
  <trk>
    <name>${esc(t.nome)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

// GPX sintético para experimentar a importação. Sempre marcado como exemplo no nome.
export function gpxExemplo() {
  const lat0 = -22.89, lon0 = -46.86, N = 260, out = [];
  let t = Math.floor((Date.now() - 9 * 3600000) / 60000) * 60000;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * 2 * Math.PI, r = 0.016 * (1 + 0.25 * Math.sin(3 * a) + 0.12 * Math.sin(5 * a + 1));
    const lat = lat0 + r * Math.sin(a), lon = lon0 + r * 1.3 * Math.cos(a);
    const ele = 840 + 640 * Math.max(0, Math.sin(a - 0.6)) + 25 * Math.sin(7 * a);
    if (prev) {
      const dd = Math.hypot((lat - prev.lat) * 110540, (lon - prev.lon) * 111320 * Math.cos(lat * RAD));
      t += (dd / 1.05) * 1000;
      if (i === 130) t += 12 * 60000;
    }
    out.push(`<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele><time>${new Date(t).toISOString()}</time></trkpt>`);
    prev = { lat, lon };
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="Atlas Selvagem (exemplo)" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>GPX de exemplo (fictício)</name><trkseg>${out.join('')}</trkseg></trk></gpx>`;
}
