import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarPontos, haversine, gerarGPX, perfilReal, ErroGPX } from '../js/gpx.js';

// Percurso sintético: ~1 km para leste e volta pelo mesmo caminho, 1 ponto a cada 10 m.
function idaVolta({ ele = true, tempo = true } = {}) {
  const P = [];
  const n = 100;
  const passo = 10 / 111320 / Math.cos(-22.9 * Math.PI / 180);
  let t = Date.parse('2026-05-10T08:00:00Z');
  for (let i = 0; i <= 2 * n; i++) {
    const k = i <= n ? i : 2 * n - i;
    P.push({ lat: -22.9, lon: -46.8 + k * passo, ele: ele ? 700 + k : null, t: tempo ? t : null });
    t += 10000; // 1 m/s
    if (i === n) t += 30 * 60000; // parada de 30 min no meio
  }
  return P;
}

test('haversine: 1 grau de latitude ≈ 111 km', () => {
  const d = haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(d - 111195) < 50);
});

test('ida e volta: distância, desnível, tempos e tipo', () => {
  const r = analisarPontos(idaVolta());
  assert.ok(Math.abs(r.distanciaKm - 2) < 0.02, `distância ${r.distanciaKm}`);
  assert.equal(r.tipo, 'ida e volta');
  assert.equal(r.altitudeMax, 800);
  assert.equal(r.altitudeMin, 700);
  assert.ok(Math.abs(r.desnivelPos - 100) <= 6, `subida ${r.desnivelPos}`);
  assert.ok(Math.abs(r.desnivelNeg - 100) <= 6);
  assert.equal(r.tempoTotalMin, 63); // 200 × 10 s + 30 min
  assert.equal(r.tempoMovMin, 33); // a parada de 30 min (>600 s) não conta
  assert.equal(r.data, '2026-05-10');
  assert.equal(r.pontos.length, 141);
  assert.equal(r.perfil.length, 40);
});

test('sem elevação nem horário: nada é inventado', () => {
  const r = analisarPontos(idaVolta({ ele: false, tempo: false }));
  assert.equal(r.desnivelPos, null);
  assert.equal(r.altitudeMax, null);
  assert.equal(r.tempoTotalMin, null);
  assert.equal(r.tempoMovMin, null);
  assert.equal(r.data, null);
  assert.equal(r.perfil, null);
  assert.equal(r.cume, null);
  assert.equal(r.ausentes.length, 2);
});

test('travessia quando o fim fica longe do início', () => {
  const P = idaVolta().slice(0, 101);
  assert.equal(analisarPontos(P).tipo, 'travessia');
});

test('percurso curto demais gera erro compreensível', () => {
  assert.throws(() => analisarPontos([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0001 }]), ErroGPX);
});

test('exportação GPX preserva pontos, elevação e horário', () => {
  const traj = [[-22.9, -46.8, 700, Date.parse('2026-05-10T08:00:00Z')], [-22.9, -46.79, null, null]];
  const x = gerarGPX({ nome: 'A & B', local: 'L', data: '2026-05-10' }, traj);
  assert.match(x, /<name>A &amp; B<\/name>/);
  assert.match(x, /<trkpt lat="-22.9" lon="-46.8"><ele>700<\/ele><time>2026-05-10T08:00:00.000Z<\/time><\/trkpt>/);
  assert.match(x, /<trkpt lat="-22.9" lon="-46.79"><\/trkpt>/);
});

test('perfil real só existe com elevação suficiente', () => {
  const P = idaVolta();
  const traj = P.map((p) => [p.lat, p.lon, p.ele, p.t]);
  const pr = perfilReal(traj, 50);
  assert.equal(pr.length, 50);
  assert.equal(pr[0][1], 700);
  assert.equal(perfilReal(P.map((p) => [p.lat, p.lon, null, null])), null);
});
