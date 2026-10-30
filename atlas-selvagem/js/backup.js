// Backup da camada pessoal: um único arquivo JSON com todos os stores e as fotos embutidas em base64.
// A base versionada (dados/trilhas.js) não entra: ela já está no código-fonte.

import * as db from './armazenamento.js';
import { validar } from './modelo.js';

export const FORMATO = 'atlas-selvagem-backup';
export const VERSAO_BACKUP = 1;

const paraBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

const deBase64 = (b64, tipo) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo || 'image/jpeg' });
};

export async function gerarBackup() {
  const [trilhas, ocultas, anotacoes, trajetos, fotos, meta] = await Promise.all(db.STORES.map((s) => db.todos(s)));
  const fotosSerial = [];
  for (const f of fotos) {
    const { blob, ...resto } = f;
    fotosSerial.push({ ...resto, dados: blob ? await paraBase64(blob) : null });
  }
  return {
    formato: FORMATO, versao: VERSAO_BACKUP, exportadoEm: new Date().toISOString(),
    contagem: { trilhas: trilhas.length, anotacoes: anotacoes.length, trajetos: trajetos.length, fotos: fotos.length },
    trilhas, ocultas, anotacoes, trajetos, fotos: fotosSerial, meta,
  };
}

// Valida a estrutura antes de qualquer escrita. Retorna { ok, erros, avisos, dados, conflitos }.
export async function analisarBackup(texto) {
  const erros = [];
  const avisos = [];
  let d;
  try { d = JSON.parse(texto); } catch { return { ok: false, erros: ['O arquivo não é um JSON válido.'] }; }
  if (!d || d.formato !== FORMATO) return { ok: false, erros: ['Este arquivo não é um backup do Atlas Selvagem.'] };
  if (d.versao > VERSAO_BACKUP) return { ok: false, erros: [`Backup de uma versão mais nova (v${d.versao}). Atualize o aplicativo antes de restaurar.`] };
  for (const s of db.STORES) if (d[s] !== undefined && !Array.isArray(d[s])) erros.push(`Seção "${s}" corrompida.`);
  if (erros.length) return { ok: false, erros };
  d.trilhas = (d.trilhas || []).filter((t) => {
    const e = t && typeof t.id === 'string' ? validar(t) : { id: 'sem id' };
    if (Object.keys(e).length) { avisos.push(`Registro "${t?.nome || t?.id || '?'}" ignorado: ${Object.values(e)[0]}`); return false; }
    return true;
  });
  d.fotos = (d.fotos || []).filter((f) => {
    if (!f?.id || !f?.trilhaId || typeof f.dados !== 'string') { avisos.push('Uma foto sem dados foi ignorada.'); return false; }
    return true;
  });
  d.trajetos = (d.trajetos || []).filter((t) => t?.trilhaId && Array.isArray(t.pontos));
  d.anotacoes = (d.anotacoes || []).filter((a) => a?.trilhaId);
  d.ocultas = (d.ocultas || []).filter((o) => o?.id);
  d.meta = (d.meta || []).filter((m) => m?.chave);
  const atuais = new Map((await db.todos('trilhas')).map((t) => [t.id, t]));
  const conflitos = d.trilhas.filter((t) => atuais.has(t.id)).map((t) => ({
    id: t.id, nome: t.nome, local: atuais.get(t.id).atualizadoEm, backup: t.atualizadoEm,
    backupMaisNovo: (t.atualizadoEm || '') > (atuais.get(t.id).atualizadoEm || ''),
  }));
  return { ok: true, erros, avisos, dados: d, conflitos };
}

// modo: 'mesclar' (em conflito vence o mais recente) | 'substituir' (apaga a camada pessoal e grava o backup)
export async function restaurar(d, modo) {
  const atuais = modo === 'mesclar' ? new Map((await db.todos('trilhas')).map((t) => [t.id, t])) : new Map();
  const anotAtuais = modo === 'mesclar' ? new Map((await db.todos('anotacoes')).map((a) => [a.trilhaId, a])) : new Map();
  const fotos = d.fotos.map(({ dados, ...f }) => ({ ...f, blob: deBase64(dados, f.tipo) }));
  await db.transacao(db.STORES, 'readwrite', (s) => {
    if (modo === 'substituir') db.STORES.forEach((n) => s[n].clear());
    for (const t of d.trilhas) {
      const a = atuais.get(t.id);
      if (!a || (t.atualizadoEm || '') >= (a.atualizadoEm || '')) s.trilhas.put(t);
    }
    for (const an of d.anotacoes) {
      const a = anotAtuais.get(an.trilhaId);
      if (!a || (an.atualizadoEm || '') >= (a.atualizadoEm || '')) s.anotacoes.put(an);
    }
    d.trajetos.forEach((t) => s.trajetos.put(t));
    d.ocultas.forEach((o) => s.ocultas.put(o));
    fotos.forEach((f) => s.fotos.put(f)); // ids de foto são UUID: a mesma foto não duplica
    for (const m of d.meta) {
      if (modo === 'mesclar' && m.chave === 'contadorNumero') continue;
      s.meta.put(m);
    }
  });
  if (modo === 'mesclar') {
    const cont = d.meta.find((m) => m.chave === 'contadorNumero');
    const atual = await db.lerMeta('contadorNumero', 0);
    if (cont && cont.valor > atual) await db.gravarMeta('contadorNumero', cont.valor);
  }
}

const CSV_CAMPOS = ['numero', 'id', 'nome', 'data', 'local', 'regiao', 'categoria', 'tipo', 'status', 'distanciaKm', 'tempoTotalMin',
  'tempoMovMin', 'desnivelPos', 'desnivelNeg', 'altitudeMin', 'altitudeMax', 'dificuldade', 'esforco', 'clima', 'companhia',
  'terreno', 'equipamentos', 'notas', 'ocorrencias', 'wikiloc', 'origem'];

export function gerarCSV(trilhas, anotacoes = {}) {
  const cel = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [[...CSV_CAMPOS, 'favorito', 'tags'].join(';')];
  for (const t of trilhas) {
    const a = anotacoes[t.id] || {};
    linhas.push([...CSV_CAMPOS.map((c) => cel(t[c])), a.favorito ? 'sim' : '', cel((a.tags || []).join(', '))].join(';'));
  }
  return `﻿${linhas.join('\r\n')}\r\n`;
}

export function baixar(conteudo, nome, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
