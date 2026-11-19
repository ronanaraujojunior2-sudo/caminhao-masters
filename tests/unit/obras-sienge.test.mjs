// Testes da importação de obras do Sienge: leitor de planilha + análise.
// A planilha de teste (tests/fixtures/obras-sienge-teste.xlsx) imita o
// relatório do Sienge com dados fictícios; ela NUNCA vai para o sistema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerPlanilha, lerCSV, lerAba, desescapar } from '../../web/js/lib/planilha-leitor.js';
import { lerRelacaoDasAbas, lerRelacaoObras, planejar, montarEnvio, dataISO, concluida } from '../../web/js/lib/obras-sienge.js';

const arquivo = (nome) => {
  const b = readFileSync(new URL('../fixtures/' + nome, import.meta.url));
  return { name: nome, size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};

test('lê o .xlsx sem biblioteca externa (ZIP + XML)', async () => {
  const abas = await lerPlanilha(arquivo('obras-sienge-teste.xlsx'));
  assert.equal(abas[0].nome, 'Relatório');
  assert.equal(abas[0].linhas[1][6], 'Relatório de Obras e Centros de Custo');
  assert.equal(abas[0].linhas[6][0], 'Obra/Centro de custo');
});

test('relação do Sienge: código, nome, cliente, situação, extras e rejeições', async () => {
  const R = lerRelacaoDasAbas(await lerPlanilha(arquivo('obras-sienge-teste.xlsx')));
  assert.equal(R.linhaCabecalho, 7);
  assert.equal(R.periodo, '01/01/2026 a 16/11/2026');
  assert.ok(R.colunas.includes('Área total') && R.colunas.includes('Projeto'));
  assert.deepEqual(R.lidas.map((l) => l.codigo), ['55', '101', '102', '500', '50']);
  assert.equal(R.lidas[0].dados.area_terreno, '1250.5', 'área preenchida é guardada');
  assert.equal(R.lidas[0].dados.area_total, undefined, 'área zerada não é guardada');
  const a = R.lidas[0];
  assert.equal(a.nome, 'RESIDENCIAL TESTE ALFA');
  assert.equal(a.cliente, 'Cliente Alfa');
  assert.equal(a.situacao, 'Em andamento');
  assert.equal(a.dados.data_cadastro, '2024-03-15');
  assert.equal(a.dados.empresa, '0001 - EMPRESA TESTE ENGENHARIA LTDA');
  assert.equal(a.dados.nivel_apropriacao, 'Obra');
  assert.equal(R.lidas[1].dados.data_cadastro, '2025-01-10');
  assert.equal(R.lidas[2].nome, 'GALPÃO TESTE & CIA <A>', 'caracteres especiais preservados');
  assert.equal(R.rejeitadas.length, 2);
  const P = planejar(R.lidas, []);
  assert.match(P[3].avisos[0], /código 50/, 'nomes iguais no próprio Sienge são avisados');
  assert.match(R.rejeitadas[0].motivo, /não começa com o código/);
  assert.match(R.rejeitadas[1].motivo, /repetido/);
});

test('arquivo que não é a relação de obras é recusado com explicação', () => {
  assert.throws(() => lerRelacaoObras([['Nome', 'Valor'], ['x', 1]]), /Obra\/Centro de custo/);
});

test('.xls antigo e outros formatos recebem orientação', async () => {
  await assert.rejects(lerPlanilha({ name: 'a.xls', size: 10, arrayBuffer: async () => new ArrayBuffer(10) }), /\.xlsx/);
  await assert.rejects(lerPlanilha({ name: 'a.pdf', size: 10, arrayBuffer: async () => new ArrayBuffer(10) }), /Excel/);
  await assert.rejects(lerPlanilha({ name: 'a.xlsx', size: 10, arrayBuffer: async () => new ArrayBuffer(30) }), /válido|corrompido/);
});

test('CSV do Sienge (ponto e vírgula, aspas, quebra de linha)', () => {
  const L = lerCSV('﻿Obra/Centro de custo;Projeto;Situação da obra\r\n"55 - OBRA ""A""";"Cliente; Um";Em andamento\r\n');
  const R = lerRelacaoObras(L);
  assert.equal(R.lidas[0].nome, 'OBRA "A"');
  assert.equal(R.lidas[0].cliente, 'Cliente; Um');
});

test('XML: texto em linha, entidades e células vazias', () => {
  const xml = '<sheetData><row r="2"><c r="B2" t="inlineStr"><is><t>A &amp; B</t></is></c><c r="D2"><v>3.5</v></c></row></sheetData>';
  const L = lerAba(xml, []);
  assert.deepEqual(L[1], ['', 'A & B', '', 3.5]);
  assert.equal(desescapar('&#233;&#x41;'), 'éA');
});

test('datas e situações encerradas', () => {
  assert.equal(dataISO(45366), '2024-03-15');
  assert.equal(dataISO('31/02/2024'), null);
  assert.ok(concluida('Concluída') && concluida('Encerrada') && !concluida('Em andamento'));
});

test('planejar: nova, vincular a obra manual, atualizar, igual e encerrada desmarcada', () => {
  const lidas = [
    { codigo: '55', nome: 'Residencial Alfa', cliente: 'Cliente Alfa', situacao: 'Em andamento', dados: { empresa: 'E' } },
    { codigo: '101', nome: 'Hospital Beta', cliente: 'Novo Cliente', situacao: 'Em andamento', dados: {} },
    { codigo: '102', nome: 'Galpão', cliente: '', situacao: 'Concluída', dados: {} },
    { codigo: '103', nome: 'Igual', cliente: 'C', situacao: 'Em andamento', dados: { empresa: 'E' } },
    { codigo: '104', nome: 'Hospital Beta', cliente: '', situacao: '', dados: {} },
  ];
  const ex = [
    { id: 'm1', nome: 'RESIDENCIAL ALFA', codigo_sienge: null, ativa: true, dados_sienge: {} },
    { id: 's1', nome: 'Hospital Beta', codigo_sienge: '101', cliente: 'Cliente Antigo', situacao_sienge: 'Em andamento', ativa: true, dados_sienge: {} },
    { id: 's2', nome: 'Igual', codigo_sienge: '103', cliente: 'C', situacao_sienge: 'Em andamento', ativa: true, dados_sienge: { empresa: 'E' } },
  ];
  const P = planejar(lidas, ex);
  assert.deepEqual(P.map((p) => p.estado), ['vincular', 'atualizar', 'nova', 'igual', 'nova']);
  assert.equal(P[1].dif[0].k, 'cliente');
  assert.equal(P[2].marcada, false, 'encerrada no Sienge vem desmarcada');
  assert.match(P[4].avisos.join(' '), /outra obra do Sienge com este nome/);
  const E = montarEnvio(P);
  assert.deepEqual(E.map((e) => e.acao), ['vincular', 'atualizar', 'cadastrar']);
  assert.equal(E[0].obra_id, 'm1');
  P[2].marcada = true;
  const E2 = montarEnvio(P);
  assert.equal(E2.find((e) => e.codigo === '102').ativa, false, 'encerrada marcada entra inativa');
});
