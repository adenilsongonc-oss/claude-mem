// Cálculos sobre o acervo. Todas as funções são puras e recebem a lista de trilhas já mesclada.
// Regras documentadas em README.md ("Regras de cálculo").

import { ausente, normalizar, num, km as fmtKm, metros, duracao, data as fmtData, ritmo } from './formato.js';
import { pendencias } from './modelo.js';

const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.numero ?? 0) - (b.numero ?? 0));
export const ordemCronologica = (L) => L.slice().sort(porData);

// ---------- Soma com contagem de cobertura ----------
// Retorna { valor, com, total }: `valor` é null quando nenhuma trilha tem o dado (ausente ≠ zero).
export function somar(L, campo) {
  const com = L.filter((t) => !ausente(t[campo]));
  return { valor: com.length ? com.reduce((s, t) => s + t[campo], 0) : null, com: com.length, total: L.length };
}

export function maior(L, campo) {
  let melhor = null;
  for (const t of L) if (!ausente(t[campo]) && (!melhor || t[campo] > melhor[campo])) melhor = t;
  return melhor ? { valor: melhor[campo], trilha: melhor } : { valor: null, trilha: null };
}

export function regioes(L) {
  const m = new Map();
  for (const t of L) {
    if (ausente(t.regiao)) continue;
    const k = normalizar(t.regiao);
    if (!m.has(k)) m.set(k, { nome: t.regiao.trim(), n: 0, km: 0 });
    const r = m.get(k);
    r.n++;
    if (!ausente(t.distanciaKm)) r.km += t.distanciaKm;
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

export function resumo(L) {
  return {
    n: L.length,
    distancia: somar(L, 'distanciaKm'),
    subida: somar(L, 'desnivelPos'),
    tempoTotal: somar(L, 'tempoTotalMin'),
    tempoMov: somar(L, 'tempoMovMin'),
    regioes: regioes(L),
    semRegiao: L.filter((t) => ausente(t.regiao)).length,
    maiorDistancia: maior(L, 'distanciaKm'),
    maiorSubida: maior(L, 'desnivelPos'),
    maiorAltitude: maior(L, 'altitudeMax'),
  };
}

export function porMes(L, meses = 12, hoje = new Date()) {
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const doMes = L.filter((t) => (t.data || '').startsWith(chave));
    out.push({ chave, n: doMes.length, km: somar(doMes, 'distanciaKm'), subida: somar(doMes, 'desnivelPos') });
  }
  return out;
}

export function distribuicao(L, campo, rotuloAusente = 'não informado') {
  const m = new Map();
  for (const t of L) {
    const k = ausente(t[campo]) ? rotuloAusente : t[campo];
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([nome, n]) => ({ nome, n, ausente: nome === rotuloAusente })).sort((a, b) => b.n - a.n);
}

// Compara dois intervalos de datas [ini, fim] inclusivos (ISO).
export function compararPeriodos(L, a, b) {
  const dentro = (t, [i, f]) => t.data >= i && t.data <= f;
  const r = (p) => {
    const S = L.filter((t) => dentro(t, p));
    return { n: S.length, distancia: somar(S, 'distanciaKm'), subida: somar(S, 'desnivelPos'), tempoMov: somar(S, 'tempoMovMin') };
  };
  return { a: r(a), b: r(b) };
}

// ---------- Busca, filtros e ordenação ----------
export const FILTROS_PADRAO = {
  q: '', periodo: 'tudo', regiao: '', tipo: '', dificuldade: '', kmMin: null, kmMax: null, durMin: null, durMax: null,
  subMin: null, subMax: null, favoritos: false, preenchimento: '',
};

export function filtrosAtivos(f) {
  return Object.keys(FILTROS_PADRAO).filter((k) => k !== 'q' && f[k] !== FILTROS_PADRAO[k] && f[k] !== '' && f[k] !== null).length;
}

const diasDesde = (iso, hoje) => (hoje.getTime() - new Date(`${iso}T12:00:00`).getTime()) / 86400000;

export function filtrar(L, f, anot = {}, hoje = new Date()) {
  const q = normalizar(f.q);
  const fora = (v, min, max) => (min !== null && min !== undefined && (ausente(v) || v < min)) || (max !== null && max !== undefined && (ausente(v) || v > max));
  return L.filter((t) => {
    if (q) {
      const alvo = [t.nome, t.local, t.regiao, t.id, t.numero != null ? `n${t.numero} n${String(t.numero).padStart(2, '0')}` : '',
        ...((anot[t.id]?.tags) || [])].map(normalizar).join(' | ');
      if (!alvo.includes(q.replace(/^nº\s*/, 'n').replace(/\s+/g, ' '))) return false;
    }
    if (f.periodo === '30' && diasDesde(t.data, hoje) > 30) return false;
    if (f.periodo === '90' && diasDesde(t.data, hoje) > 90) return false;
    if (f.periodo === '365' && diasDesde(t.data, hoje) > 365) return false;
    if (f.periodo === 'ano' && t.data.slice(0, 4) !== String(hoje.getFullYear())) return false;
    if (f.regiao && (f.regiao === '__nd' ? !ausente(t.regiao) : normalizar(t.regiao) !== normalizar(f.regiao))) return false;
    if (f.tipo && (f.tipo === '__nd' ? !ausente(t.tipo) : t.tipo !== f.tipo)) return false;
    if (f.dificuldade && (f.dificuldade === '__nd' ? !ausente(t.dificuldade) : t.dificuldade !== f.dificuldade)) return false;
    if (fora(t.distanciaKm, f.kmMin, f.kmMax)) return false;
    const dur = t.tempoTotalMin ?? t.tempoMovMin;
    if (fora(dur, f.durMin != null ? f.durMin * 60 : null, f.durMax != null ? f.durMax * 60 : null)) return false;
    if (fora(t.desnivelPos, f.subMin, f.subMax)) return false;
    if (f.favoritos && !anot[t.id]?.favorito) return false;
    if (f.preenchimento === 'incompleto' && pendencias(t).length === 0) return false;
    if (f.preenchimento === 'completo' && pendencias(t).length > 0) return false;
    if (f.preenchimento === 'rascunho' && t.status !== 'rascunho') return false;
    return true;
  });
}

export const ORDENS = {
  data: { rotulo: 'Data', v: (t) => t.data },
  nome: { rotulo: 'Nome', v: (t) => normalizar(t.nome) },
  distanciaKm: { rotulo: 'Distância', v: (t) => t.distanciaKm },
  duracao: { rotulo: 'Duração', v: (t) => t.tempoTotalMin ?? t.tempoMovMin },
  desnivelPos: { rotulo: 'Desnível', v: (t) => t.desnivelPos },
  altitudeMax: { rotulo: 'Altitude', v: (t) => t.altitudeMax },
  numero: { rotulo: 'Número', v: (t) => t.numero },
};

// Valores ausentes ficam sempre no fim, em qualquer direção.
export function ordenar(L, campo = 'data', dir = 'desc') {
  const v = (ORDENS[campo] || ORDENS.data).v;
  return L.slice().sort((a, b) => {
    const va = v(a), vb = v(b);
    if (ausente(va) && ausente(vb)) return 0;
    if (ausente(va)) return 1;
    if (ausente(vb)) return -1;
    const r = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === 'desc' ? -r : r;
  });
}

// ---------- Progresso e próxima meta (regras do caderno original) ----------
const DIF = { Fácil: 1, Moderada: 2, Difícil: 3 };
const DIFN = ['—', 'Fácil', 'Moderada', 'Difícil'];
const acima = (v, passo) => Math.round(Math.ceil((v - 1e-9) / passo) * passo * 1000) / 1000;
export const PASSO = {
  km: (b) => acima(b * 1.10, 0.5),
  sub: (b) => acima(b * 1.15, 50),
  alt: (b) => acima(b + 200, 50),
  dif: (b) => b + 1,
};
export const EIXO = { km: 'Distância', sub: 'Subida', alt: 'Altitude', dif: 'Dificuldade', mov: 'Tempo em movimento' };
const kmTxt = (v) => fmtKm(v, Number.isInteger(v) ? 0 : (Math.round(v * 10) === v * 10 ? 1 : 2));
export const FMT_EIXO = { km: kmTxt, sub: metros, alt: metros, mov: duracao, dif: (v) => DIFN[v] };

const valores = (t) => ({
  km: t.distanciaKm ?? null, sub: t.desnivelPos ?? null, alt: t.altitudeMax ?? null, mov: t.tempoMovMin ?? null,
  dif: t.dificuldade ? DIF[t.dificuldade] : null,
});

export function progresso(lista) {
  const L = ordemCronologica(lista);
  const best = { km: null, sub: null, alt: null, mov: null, dif: null };
  const desde = { km: null, sub: null, alt: null, dif: null };
  const out = {};
  let metaAnt = null;
  let cumpridas = 0;
  for (const t of L) {
    const val = valores(t);
    const recordes = [];
    for (const k of ['km', 'sub', 'alt', 'mov', 'dif']) {
      const v = val[k];
      if (v == null) continue;
      if (best[k] == null) recordes.push({ k, txt: `${EIXO[k]}: ${FMT_EIXO[k](v)} (primeiro registro)` });
      else if (v > best[k]) recordes.push({ k, txt: `${EIXO[k]}: ${FMT_EIXO[k](v)}, novo recorde${k === 'dif' ? '' : ` (+${FMT_EIXO[k](Math.round((v - best[k]) * 100) / 100)})`}` });
    }
    let cumprida = null;
    if (metaAnt && metaAnt.opcoes.length) {
      const ok = metaAnt.opcoes.filter((o) => val[o.k] != null && val[o.k] >= o.alvo);
      const rec = metaAnt.opcoes.find((o) => o.rec);
      cumprida = {
        ok: ok.length > 0,
        recomendada: ok.some((o) => o.rec),
        texto: ok.length
          ? `Cumprida: ${ok.map((o) => `${o.eixo.toLowerCase()} de ${o.alvoTxt}`).join(', ')}${ok.some((o) => o.rec) ? ' — era a recomendada.' : '.'}`
          : `Não cumprida${rec ? `: a recomendada era ${rec.eixo.toLowerCase()} de ${rec.alvoTxt}${val[rec.k] != null ? `, e esta folha teve ${FMT_EIXO[rec.k](val[rec.k])}` : ''}` : ''}. É uma folha de base, que também conta.`,
      };
      if (ok.length) cumpridas++;
    }
    for (const k of ['km', 'sub', 'alt', 'mov', 'dif']) {
      const v = val[k];
      if (v != null && (best[k] == null || v > best[k])) { best[k] = v; if (k in desde) desde[k] = t.data; }
    }
    const opcoes = [];
    for (const k of ['km', 'sub', 'alt', 'dif']) {
      if (best[k] != null && !(k === 'dif' && best.dif >= 3)) opcoes.push({ k, alvo: PASSO[k](best[k]) });
    }
    const pref = ['sub', 'alt', 'dif', 'km'];
    const ord = opcoes.slice().sort((a, z) => {
      const da = desde[a.k] || '', dz = desde[z.k] || '';
      return da < dz ? -1 : da > dz ? 1 : pref.indexOf(a.k) - pref.indexOf(z.k);
    });
    const recK = ord.length ? ord[0].k : null;
    for (const o of opcoes) {
      o.eixo = EIXO[o.k]; o.rec = o.k === recK; o.alvoTxt = FMT_EIXO[o.k](o.alvo); o.atualTxt = FMT_EIXO[o.k](best[o.k]);
    }
    const empate = ord.length > 1 && desde[ord[0].k] === desde[ord[1].k];
    const porque = !recK ? '' : empate
      ? 'Os recordes são da mesma data; a subida vem primeiro porque é o que mais pesa em trilhas de serra.'
      : `O recorde de ${EIXO[recK].toLowerCase()} é o mais antigo (desde ${fmtData(desde[recK])}): avance uma coisa por vez.`;
    const meta = { opcoes, recK, porque, semDif: best.dif == null };
    out[t.id] = { recordes, cumprida, meta, cumpridas, best: { ...best } };
    metaAnt = meta;
  }
  return { porId: out, best, ultima: L[L.length - 1] || null, cumpridas };
}

// Quantos "degraus" (passos de meta) separam o melhor atual de uma folha em branco.
export function degraus(folha, best) {
  const alvo = { km: folha.distanciaKm, sub: folha.desnivelPos, alt: folha.altitudeMax };
  let maxN = 0;
  let eixoMax = null;
  for (const k of ['km', 'sub', 'alt']) {
    if (alvo[k] == null || best[k] == null) continue;
    let v = best[k];
    let n = 0;
    while (v < alvo[k] - 1e-9 && n < 50) { v = PASSO[k](v); n++; }
    if (n > maxN) { maxN = n; eixoMax = k; }
  }
  const eixo = eixoMax ? EIXO[eixoMax].toLowerCase() : '';
  const texto = maxN === 0 ? 'dentro do que você já fez'
    : maxN === 1 ? `encaixa no próximo degrau de ${eixo}` : `faltam cerca de ${maxN} degraus de ${eixo}`;
  return { n: maxN, eixo: eixoMax, texto };
}

// ---------- Distintivos ----------
export const DISTINTIVOS = [
  { cod: 31, g: 'marco', nome: 'Primeira folha', regra: 'Registrar a primeira trilha.', met: 'count', alvo: 1, f: (v) => `${v} ${v === 1 ? 'folha' : 'folhas'}` },
  { cod: 32, g: 'marco', nome: 'Curva de 5 km', regra: 'Fazer uma trilha de 5 km ou mais.', met: 'maxKm', alvo: 5, f: kmTxt },
  { cod: 33, g: 'marco', nome: 'Curva de 10 km', regra: 'Fazer uma trilha de 10 km ou mais.', met: 'maxKm', alvo: 10, f: kmTxt },
  { cod: 34, g: 'marco', nome: 'Curva mestra 15 km', regra: 'Fazer uma trilha de 15 km ou mais.', met: 'maxKm', alvo: 15, f: kmTxt },
  { cod: 35, g: 'marco', nome: 'Curva de 20 km', regra: 'Fazer uma trilha de 20 km ou mais.', met: 'maxKm', alvo: 20, f: kmTxt },
  { cod: 36, g: 'marco', nome: 'Meta cumprida', regra: 'Cumprir uma das metas propostas depois de um registro.', met: 'metas', alvo: 1, f: (v) => `${v} ${v === 1 ? 'meta' : 'metas'}` },
  { cod: 37, g: 'marco', nome: 'Cume dos mil', regra: 'Passar dos 1.000 m de altitude.', met: 'maxAlt', alvo: 1000, f: metros },
  { cod: 38, g: 'marco', nome: 'Subida firme', regra: 'Uma trilha com 500 m de desnível positivo.', met: 'maxSub', alvo: 500, f: metros },
  { cod: 41, g: 'desafio', nome: 'Mil metros de subida', regra: 'Somar 1.000 m de desnível positivo.', met: 'sumSub', alvo: 1000, f: metros },
  { cod: 42, g: 'desafio', nome: 'Everest no bolso', regra: 'Somar 8.849 m de subida, a altura do Everest.', met: 'sumSub', alvo: 8849, f: metros },
  { cod: 43, g: 'desafio', nome: 'Cem quilômetros', regra: 'Somar 100 km de trilhas.', met: 'sumKm', alvo: 100, f: kmTxt },
  { cod: 44, g: 'desafio', nome: 'Cinco folhas', regra: 'Registrar cinco trilhas.', met: 'count', alvo: 5, f: (v) => `${v} ${v === 1 ? 'folha' : 'folhas'}` },
  { cod: 45, g: 'desafio', nome: 'Mês cheio', regra: 'Fazer quatro trilhas no mesmo mês.', met: 'mes', alvo: 4, f: (v) => `${v} ${v === 1 ? 'trilha' : 'trilhas'} no mês` },
  { cod: 46, g: 'desafio', nome: 'Dia longo', regra: 'Ficar 5 horas em movimento numa trilha.', met: 'maxMov', alvo: 300, f: duracao },
  { cod: 47, g: 'desafio', nome: 'Três metas cumpridas', regra: 'Cumprir três metas propostas.', met: 'metas', alvo: 3, f: (v) => `${v} ${v === 1 ? 'meta' : 'metas'}` },
];

export function distintivos(lista) {
  const L = ordemCronologica(lista);
  const PG = progresso(L).porId;
  const acc = { count: 0, maxKm: null, maxAlt: null, maxSub: null, sumSub: null, sumKm: null, mes: 0, maxMov: null, metas: 0 };
  const mx = (a, v) => (v == null ? a : a == null ? v : Math.max(a, v));
  const sm = (a, v) => (v == null ? a : (a ?? 0) + v);
  const meses = {};
  const passos = [];
  for (const t of L) {
    acc.count++;
    acc.maxKm = mx(acc.maxKm, t.distanciaKm); acc.sumKm = sm(acc.sumKm, t.distanciaKm);
    acc.maxAlt = mx(acc.maxAlt, t.altitudeMax);
    acc.maxSub = mx(acc.maxSub, t.desnivelPos); acc.sumSub = sm(acc.sumSub, t.desnivelPos);
    acc.maxMov = mx(acc.maxMov, t.tempoMovMin);
    const mk = (t.data || '').slice(0, 7);
    meses[mk] = (meses[mk] || 0) + 1; acc.mes = Math.max(acc.mes, meses[mk]);
    acc.metas = PG[t.id]?.cumpridas || 0;
    passos.push({ t, v: { ...acc } });
  }
  const fim = passos.length ? passos[passos.length - 1].v : acc;
  return DISTINTIVOS.map((d) => {
    const hit = passos.find((p) => p.v[d.met] != null && p.v[d.met] >= d.alvo);
    const atual = fim[d.met];
    const semDado = atual == null;
    const ganho = !!hit;
    const pct = ganho ? 100 : semDado ? 0 : Math.max(0, Math.min(100, (100 * atual) / d.alvo));
    let situacao;
    if (ganho) situacao = `Conquistado em ${fmtData(hit.t.data)} · ${hit.t.nome}`;
    else if (semDado) situacao = 'Sem dado ainda: nenhuma trilha tem esse valor registrado.';
    else situacao = `Faltam ${d.f(Math.round((d.alvo - atual) * 100) / 100)}`;
    return { ...d, ganho, semDado, pct, situacao, trilhaId: hit?.t.id ?? null, atualTxt: semDado ? '—' : d.f(atual), alvoTxt: d.f(d.alvo) };
  });
}

// ---------- Leitura de uma folha ----------
export function leitura(t, lista) {
  const L = ordemCronologica(lista);
  const linhas = [];
  const comKm = L.filter((x) => !ausente(x.distanciaKm)).sort((a, b) => b.distanciaKm - a.distanciaKm);
  if (!ausente(t.distanciaKm)) {
    const pos = comKm.findIndex((x) => x.id === t.id) + 1;
    linhas.push(comKm.length > 1 ? `É a ${pos}ª mais longa entre ${comKm.length} trilhas com distância registrada.` : 'É a única trilha com distância registrada até agora.');
  }
  const i = L.findIndex((x) => x.id === t.id);
  const ant = i > 0 ? L[i - 1] : null;
  if (ant) {
    const partes = [];
    if (!ausente(t.distanciaKm) && !ausente(ant.distanciaKm)) {
      const d = t.distanciaKm - ant.distanciaKm;
      partes.push(`${d >= 0 ? '+' : '−'}${num(Math.abs(d), 2)} km`);
    }
    if (!ausente(t.desnivelPos) && !ausente(ant.desnivelPos)) {
      const d = t.desnivelPos - ant.desnivelPos;
      partes.push(`${d >= 0 ? '+' : '−'}${num(Math.abs(d), 0)} m de subida`);
    }
    if (partes.length) linhas.push(`Em relação à anterior (${ant.nome}): ${partes.join(', ')}.`);
  }
  if (!ausente(t.desnivelPos) && !ausente(t.distanciaKm) && t.distanciaKm > 0) {
    const mk = t.desnivelPos / t.distanciaKm;
    const c = mk < 30 ? 'suave' : mk <= 60 ? 'ondulado' : 'íngreme';
    linhas.push(`Subida por km: ${num(mk, 0)} m/km, perfil ${c}.`);
  }
  const r = ritmo(t.distanciaKm, t.tempoMovMin);
  if (r == null) linhas.push('Sem tempo em movimento: o ritmo não pode ser calculado.');
  else {
    const outros = L.filter((x) => x.id !== t.id).map((x) => ritmo(x.distanciaKm, x.tempoMovMin)).filter((v) => v != null);
    if (outros.length) {
      const media = outros.reduce((s, v) => s + v, 0) / outros.length;
      linhas.push(`Ritmo de ${num(r, 1)} km/h, ${r >= media ? 'acima' : 'abaixo'} da média das outras (${num(media, 1)} km/h).`);
    } else linhas.push(`Ritmo de ${num(r, 1)} km/h. Ainda não há outras trilhas com tempo para comparar.`);
  }
  if (!ausente(t.distanciaKm)) {
    const prox = [5, 10, 15, 20, 25, 30, 40, 50].find((m) => m > t.distanciaKm);
    if (prox) linhas.push(`Próximo marco de distância: ${prox} km (faltam ${num(prox - t.distanciaKm, 2)} km).`);
  }
  return linhas;
}

// Controles a cada km ao longo dos pontos normalizados do esboço.
export function controlesPorKm(pontos, distanciaKm, tipo) {
  if (!Array.isArray(pontos) || pontos.length < 2 || ausente(distanciaKm) || distanciaKm < 1) return [];
  const cum = [0];
  for (let i = 1; i < pontos.length; i++) cum.push(cum[i - 1] + Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]));
  const total = cum[cum.length - 1];
  if (!total) return [];
  const idaVolta = tipo === 'ida e volta';
  const limite = idaVolta ? distanciaKm / 2 : distanciaKm;
  const folga = idaVolta ? 0.25 : 0.5;
  const cx = pontos.reduce((s, p) => s + p[0], 0) / pontos.length;
  const cy = pontos.reduce((s, p) => s + p[1], 0) / pontos.length;
  const out = [];
  for (let k = 1; k <= limite - folga; k++) {
    const alvo = (k / distanciaKm) * total;
    let j = 1;
    while (j < cum.length - 1 && cum[j] < alvo) j++;
    const f = (alvo - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    const x = pontos[j - 1][0] + (pontos[j][0] - pontos[j - 1][0]) * f;
    const y = pontos[j - 1][1] + (pontos[j][1] - pontos[j - 1][1]) * f;
    const vx = x - cx, vy = y - cy, n = Math.hypot(vx, vy) || 1;
    out.push({ n: k, x, y, lx: x + (vx / n) * 4.4, ly: y + (vy / n) * 4.4 });
  }
  return out;
}

// Km aproximado do ponto do traçado mais próximo de (x, y) no quadro normalizado.
export function encaixarNoTracado(pontos, distanciaKm, x, y) {
  if (!Array.isArray(pontos) || pontos.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pontos.length; i++) cum.push(cum[i - 1] + Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]));
  let melhor = null;
  for (let i = 1; i < pontos.length; i++) {
    const [ax, ay] = pontos[i - 1], [bx, by] = pontos[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const px = ax + dx * f, py = ay + dy * f, d = Math.hypot(x - px, y - py);
    if (!melhor || d < melhor.d) melhor = { d, x: px, y: py, s: cum[i - 1] + Math.sqrt(l2) * f };
  }
  const total = cum[cum.length - 1] || 1;
  return { x: melhor.x, y: melhor.y, km: ausente(distanciaKm) ? null : Math.round((melhor.s / total) * distanciaKm * 10) / 10 };
}
