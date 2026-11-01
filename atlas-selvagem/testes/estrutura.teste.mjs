import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificar } from '../scripts/verificar.mjs';
import { mensagem, voltaEstimada, resumoGPX } from '../js/telas/saida.js';
import { VERSAO_APP } from '../js/versao.js';
import { readFile } from 'node:fs/promises';

test('pré-cache do service worker, imports, JSON e manifesto consistentes', async () => {
  const { problemas } = await verificar();
  assert.deepEqual(problemas, []);
});

test('mensagem da folha de saída segue o roteiro de segurança', () => {
  const m = mensagem({ para: 'Ana', trilha: 'Pico Paraná', partida: 'Fazenda Pico Paraná', data: '2026-11-14', saida: '05:30', volta: '18:00', companhia: 'sozinho', prazo: '2' });
  assert.equal(m, 'Ana, vou fazer a trilha Pico Paraná, saindo de Fazenda Pico Paraná, em 14 nov 2026, às 05:30. Vou sozinho. Volta prevista: 18:00. Se eu não der notícia até 20:00, tente me ligar; sem resposta, acione os bombeiros (193) e passe este roteiro.');
  assert.match(mensagem({ volta: '23:30', prazo: '1' }), /00:30 \(dia seguinte\)/);
});

test('volta estimada pelo GPX: saída + tempo, arredondada para cima em 15 min', () => {
  assert.equal(voltaEstimada('06:10', 247), '10:30');
  assert.equal(voltaEstimada('23:50', 30), '00:30');
  assert.equal(voltaEstimada('', 120), null);
  assert.equal(voltaEstimada('06:00', null), null);
});

test('resumo do GPX usa o waypoint mais próximo da partida e entra na mensagem', () => {
  const L = { coordInicio: [-22.9, -46.8], distanciaKm: 15.17, desnivelPos: 365, altitudeMax: 1086, tempoTotalMin: 300, tipo: 'circular', nomeGPX: 'Pico das Cabras',
    waypoints: [{ lat: -22.9005, lon: -46.8, nome: 'Estacionamento' }, { lat: -22.95, lon: -46.8, nome: 'Cume' }] };
  const g = resumoGPX(L, 'pico.gpx');
  assert.equal(g.partida, 'Estacionamento');
  assert.equal(resumoGPX({ ...L, waypoints: [] }, 'x').partida, null);
  const m = mensagem({ para: 'Ana', trilha: g.nome, partida: g.partida, data: '2026-11-14', saida: '06:00', volta: '11:00', prazo: '2', gpx: g });
  assert.match(m, /Percurso: 15,2 km, \+365 m de subida, ponto mais alto 1\.086 m, circular\. Coordenadas da partida: -22\.90000, -46\.80000 \(https:\/\/maps\.google\.com\/\?q=-22\.90000,-46\.80000\)\./);
});

test('versão exibida no app é a mesma do service worker', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/const VERSAO = '([^']+)'/)[1], VERSAO_APP);
});
