// Modelo de dados de uma trilha. Unidades: km, metros, minutos, graus decimais (WGS84).
// Origem de cada valor numérico fica em `fontes[campo]`: 'manual' | 'gpx' | 'print' | 'calculado'.
// Campo ausente = null (nunca 0 no lugar de "não sei").

import { ausente, normalizar } from './formato.js';

export const TIPOS = ['circular', 'ida e volta', 'travessia'];
export const CATEGORIAS = ['trekking', 'caminhada', 'travessia de serra', 'corrida em trilha', 'outra'];
export const DIFICULDADES = ['Fácil', 'Moderada', 'Difícil'];
export const STATUS = { rascunho: 'Rascunho', concluido: 'Concluído' };
export const TIPOS_POI = {
  mirante: 'Mirante', agua: 'Água', cume: 'Cume', bifurcacao: 'Bifurcação', acampamento: 'Acampamento', perigo: 'Perigo',
};
export const TIPOS_ALERTA = [
  'propriedade particular', 'sem sinal de celular', 'cães soltos', 'lama ou trecho escorregadio', 'travessia de rio',
  'sem água no percurso', 'mato fechado', 'trânsito de veículos', 'outro',
];

export const CAMPOS_NUMERICOS = [
  'distanciaKm', 'tempoTotalMin', 'tempoMovMin', 'desnivelPos', 'desnivelNeg', 'altitudeMin', 'altitudeMax', 'esforco',
];

// Campos que, ausentes, deixam a folha "com dados faltando". Rótulo usado nos avisos.
export const PENDENCIAS = [
  ['regiao', 'região'], ['tipo', 'tipo de percurso'], ['categoria', 'categoria'], ['distanciaKm', 'distância'],
  ['desnivelPos', 'desnível positivo'], ['desnivelNeg', 'desnível negativo'], ['altitudeMax', 'altitude máxima'],
  ['tempoTotalMin', 'tempo total'], ['tempoMovMin', 'tempo em movimento'], ['dificuldade', 'dificuldade'], ['esforco', 'esforço'],
];

export const ROTULOS = {
  nome: 'Nome', local: 'Localidade', regiao: 'Região', data: 'Data', categoria: 'Categoria', tipo: 'Tipo de percurso',
  status: 'Status', distanciaKm: 'Distância', tempoTotalMin: 'Tempo total', tempoMovMin: 'Tempo em movimento',
  desnivelPos: 'Desnível positivo', desnivelNeg: 'Desnível negativo', altitudeMin: 'Altitude mínima',
  altitudeMax: 'Altitude máxima', dificuldade: 'Dificuldade', esforco: 'Esforço percebido',
};

export const ROTULO_FONTE = { manual: 'manual', gpx: 'GPX', print: 'print', calculado: 'calculado' };

export function vazio() {
  return {
    id: null, numero: null, nome: '', local: '', regiao: null, data: '', categoria: null, tipo: null, status: 'rascunho',
    distanciaKm: null, tempoTotalMin: null, tempoMovMin: null, desnivelPos: null, desnivelNeg: null,
    altitudeMin: null, altitudeMax: null, coordInicio: null,
    dificuldade: null, esforco: null, clima: null, companhia: null, terreno: null, equipamentos: null,
    notas: null, ocorrencias: null, wikiloc: null,
    tracado: null, pontos: null, cume: null, perfil: null, fontePerfil: null, temTrajeto: false,
    fontes: {}, origem: 'local', criadoEm: null, atualizadoEm: null,
  };
}

// Converte um registro de `dados/trilhas.js` para o modelo completo, sem inventar valores.
export function daBase(r, indice) {
  const t = { ...vazio(), ...r };
  t.numero = Number.isInteger(r.numero) ? r.numero : indice + 1;
  t.origem = 'base';
  t.status = r.status || 'concluido';
  t.fontes = { ...(r.fontes || {}) };
  for (const c of CAMPOS_NUMERICOS) if (!ausente(t[c]) && !t.fontes[c]) t.fontes[c] = 'print';
  if (t.tipo) t.tipo = String(t.tipo).toLowerCase();
  return t;
}

