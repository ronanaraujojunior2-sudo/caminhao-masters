// Relatório operacional: consolidação sem nenhum valor financeiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidar } from '../../web/js/lib/relatorio-operacional.js';

const dados = {
  sols: [
    { status: 'concluida', obra_id: 'o1', obras: { nome: 'Obra A' } },
    { status: 'aprovada', obra_id: 'o1', obras: { nome: 'Obra A' } },
    { status: 'recusada', obra_id: 'o2', obras: { nome: 'Obra B' } },
    { status: 'pendente', obra_id: 'o2', obras: { nome: 'Obra B' } },
  ],
  atds: [
    { inicio_em: '2026-11-03T08:00:00-04:00', fim_em: '2026-11-03T11:00:00-04:00', obra_id: 'o1', obras: { nome: 'Obra A' }, distancia_km: 12 },
    { inicio_em: '2026-12-01T08:00:00-04:00', fim_em: null, obra_id: 'o1', obras: { nome: 'Obra A' }, distancia_km: null },
  ],
  exps: [
    { inicio_em: '2026-11-03T07:00:00-04:00', km_inicial: 1000, km_final: 1080 },
    { inicio_em: '2026-12-01T07:00:00-04:00', km_inicial: 1080, km_final: null },
  ],
  abs: [{ data_hora: '2026-11-03T10:00:00-04:00', litros: 40, valor: 300 }, { data_hora: '2026-11-04T10:00:00-04:00', litros: 0, valor: null }],
  ativ: [{ data: '2026-11-05', tipo: 'lavagem', status: 'concluida' }, { data: '2026-11-20', tipo: 'manutencao_preventiva', status: 'programada' }],
  ocs: [{ data_hora: '2026-11-03T09:00:00-04:00', status: 'aberta' }, { data_hora: '2026-11-04T09:00:00-04:00', status: 'resolvida' }],
};

test('indicadores operacionais', () => {
  const R = consolidar(dados);
  assert.equal(R.solicitacoes, 4); assert.equal(R.aprovadas, 2); assert.equal(R.recusadas, 1);
  assert.equal(R.atendimentos, 1, 'só atendimentos finalizados contam');
  assert.equal(R.kmRodados, 80, 'só expedientes encerrados contam');
  assert.equal(R.litros, 40); assert.equal(R.consumo, 2);
  assert.equal(R.servicosConcluidos, 1); assert.equal(R.programados, 1);
  assert.equal(R.ocorrencias, 2); assert.equal(R.ocorrenciasAbertas, 1);
});
test('uso por obra e por mês', () => {
  const R = consolidar(dados);
  assert.deepEqual(R.porObra[0], { nome: 'Obra A', solicitacoes: 2, aprovadas: 2, recusadas: 0, atendimentos: 1, km: 12 });
  assert.deepEqual(R.porMes.map((m) => m.mes), ['2026-11'], 'mês só com registros não finalizados não aparece');
  assert.equal(R.porMes[0].km, 80); assert.equal(R.porMes[0].litros, 40);
});
test('nenhum valor em dinheiro no resultado (valor do abastecimento não alimenta relatórios)', () => {
  const texto = JSON.stringify(consolidar(dados));
  assert.ok(!/valor|custo|despesa|300/.test(texto));
});
test('sem dados', () => {
  const R = consolidar({ sols: [], atds: [], exps: [], abs: [], ativ: [], ocs: [] });
  assert.equal(R.consumo, null); assert.deepEqual(R.porMes, []);
});
