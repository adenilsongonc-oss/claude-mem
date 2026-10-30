import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRILHAS } from '../dados/trilhas.js';
import { FOLHAS_EM_BRANCO } from '../dados/folhas-em-branco.js';
import { daBase, validar, pendencias, lerCoordenadas, idUnico } from '../js/modelo.js';
import {
  progresso, degraus, distintivos, resumo, filtrar, ordenar, FILTROS_PADRAO, filtrosAtivos, somar, controlesPorKm, leitura, porMes,
} from '../js/calculos.js';

const base = TRILHAS.map(daBase);
const t = (o) => ({ ...daBase({ id: o.id, nome: o.id, data: '2026-01-01', local: 'x' }, 0), ...o });

test('próxima meta com o dado atual: 17 km, 450 m (recomendada) ou 1.300 m', () => {
  const { porId } = progresso(base);
  const meta = porId['pico-das-cabras'].meta;
  const alvo = Object.fromEntries(meta.opcoes.map((o) => [o.k, o.alvo]));
  assert.deepEqual(alvo, { km: 17, sub: 450, alt: 1300 });
  assert.equal(meta.recK, 'sub');
  assert.equal(meta.semDif, true);
});

test('degraus das folhas em branco: Getúlio 2, Itapiroca 5, Pico Paraná 8', () => {
  const { best } = progresso(base);
  const n = Object.fromEntries(FOLHAS_EM_BRANCO.map((f) => [f.id, degraus(f, best).n]));
  assert.deepEqual(n, { 'pb-getulio': 2, 'pb-itapiroca': 5, 'pb-pico-parana': 8 });
});

test('meta cumprida na folha seguinte é detectada e conta para distintivos', () => {
  const L = [...base, t({ id: 'nova', data: '2026-11-02', distanciaKm: 8, desnivelPos: 460 })];
  const { porId } = progresso(L);
  assert.equal(porId.nova.cumprida.ok, true);
  assert.equal(porId.nova.cumprida.recomendada, true);
  const d = distintivos(L).find((x) => x.cod === 36);
  assert.equal(d.ganho, true);
  assert.equal(d.trilhaId, 'nova');
});

test('distintivos: sem tempo em movimento mostra "sem dado", nunca zero', () => {
  const D = distintivos(base);
  const dia = D.find((x) => x.cod === 46);
  assert.equal(dia.semDado, true);
  assert.equal(dia.atualTxt, '—');
  assert.equal(D.find((x) => x.cod === 34).ganho, true); // 15,16 km
  assert.equal(D.find((x) => x.cod === 37).ganho, true); // 1.086 m
  assert.equal(D.find((x) => x.cod === 38).ganho, false); // 382 m
});

test('somas distinguem ausente de zero e não misturam subida com descida', () => {
  const L = [t({ id: 'a', desnivelPos: 300, desnivelNeg: 280 }), t({ id: 'b', desnivelPos: null, desnivelNeg: 100 })];
  assert.deepEqual(somar(L, 'desnivelPos'), { valor: 300, com: 1, total: 2 });
  assert.deepEqual(somar([t({ id: 'c' })], 'tempoMovMin'), { valor: null, com: 0, total: 1 });
  const r = resumo(L);
  assert.equal(r.subida.valor, 300);
  assert.equal(resumo([]).distancia.valor, null);
});

test('regiões contam valores distintos ignorando acento e caixa', () => {
  const r = resumo([t({ id: 'a', regiao: 'Serra do Japi' }), t({ id: 'b', regiao: 'serra do japí' }), t({ id: 'c' })]);
  assert.equal(r.regioes.length, 1);
  assert.equal(r.semRegiao, 1);
});

