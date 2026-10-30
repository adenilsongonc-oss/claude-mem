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
    // Procura nova versão ao voltar para o app (no máximo a cada 30 min).
    let ultima = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima > 30 * 60000) { ultima = Date.now(); reg.update().catch(() => {}); }
    });
    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recarregando) { recarregando = true; location.reload(); } });
  } catch (e) {
    console.warn('Service worker não registrado:', e);
  }
}

export function aplicarAtualizacao() {
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
