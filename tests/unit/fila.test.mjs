import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fila, armazenamentoMemoria, ehErroDeRede, novoId } from '../../web/js/lib/fila.js';

function servidorFalso() {
  const s = { online: false, gravados: new Map(), chamadas: 0 };
  s.executor = async (op) => {
    s.chamadas++;
    if (!s.online) { const e = new Error('TypeError: Failed to fetch'); throw e; }
    if (op.tabela === 'invalida') { const e = new Error('violates row-level security'); e.status = 403; throw e; }
    if (!s.gravados.has(op.dados.id)) s.gravados.set(op.dados.id, op); // "on conflict do nothing"
  };
  return s;
}

test('registros offline ficam pendentes e sincronizam na ordem quando a conexão volta', async () => {
  const srv = servidorFalso();
  const fila = new Fila({ armazenamento: armazenamentoMemoria(), executor: srv.executor });
  const exp = novoId();
  await fila.adicionar({ tipo: 'insert', tabela: 'expedientes', dados: { id: exp } });
  await fila.adicionar({ tipo: 'insert', tabela: 'checklists', dados: { id: novoId(), expediente_id: exp } });
  let r = await fila.processar();
  assert.equal(r.semRede, true);
  assert.deepEqual(await fila.contar(), { pendentes: 2, erros: 0 });
  srv.online = true;
  r = await fila.processar();
  assert.equal(r.enviados, 2);
  assert.deepEqual(await fila.contar(), { pendentes: 0, erros: 0 });
  assert.deepEqual([...srv.gravados.values()].map((o) => o.tabela), ['expedientes', 'checklists']);
});

test('reenvio do mesmo registro não duplica', async () => {
  const srv = servidorFalso(); srv.online = true;
  const fila = new Fila({ armazenamento: armazenamentoMemoria(), executor: srv.executor });
  const id = novoId();
  await fila.adicionar({ tipo: 'insert', tabela: 'abastecimentos', dados: { id } });
  await fila.adicionar({ tipo: 'insert', tabela: 'abastecimentos', dados: { id } });
  await fila.processar();
  assert.equal(srv.gravados.size, 1);
});

test('erro de regra fica marcado para revisão e não trava os demais', async () => {
  const srv = servidorFalso(); srv.online = true;
  const fila = new Fila({ armazenamento: armazenamentoMemoria(), executor: srv.executor });
  const ruim = await fila.adicionar({ tipo: 'insert', tabela: 'invalida', dados: { id: novoId() } });
  await fila.adicionar({ tipo: 'insert', tabela: 'ocorrencias', dados: { id: novoId() } });
  const r = await fila.processar();
  assert.equal(r.enviados, 1); assert.equal(r.erros, 1);
  const lista = await fila.listar();
  assert.equal(lista[0].estado, 'erro'); assert.match(lista[0].erro, /row-level/);
  await fila.descartar(ruim.id);
  assert.deepEqual(await fila.contar(), { pendentes: 0, erros: 0 });
});

test('processamentos simultâneos não enviam em dobro', async () => {
  const srv = servidorFalso(); srv.online = true;
  const fila = new Fila({ armazenamento: armazenamentoMemoria(), executor: srv.executor });
  await fila.adicionar({ tipo: 'insert', tabela: 'x', dados: { id: novoId() } });
  await Promise.all([fila.processar(), fila.processar(), fila.processar()]);
  assert.equal(srv.chamadas, 1);
});

test('classificação de erros de rede', () => {
  assert.ok(ehErroDeRede(new Error('Failed to fetch')));
  assert.ok(ehErroDeRede({ status: 503 }));
  assert.ok(ehErroDeRede({ status: 0 }));
  assert.ok(!ehErroDeRede({ status: 400, message: 'Antecedência mínima' }));
  assert.match(novoId(), /^[0-9a-f-]{36}$/);
});
