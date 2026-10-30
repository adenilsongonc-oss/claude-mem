// Estado da aplicação: junta a base versionada (dados/trilhas.js) com a camada pessoal (IndexedDB).
// Todas as escritas passam por aqui para manter identificadores e números estáveis.

import { TRILHAS } from '../dados/trilhas.js';
import { FOLHAS_EM_BRANCO } from '../dados/folhas-em-branco.js';
import * as db from './armazenamento.js';
import { daBase, idUnico, vazio } from './modelo.js';

const ouvintes = new Set();
export const estado = {
  trilhas: [], // lista mesclada
  porId: new Map(),
  anotacoes: {}, // trilhaId -> anotação
  fotosPorTrilha: {},
  trajetosIds: new Set(),
  folhasEmBranco: [],
  carregado: false,
  erro: null,
};

export const assinar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach((fn) => fn(estado));

export const BASE = TRILHAS.map(daBase);
const BASE_IDS = new Set(BASE.map((t) => t.id));
export const ehDaBase = (id) => BASE_IDS.has(id);

export async function carregar() {
  try {
    const [locais, ocultas, anot, trajetos, fotos, criadas, registradas] = await Promise.all([
      db.todos('trilhas'), db.todos('ocultas'), db.todos('anotacoes'),
      db.transacao(['trajetos'], 'readonly', (s) => new Promise((res, rej) => { const r = s.trajetos.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })),
      db.contarFotos(), db.lerMeta('folhasCriadas', []), db.lerMeta('folhasRegistradas', []),
    ]);
    const ocultasIds = new Set(ocultas.map((o) => o.id));
    const editadas = new Map(locais.map((t) => [t.id, t]));
    const lista = [];
    for (const b of BASE) {
      if (ocultasIds.has(b.id)) continue;
      const e = editadas.get(b.id);
      lista.push(e ? { ...b, ...e, numero: b.numero, origem: 'base', editadoLocal: true } : b);
    }
    for (const t of locais) if (!BASE_IDS.has(t.id)) lista.push({ ...vazio(), ...t, origem: 'local' });
    estado.trilhas = lista;
    estado.porId = new Map(lista.map((t) => [t.id, t]));
    estado.anotacoes = Object.fromEntries(anot.map((a) => [a.trilhaId, a]));
    estado.trajetosIds = new Set(trajetos);
    estado.fotosPorTrilha = fotos;
    const reg = new Set(registradas);
    estado.folhasEmBranco = [...FOLHAS_EM_BRANCO.map((f) => ({ ...f, origem: 'base' })), ...criadas].filter((f) => !reg.has(f.id));
    estado.carregado = true;
    estado.erro = null;
  } catch (e) {
    estado.erro = e.message || String(e);
    estado.trilhas = BASE.slice();
    estado.porId = new Map(estado.trilhas.map((t) => [t.id, t]));
    estado.folhasEmBranco = FOLHAS_EM_BRANCO.slice();
    estado.carregado = true;
  }
  avisar();
  return estado;
}

async function proximoNumero() {
  const contador = await db.lerMeta('contadorNumero', 0);
  const maior = Math.max(0, contador, ...estado.trilhas.map((t) => t.numero || 0), ...BASE.map((t) => t.numero));
  const n = maior + 1;
  await db.gravarMeta('contadorNumero', n);
  return n;
}

// Salva um registro (novo ou editado). Retorna o registro gravado.
export async function salvarTrilha(dados, { trajeto = null } = {}) {
  const agora = new Date().toISOString();
  const r = { ...dados };
  delete r.editadoLocal;
  if (!r.id) {
    const ids = new Set([...estado.porId.keys(), ...BASE_IDS]);
    r.id = idUnico(r.nome, ids);
    r.numero = await proximoNumero();
    r.criadoEm = agora;
    r.origem = 'local';
  }
  r.atualizadoEm = agora;
  if (ehDaBase(r.id)) r.origem = 'base';
  if (trajeto) r.temTrajeto = true;
  await db.transacao(['trilhas', 'trajetos'], 'readwrite', (s) => {
    s.trilhas.put(r);
    if (trajeto) s.trajetos.put({ trilhaId: r.id, ...trajeto });
  });
  await carregar();
  return estado.porId.get(r.id);
}