test('busca por nome, localidade, região e identificador', () => {
  const L = [t({ id: 'pico', nome: 'Pico das Cabras', local: 'Joaquim Egídio', regiao: 'Campinas', numero: 1 }), t({ id: 'outra', nome: 'Outra', numero: 2 })];
  const f = (q) => filtrar(L, { ...FILTROS_PADRAO, q }).map((x) => x.id);
  assert.deepEqual(f('cabras'), ['pico']);
  assert.deepEqual(f('egidio'), ['pico']);
  assert.deepEqual(f('campinas'), ['pico']);
  assert.deepEqual(f('outra'), ['outra']);
  assert.deepEqual(f('nº 02'), ['outra']);
});

test('filtros combinados e contagem de filtros ativos', () => {
  const L = [
    t({ id: 'a', distanciaKm: 5, tipo: 'circular', dificuldade: 'Fácil' }),
    t({ id: 'b', distanciaKm: 12, tipo: 'circular', dificuldade: null }),
    t({ id: 'c', distanciaKm: 20, tipo: 'travessia' }),
  ];
  const f = { ...FILTROS_PADRAO, tipo: 'circular', kmMin: 6 };
  assert.deepEqual(filtrar(L, f).map((x) => x.id), ['b']);
  assert.equal(filtrosAtivos(f), 2);
  assert.deepEqual(filtrar(L, { ...FILTROS_PADRAO, dificuldade: '__nd' }).map((x) => x.id), ['b', 'c']);
  assert.deepEqual(filtrar(L, { ...FILTROS_PADRAO, favoritos: true }, { c: { favorito: true } }).map((x) => x.id), ['c']);
});

test('ordenação mantém valores ausentes no fim nas duas direções', () => {
  const L = [t({ id: 'a', distanciaKm: 5 }), t({ id: 'b', distanciaKm: null }), t({ id: 'c', distanciaKm: 9 })];
  assert.deepEqual(ordenar(L, 'distanciaKm', 'asc').map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(ordenar(L, 'distanciaKm', 'desc').map((x) => x.id), ['c', 'a', 'b']);
});

test('validação: campos obrigatórios e coerência', () => {
  assert.deepEqual(Object.keys(validar({ nome: '', local: '', data: '' })).sort(), ['data', 'local', 'nome']);
  const e = validar({ nome: 'x', local: 'y', data: '2026-01-01', tempoTotalMin: 60, tempoMovMin: 90, altitudeMin: 900, altitudeMax: 800 });
  assert.ok(e.tempoMovMin && e.altitudeMin);
  assert.deepEqual(validar({ nome: 'x', local: 'y', data: '2026-01-01' }), {});
});

test('pendências do registro base', () => {
  const p = pendencias(base[0]);
  assert.ok(p.includes('tempo em movimento'));
  assert.ok(p.includes('dificuldade'));
  assert.ok(!p.includes('distância'));
});

test('coordenadas e ids únicos', () => {
  assert.deepEqual(lerCoordenadas('-22.89, -46.86').valor, [-22.89, -46.86]);
  assert.ok(lerCoordenadas('abc').erro);
  assert.ok(lerCoordenadas('95, 10').erro);
  assert.equal(idUnico('Pico das Cabras', new Set(['pico-das-cabras'])), 'pico-das-cabras-2');
});

test('controles por km: circular usa o comprimento todo, ida e volta só a metade', () => {
  const pts = [[0, 0], [10, 0], [20, 0]];
  assert.equal(controlesPorKm(pts, 10, 'circular').length, 9); // omite o 10 (a menos de 0,5 km do fim)
  assert.equal(controlesPorKm(pts, 10, 'ida e volta').length, 4);
  assert.equal(controlesPorKm(base[0].pontos, base[0].distanciaKm, base[0].tipo).length, 14);
});

test('leitura avisa quando falta tempo em movimento', () => {
  const l = leitura(base[0], base);
  assert.ok(l.some((x) => x.includes('ritmo não pode ser calculado')));
  assert.ok(l.some((x) => x.includes('25 m/km')));
});

test('evolução mensal soma só o mês da trilha', () => {
  const m = porMes(base, 3, new Date('2026-11-15T12:00:00'));
  assert.deepEqual(m.map((x) => x.n), [0, 1, 0]);
  assert.equal(m[1].km.valor, 15.16);
});
