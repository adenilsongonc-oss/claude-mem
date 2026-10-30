// Integração cartográfica com Leaflet (servido localmente em vendor/).
// Os tiles vêm de serviços públicos sem chave; respeitamos atribuição e não fazemos pré-carregamento em massa.
// O service worker NÃO guarda tiles: sem rede, o mapa avisa e o restante do app continua funcionando.

import { prefs } from './preferencias.js';
import { esc } from './ui.js';

export const CAMADAS = {
  opentopomap: {
    nome: 'OpenTopoMap (relevo)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    opcoes: { subdomains: 'abc', maxZoom: 17, attribution: 'Dados: © colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · Estilo: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' },
  },
  osm: {
    nome: 'OpenStreetMap (padrão)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opcoes: { maxZoom: 19, attribution: '© colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  },
};

let L = null;
export async function carregarLeaflet() {
  if (L) return L;
  if (!document.querySelector('link[data-leaflet]')) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('../vendor/leaflet/leaflet.css', import.meta.url).href });
    link.dataset.leaflet = '1';
    document.head.append(link);
  }
  L = await import('../vendor/leaflet/leaflet-src.esm.js');
  return L;
}

const cor = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// Cria um mapa num contêiner. Retorna { mapa, L, destruir }.
export async function criarMapa(el, { aoFalharTiles } = {}) {
  const Lf = await carregarLeaflet();
  const camada = CAMADAS[prefs().camada] || CAMADAS.opentopomap;
  const mapa = Lf.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true });
  // O Leaflet precisa de centro e zoom antes de receber camadas; quem chama reenquadra depois.
  mapa.setView([-15.8, -47.9], 4);
  mapa.attributionControl.setPrefix(false);
  let falhas = 0;
  const tiles = Lf.tileLayer(camada.url, { ...camada.opcoes, crossOrigin: true });
  tiles.on('tileerror', () => { falhas++; if (falhas === 3) aoFalharTiles?.(); });
  tiles.on('tileload', () => { falhas = 0; });
  tiles.addTo(mapa);
  // Safari às vezes mede o contêiner antes do layout final; recalcula o tamanho no próximo quadro.
  requestAnimationFrame(() => mapa.invalidateSize());
  mapa.on('focus', () => mapa.scrollWheelZoom.enable());
  mapa.on('blur', () => mapa.scrollWheelZoom.disable());
  return { mapa, L: Lf, destruir: () => mapa.remove() };
}

const marcador = (Lf, latlng, classe, titulo) => Lf.marker(latlng, {
  icon: Lf.divIcon({ className: '', html: `<div class="marcador-ponto marcador-ponto--${classe}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
  title: titulo, keyboard: true,
});

// Desenha um percurso real (pontos [[lat, lon, ...]]) com início e fim. Retorna o grupo de camadas.
export function desenharPercurso(Lf, mapa, trajeto, { nome = '', ativo = true, aoClicar } = {}) {
  const latlngs = trajeto.map((p) => [p[0], p[1]]);
  const g = Lf.featureGroup();
  Lf.polyline(latlngs, { color: cor('--c-tinta') || '#191919', weight: ativo ? 6 : 4, opacity: 0.85, interactive: false }).addTo(g);
  const linha = Lf.polyline(latlngs, { color: cor('--c-amarelo') || '#EAC638', weight: ativo ? 3.5 : 2, opacity: 1 }).addTo(g);
  marcador(Lf, latlngs[0], 'inicio', `Início · ${nome}`).bindTooltip('Início').addTo(g);
  marcador(Lf, latlngs[latlngs.length - 1], 'fim', `Fim · ${nome}`).bindTooltip('Fim').addTo(g);
  if (aoClicar) { linha.on('click', aoClicar); g.eachLayer((l) => l.on?.('click', aoClicar)); }
  g.addTo(mapa);
  return g;
}

export function marcarLocal(Lf, mapa, [lat, lon], nome, aoClicar) {
  const m = marcador(Lf, [lat, lon], 'local', nome).addTo(mapa);
  m.bindTooltip(esc(nome));
  if (aoClicar) m.on('click', aoClicar);
  return m;
}

export function linkOSM(lat, lon, zoom = 14) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}