export async function descartarEdicaoLocal(id) {
  await db.remover('trilhas', id);
  await carregar();
}

export async function excluirTrilha(id) {
  await db.apagarTrilha(id, { daBase: ehDaBase(id) });
  await carregar();
}

export async function restaurarOcultas() {
  await db.transacao(['ocultas'], 'readwrite', (s) => { s.ocultas.clear(); });
  await carregar();
}

export const anotacaoVazia = (trilhaId) => ({ trilhaId, favorito: false, tags: [], diario: { relato: '', entradas: [] }, pois: [], alertas: [], descartadas: [] });
export const anotacao = (id) => ({ ...anotacaoVazia(id), ...(estado.anotacoes[id] || {}) });

export async function atualizarAnotacao(id, fn) {
  const a = anotacao(id);
  const nova = fn(structuredClone(a)) || a;
  nova.atualizadoEm = new Date().toISOString();
  await db.gravar('anotacoes', nova);
  estado.anotacoes[id] = nova;
  avisar();
  return nova;
}

export const obterTrajeto = (id) => db.obter('trajetos', id);

export async function trajetoDuplicado(assinatura) {
  if (!assinatura) return null;
  const todos = await db.todos('trajetos');
  const t = todos.find((x) => x.assinatura === assinatura);
  return t ? estado.porId.get(t.trilhaId) || null : null;
}

// ---------- Fotos ----------
export const LIMITE_FOTO_ORIGINAL = 25 * 1024 * 1024;

// Reduz a foto para no máximo 1600 px no lado maior (JPEG 0,82). Se não der para decodificar, guarda o original se for pequeno.
export async function prepararFoto(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new Error(`"${arquivo.name}" não é uma imagem.`);
  if (arquivo.size > LIMITE_FOTO_ORIGINAL) throw new Error(`"${arquivo.name}" tem mais de 25 MB.`);
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const esc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
      : await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    return { blob: blob.size < arquivo.size ? blob : arquivo, largura: w, altura: h };
  } catch {
    if (arquivo.size > 4 * 1024 * 1024) throw new Error(`Não foi possível otimizar "${arquivo.name}" neste navegador e ela tem mais de 4 MB.`);
    return { blob: arquivo, largura: null, altura: null };
  }
}

export async function adicionarFotos(trilhaId, arquivos, legenda = '', pontoId = null) {
  const erros = [];
  const prontas = [];
  for (const a of arquivos) {
    try {
      const p = await prepararFoto(a);
      prontas.push({ id: crypto.randomUUID(), trilhaId, blob: p.blob, tipo: p.blob.type, largura: p.largura, altura: p.altura, legenda, pontoId, nomeOriginal: a.name, criadoEm: new Date().toISOString() });
    } catch (e) { erros.push(e.message); }
  }
  if (prontas.length) await db.transacao(['fotos'], 'readwrite', (s) => { prontas.forEach((f) => s.fotos.put(f)); });
  estado.fotosPorTrilha[trilhaId] = (estado.fotosPorTrilha[trilhaId] || 0) + prontas.length;
  avisar();
  return { adicionadas: prontas.length, erros };
}

export const fotosDa = (id) => db.fotosDa(id);
export async function atualizarFoto(foto) { await db.gravar('fotos', foto); avisar(); }
export async function removerFoto(foto) {
  await db.remover('fotos', foto.id);
  estado.fotosPorTrilha[foto.trilhaId] = Math.max(0, (estado.fotosPorTrilha[foto.trilhaId] || 1) - 1);
  avisar();
}

// ---------- Folhas em branco ----------
export async function criarFolhaEmBranco(f) {
  const criadas = await db.lerMeta('folhasCriadas', []);
  const ids = new Set([...criadas.map((x) => x.id), ...FOLHAS_EM_BRANCO.map((x) => x.id)]);
  const nova = { ...f, id: idUnico(`pb-${f.nome}`, ids), origem: 'local' };
  await db.gravarMeta('folhasCriadas', [...criadas, nova]);
  await carregar();
  return nova;
}

export async function marcarFolhaRegistrada(id) {
  const reg = await db.lerMeta('folhasRegistradas', []);
  if (!reg.includes(id)) await db.gravarMeta('folhasRegistradas', [...reg, id]);
  await carregar();
}