export function slug(texto) {
  const s = normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return s || 'trilha';
}

export function idUnico(nome, existentes) {
  const base = slug(nome);
  if (!existentes.has(base)) return base;
  let i = 2;
  while (existentes.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function pendencias(t) {
  return PENDENCIAS.filter(([c]) => ausente(t[c])).map(([, r]) => r);
}

export function validar(t) {
  const erros = {};
  if (!String(t.nome || '').trim()) erros.nome = 'Informe o nome da trilha.';
  if (!String(t.local || '').trim()) erros.local = 'Informe a localidade.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.data || '') || Number.isNaN(Date.parse(t.data))) erros.data = 'Informe uma data válida.';
  const faixa = (c, min, max, msg) => {
    if (!ausente(t[c]) && (!Number.isFinite(t[c]) || t[c] < min || t[c] > max)) erros[c] = msg;
  };
  faixa('distanciaKm', 0, 2000, 'Distância deve estar entre 0 e 2.000 km.');
  faixa('tempoTotalMin', 0, 60 * 24 * 60, 'Tempo total inválido.');
  faixa('tempoMovMin', 0, 60 * 24 * 60, 'Tempo em movimento inválido.');
  faixa('desnivelPos', 0, 30000, 'Desnível positivo deve estar entre 0 e 30.000 m.');
  faixa('desnivelNeg', 0, 30000, 'Desnível negativo deve estar entre 0 e 30.000 m.');
  faixa('altitudeMin', -500, 9000, 'Altitude mínima fora do intervalo plausível.');
  faixa('altitudeMax', -500, 9000, 'Altitude máxima fora do intervalo plausível.');
  faixa('esforco', 1, 10, 'Esforço vai de 1 a 10.');
  if (!ausente(t.tempoTotalMin) && !ausente(t.tempoMovMin) && t.tempoMovMin > t.tempoTotalMin) {
    erros.tempoMovMin = 'O tempo em movimento não pode passar do tempo total.';
  }
  if (!ausente(t.altitudeMin) && !ausente(t.altitudeMax) && t.altitudeMin > t.altitudeMax) {
    erros.altitudeMin = 'A altitude mínima não pode ser maior que a máxima.';
  }
  if (t.coordInicio) {
    const [la, lo] = t.coordInicio;
    if (!(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) erros.coordInicio = 'Coordenadas fora do intervalo (lat ±90, lon ±180).';
  }
  if (t.wikiloc && !/^https?:\/\//i.test(t.wikiloc)) erros.wikiloc = 'O link precisa começar com http:// ou https://.';
  return erros;
}

// Aceita "-22.89, -46.86" ou "-22.89 -46.86".
export function lerCoordenadas(texto) {
  const s = String(texto || '').trim();
  if (!s) return { valor: null };
  const m = s.replace(/;/g, ',').match(/^(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return { erro: 'Use o formato "latitude, longitude" em graus decimais, ex.: -22.89, -46.86.' };
  const la = parseFloat(m[1].replace(',', '.'));
  const lo = parseFloat(m[2].replace(',', '.'));
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return { erro: 'Coordenadas fora do intervalo (lat ±90, lon ±180).' };
  return { valor: [la, lo] };
}

// Formato de `dados/trilhas.js`, para promover um registro local à base ("Copiar como registro").
export function comoRegistroBase(t) {
  const chaves = ['id', 'numero', 'nome', 'data', 'local', 'regiao', 'categoria', 'distanciaKm', 'desnivelPos', 'desnivelNeg',
    'altitudeMin', 'altitudeMax', 'tempoTotalMin', 'tempoMovMin', 'dificuldade', 'tipo', 'wikiloc', 'esforco', 'notas',
    'clima', 'companhia', 'tracado', 'pontos', 'cume', 'perfil', 'fontePerfil', 'fontes'];
  const o = {};
  for (const k of chaves) o[k] = t[k] ?? null;
  return o;
}
