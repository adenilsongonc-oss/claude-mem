// Service worker do Atlas Selvagem.
// Estratégia: o app (HTML, CSS, JS, fontes, dados base, Leaflet) é pré-carregado num cache versionado
// e servido cache-first. Navegações caem em index.html (rotas por hash) ou offline.html.
// Não guardamos tiles de mapa nem qualquer resposta de outra origem; dados pessoais ficam só no IndexedDB.
// Ao mudar qualquer arquivo do app, incremente VERSAO: a nova versão espera até o usuário aceitar atualizar.

const VERSAO = 'v1';
const CACHE = `atlas-selvagem-${VERSAO}`;

const ARQUIVOS = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/estilo.css',
  'js/app.js',
  'js/armazenamento.js',
  'js/backup.js',
  'js/calculos.js',
  'js/componentes.js',
  'js/desenho.js',
  'js/estado.js',
  'js/formato.js',
  'js/gpx.js',
  'js/mapa.js',
  'js/modelo.js',
  'js/preferencias.js',
  'js/pwa.js',
  'js/ui.js',
  'js/telas/arquivo.js',
  'js/telas/atlas.js',
  'js/telas/detalhe.js',
  'js/telas/distintivos.js',
  'js/telas/estatisticas.js',
  'js/telas/expedicao.js',
  'js/telas/exploracao.js',
  'js/telas/saida.js',
  'dados/trilhas.js',
  'dados/folhas-em-branco.js',
  'dados/checklist.js',
  'dados/icones.json',
  'fontes/cinzel-decorative-latin-400-normal.woff2',
  'fontes/cinzel-decorative-latin-700-normal.woff2',
  'fontes/im-fell-english-latin-400-normal.woff2',
  'fontes/im-fell-english-latin-400-italic.woff2',
  'fontes/inter-latin-400-normal.woff2',
  'fontes/inter-latin-500-normal.woff2',
  'fontes/inter-latin-600-normal.woff2',
  'fontes/inter-latin-700-normal.woff2',
  'fontes/ibm-plex-mono-latin-400-normal.woff2',
  'fontes/ibm-plex-mono-latin-500-normal.woff2',
  'vendor/leaflet/leaflet-src.esm.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'icones/icone.svg',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-maskable-512.png',
  'icones/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // `cache: 'reload'` evita guardar cópias velhas do cache HTTP.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))));
  // Primeira instalação assume na hora; atualizações esperam a confirmação do usuário (PULAR_ESPERA).
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('atlas-selvagem-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.tipo === 'PULAR_ESPERA') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles e links externos: direto da rede, sem cache

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const app = await cache.match('index.html');
      if (app) return app;
      try { return await fetch(req); } catch { return (await cache.match('offline.html')) || Response.error(); }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const achado = await cache.match(req, { ignoreSearch: true });
    if (achado) return achado;
    try {
      return await fetch(req);
    } catch {
      return new Response('', { status: 504, statusText: 'Sem conexão e fora do cache' });
    }
  })());
});
