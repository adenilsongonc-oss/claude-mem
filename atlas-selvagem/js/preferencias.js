// Preferências pequenas do aparelho (localStorage). Registros nunca ficam aqui.

const CHAVE = 'atlas-selvagem:prefs';
const PADRAO = { tema: 'sistema', camada: 'opentopomap', ordem: 'data', dir: 'desc' };

let cache = null;
export function prefs() {
  if (cache) return cache;
  try { cache = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch { cache = { ...PADRAO }; }
  return cache;
}
export function definir(chave, valor) {
  cache = { ...prefs(), [chave]: valor };
  try { localStorage.setItem(CHAVE, JSON.stringify(cache)); } catch { /* modo privado: fica só na memória */ }
}

export function aplicarTema() {
  const t = prefs().tema;
  const raiz = document.documentElement;
  if (t === 'claro' || t === 'escuro') raiz.dataset.tema = t; else delete raiz.dataset.tema;
  const escuro = t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#141412' : '#F8F6EF');
  return escuro;
}

export const temaEscuroAtivo = () => {
  const t = prefs().tema;
  return t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
};
