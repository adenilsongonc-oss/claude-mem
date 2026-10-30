// Formatação para exibição. Valor ausente (null/undefined/NaN) sempre vira "—".

export const VAZIO = '—';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const ausente = (v) => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || v === '';

export function num(v, casas = 0) {
  if (ausente(v)) return VAZIO;
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export const km = (v, casas = 2) => (ausente(v) ? VAZIO : `${num(v, casas)} km`);
export const metros = (v) => (ausente(v) ? VAZIO : `${num(v, 0)} m`);
export const subida = (v) => (ausente(v) ? VAZIO : `+${num(v, 0)} m`);
export const descida = (v) => (ausente(v) ? VAZIO : `−${num(v, 0)} m`);

export function duracao(min) {
  if (ausente(min)) return VAZIO;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function data(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return VAZIO;
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export function mesAno(chave) {
  const [a, m] = chave.split('-').map(Number);
  return `${MESES[m - 1]} ${String(a).slice(2)}`;
}

export function coord(lat, lon) {
  if (ausente(lat) || ausente(lon)) return VAZIO;
  const f = (v, pos, neg) => {
    const a = Math.abs(v);
    const g = Math.floor(a);
    const m = (a - g) * 60;
    return `${g}°${m.toFixed(3).padStart(6, '0')}′ ${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S')} · ${f(lon, 'L', 'O')}`;
}

export const numero = (n) => (ausente(n) ? VAZIO : `Nº ${String(n).padStart(2, '0')}`);

export function ritmo(distanciaKm, tempoMovMin) {
  if (ausente(distanciaKm) || ausente(tempoMovMin) || tempoMovMin <= 0) return null;
  return distanciaKm / (tempoMovMin / 60);
}

export const bytes = (b) => {
  if (ausente(b)) return VAZIO;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${num(b / 1024, 0)} KB`;
  if (b < 1024 ** 3) return `${num(b / 1024 ** 2, 1)} MB`;
  return `${num(b / 1024 ** 3, 2)} GB`;
};

export const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function juntar(lista) {
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

export function hojeISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
