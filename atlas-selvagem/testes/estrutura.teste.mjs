import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificar } from '../scripts/verificar.mjs';
import { mensagem } from '../js/telas/saida.js';

test('pré-cache do service worker, imports, JSON e manifesto consistentes', async () => {
  const { problemas } = await verificar();
  assert.deepEqual(problemas, []);
});

test('mensagem da folha de saída segue o roteiro de segurança', () => {
  const m = mensagem({ para: 'Ana', trilha: 'Pico Paraná', partida: 'Fazenda Pico Paraná', data: '2026-11-14', saida: '05:30', volta: '18:00', companhia: 'sozinho', prazo: '2' });
  assert.equal(m, 'Ana, vou fazer a trilha Pico Paraná, saindo de Fazenda Pico Paraná, em 14 nov 2026, às 05:30. Vou sozinho. Volta prevista: 18:00. Se eu não der notícia até 20:00, tente me ligar; sem resposta, acione os bombeiros (193) e passe este roteiro.');
  assert.match(mensagem({ volta: '23:30', prazo: '1' }), /00:30 \(dia seguinte\)/);
});
