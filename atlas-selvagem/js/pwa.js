// Registro do service worker, aviso de atualização e instalação.

const ouvintes = new Set();
export const pwa = { atualizacao: null, eventoInstalar: null, instalado: false, suportaSW: 'serviceWorker' in navigator, offlinePronto: false };
const avisar = () => ouvintes.forEach((f) => f(pwa));
export const assinarPWA = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };

export function modoStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function plataforma() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export async function registrar() {
  pwa.instalado = modoStandalone();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pwa.eventoInstalar = e; avisar(); });
  window.addEventListener('appinstalled', () => { pwa.eventoInstalar = null; pwa.instalado = true; avisar(); });
  if (!pwa.suportaSW) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const observar = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { pwa.atualizacao = w; avisar(); }
        if (w.state === 'activated') { pwa.offlinePronto = true; avisar(); }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) { pwa.atualizacao = reg.waiting; avisar(); }
    observar(reg.installing);
    reg.addEventListener('updatefound', () => observar(reg.installing));
    if (reg.active) { pwa.offlinePronto = true; avisar(); }
    registro = reg;
    // Procura nova versão ao abrir e ao voltar para o app (no iPhone o app instalado volta
    // do segundo plano sem recarregar, então só a abertura não basta). No máximo 1 vez por minuto.
    let ultima = 0;
    const checar = () => { if (navigator.onLine && Date.now() - ultima > 60000) { ultima = Date.now(); reg.update().catch(() => {}); } };
    checar();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checar(); });
    // Só recarrega quando o usuário pediu a atualização. Na primeira instalação o SW assume a página
    // (clients.claim) sem recarregar, para não apagar nada que esteja sendo digitado.
    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (pediuAtualizacao && !recarregando) { recarregando = true; location.reload(); }
    });
  } catch (e) {
    console.warn('Service worker não registrado:', e);
  }
}

let pediuAtualizacao = false;
let registro = null;

// Busca uma versão nova agora. Retorna 'nova' (há atualização esperando), 'atual' ou 'erro'.
export async function procurarAtualizacao() {
  if (!registro) return 'erro';
  try {
    await registro.update();
    const w = registro.installing;
    if (w) await new Promise((r) => { const f = () => { if (w.state === 'installed' || w.state === 'redundant') { w.removeEventListener('statechange', f); r(); } }; w.addEventListener('statechange', f); f(); });
    if (registro.waiting && navigator.serviceWorker.controller) { pwa.atualizacao = registro.waiting; avisar(); return 'nova'; }
    return 'atual';
  } catch { return 'erro'; }
}
export function aplicarAtualizacao() {
  pediuAtualizacao = true;
  pwa.atualizacao?.postMessage({ tipo: 'PULAR_ESPERA' });
}

export async function instalar() {
  const e = pwa.eventoInstalar;
  if (!e) return 'indisponivel';
  e.prompt();
  const { outcome } = await e.userChoice;
  pwa.eventoInstalar = null;
  avisar();
  return outcome;
}
