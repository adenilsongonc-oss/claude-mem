// Camada pessoal no IndexedDB do aparelho.
// Stores:
//   trilhas    registros criados aqui (origem 'local') e edições de registros da base (origem 'base')
//   ocultas    ids da base que o usuário excluiu neste aparelho
//   anotacoes  por trilhaId: favorito, tags, diário, pontos de interesse, alertas, sugestões descartadas
//   trajetos   por trilhaId: pontos reais do GPX [[lat, lon, ele|null, t|null], ...] + assinatura
//   fotos      { id, trilhaId, blob, tipo, legenda, pontoId, largura, altura, criadoEm }
//   meta       chave/valor: contador de números, checklist, rascunhos, folhas em branco

const NOME = 'atlas-selvagem';
const VERSAO = 1;
export const STORES = ['trilhas', 'ocultas', 'anotacoes', 'trajetos', 'fotos', 'meta'];

let conexao = null;

export class ErroArmazenamento extends Error {}

export function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new ErroArmazenamento('Este navegador não oferece IndexedDB. Os registros não podem ser guardados.'));
      return;
    }
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trilhas')) db.createObjectStore('trilhas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ocultas')) db.createObjectStore('ocultas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('anotacoes')) db.createObjectStore('anotacoes', { keyPath: 'trilhaId' });
      if (!db.objectStoreNames.contains('trajetos')) db.createObjectStore('trajetos', { keyPath: 'trilhaId' });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'id' }).createIndex('trilhaId', 'trilhaId');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'chave' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); conexao = null; };
      resolve(db);
    };
    req.onerror = () => reject(new ErroArmazenamento(`Não foi possível abrir o banco local: ${req.error?.message || 'erro desconhecido'}`));
    req.onblocked = () => reject(new ErroArmazenamento('O banco local está bloqueado por outra aba aberta do Atlas. Feche-a e tente de novo.'));
  });
  conexao.catch(() => { conexao = null; });
  return conexao;
}

const pedir = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

function erroEscrita(e) {
  const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
  return new ErroArmazenamento(quota
    ? 'Sem espaço no armazenamento do navegador. Exporte um backup e remova fotos grandes antes de continuar.'
    : `Falha ao gravar no banco local: ${e?.message || e}`);
}

// Executa `fn(stores)` numa transação; resolve quando a transação termina (garantia de gravação).
export async function transacao(nomes, modo, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    let resultado;
    let tx;
    try { tx = db.transaction(nomes, modo); } catch (e) { reject(erroEscrita(e)); return; }
    const stores = Object.fromEntries(nomes.map((n) => [n, tx.objectStore(n)]));
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(modo === 'readwrite' ? erroEscrita(tx.error) : new ErroArmazenamento(`Falha de leitura: ${tx.error?.message}`));
    tx.onabort = () => reject(erroEscrita(tx.error || new Error('transação abortada')));
    Promise.resolve(fn(stores)).then((r) => { resultado = r; }, (e) => { try { tx.abort(); } catch { /* já encerrada */ } reject(e); });
  });
}

export const todos = (store) => transacao([store], 'readonly', (s) => pedir(s[store].getAll()));
export const obter = (store, chave) => transacao([store], 'readonly', (s) => pedir(s[store].get(chave)));
export const gravar = (store, valor) => transacao([store], 'readwrite', (s) => { s[store].put(valor); });
export const remover = (store, chave) => transacao([store], 'readwrite', (s) => { s[store].delete(chave); });

export async function lerMeta(chave, padrao = null) {
  const r = await obter('meta', chave);
  return r ? r.valor : padrao;
}
export const gravarMeta = (chave, valor) => gravar('meta', { chave, valor });

export const fotosDa = (trilhaId) => transacao(['fotos'], 'readonly', (s) => pedir(s.fotos.index('trilhaId').getAll(trilhaId)));

// Contagem de fotos por trilha sem carregar os blobs.
export const contarFotos = () => transacao(['fotos'], 'readonly', (s) => new Promise((res, rej) => {
  const out = {};
  const req = s.fotos.index('trilhaId').openKeyCursor();
  req.onsuccess = () => {
    const c = req.result;
    if (!c) { res(out); return; }
    out[c.key] = (out[c.key] || 0) + 1;
    c.continue();
  };
  req.onerror = () => rej(req.error);
}));

// Remove uma trilha e tudo que pertence a ela, numa única transação.
export function apagarTrilha(id, { daBase }) {
  return transacao(['trilhas', 'ocultas', 'anotacoes', 'trajetos', 'fotos'], 'readwrite', async (s) => {
    s.trilhas.delete(id);
    s.anotacoes.delete(id);
    s.trajetos.delete(id);
    const chaves = await pedir(s.fotos.index('trilhaId').getAllKeys(id));
    for (const k of chaves) s.fotos.delete(k);
    if (daBase) s.ocultas.put({ id, em: new Date().toISOString() });
  });
}

export async function estimativa() {
  try {
    const e = await navigator.storage?.estimate?.();
    const persistente = await navigator.storage?.persisted?.();
    return e ? { usado: e.usage, cota: e.quota, persistente: !!persistente } : null;
  } catch { return null; }
}

export async function pedirPersistencia() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
