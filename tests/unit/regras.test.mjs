import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../web/js/lib/regras.js';

// Agora fixo: quarta-feira 19/11/2026 08:00 em Manaus (12:00 UTC)
const AGORA = Date.UTC(2026, 10, 19, 12, 0, 0);
const cfg = (modo, horas = 24) => ({ antecedencia_modo: modo, antecedencia_horas: horas });

test('dias úteis e próximo dia útil', () => {
  assert.equal(R.ehDiaUtil('2026-11-21'), false); // sábado
  assert.equal(R.ehDiaUtil('2026-11-23'), true);  // segunda
  assert.equal(R.proximoDiaUtil('2026-11-20'), '2026-11-23'); // sexta -> segunda
  assert.equal(R.proximoDiaUtil('2026-11-19'), '2026-11-20');
});

test('semana começa na segunda e tem 5 dias úteis', () => {
  assert.deepEqual(R.diasUteisDaSemana('2026-11-22'), ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20']);
  assert.deepEqual(R.diasUteisDaSemana('2026-11-19'), ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20']);
});

test('semanas do mês cobrem todos os dias úteis', () => {
  const sem = R.semanasDoMes('2026-11-10');
  const dias = sem.flat().filter((d) => !d.foraDoMes).map((d) => d.data);
  assert.equal(dias.length, 21); // novembro/2026 tem 21 dias úteis
  assert.equal(dias[0], '2026-11-02');
  assert.equal(dias.at(-1), '2026-11-30');
});

test('início do período no fuso de Manaus', () => {
  assert.equal(R.inicioPeriodoMs('2026-11-20', 'manha'), Date.UTC(2026, 10, 20, 11, 0));
  assert.equal(R.inicioPeriodoMs('2026-11-20', 'tarde'), Date.UTC(2026, 10, 20, 17, 0));
  assert.equal(R.hojeNoFuso(Date.UTC(2026, 10, 20, 2, 0)), '2026-11-19'); // 22h do dia 19 em Manaus
});

test('regra: próximo dia útil', () => {
  const c = cfg('proximo_dia_util');
  assert.match(R.validarAgendamento({ data: '2026-11-19', periodo: 'tarde', config: c, agoraMs: AGORA }), /próximo dia útil/);
  assert.equal(R.validarAgendamento({ data: '2026-11-20', periodo: 'manha', config: c, agoraMs: AGORA }), null);
  assert.match(R.validarAgendamento({ data: '2026-11-21', periodo: 'manha', config: c, agoraMs: AGORA }), /segunda a sexta/);
});

test('regra: 24h, 48h e personalizada', () => {
  assert.match(R.validarAgendamento({ data: '2026-11-20', periodo: 'manha', config: cfg('24h'), agoraMs: AGORA }), /24 horas/);
  assert.equal(R.validarAgendamento({ data: '2026-11-20', periodo: 'tarde', config: cfg('24h'), agoraMs: AGORA }), null);
  assert.match(R.validarAgendamento({ data: '2026-11-20', periodo: 'tarde', config: cfg('48h'), agoraMs: AGORA }), /48 horas/);
  assert.equal(R.validarAgendamento({ data: '2026-11-23', periodo: 'manha', config: cfg('personalizado', 72), agoraMs: AGORA }), null);
  assert.match(R.validarAgendamento({ data: '2026-11-20', periodo: 'tarde', config: cfg('personalizado', 72), agoraMs: AGORA }), /72 horas/);
});

test('administrador ignora antecedência mas não passado nem fim de semana', () => {
  const c = cfg('48h');
  assert.equal(R.validarAgendamento({ data: '2026-11-19', periodo: 'tarde', config: c, agoraMs: AGORA, admin: true }), null);
  assert.match(R.validarAgendamento({ data: '2026-11-19', periodo: 'manha', config: c, agoraMs: AGORA, admin: true }), /já começou/);
  assert.match(R.validarAgendamento({ data: '2026-11-22', periodo: 'manha', config: c, agoraMs: AGORA, admin: true }), /segunda a sexta/);
});

test('primeira data permitida', () => {
  assert.equal(R.primeiraDataPermitida({ config: cfg('proximo_dia_util'), agoraMs: AGORA }), '2026-11-20');
  assert.equal(R.primeiraDataPermitida({ config: cfg('48h'), agoraMs: AGORA }), '2026-11-23');
});

test('grade e filtros da agenda', () => {
  const itens = [
    { data: '2026-11-20', periodo: 'manha', situacao: 'agendado', obra_id: 'A', categoria: 'Outros' },
    { data: '2026-11-20', periodo: 'tarde', situacao: 'bloqueado' },
  ];
  const g = R.montarGrade(['2026-11-20', '2026-11-23'], itens);
  assert.equal(g['2026-11-20'].manha.situacao, 'agendado');
  assert.equal(g['2026-11-23'].tarde, null);
  assert.equal(R.filtrarItens(itens, { obra: 'A' }).length, 1);
  assert.equal(R.filtrarItens(itens, { situacao: 'bloqueado' }).length, 1);
  assert.equal(R.filtrarItens(itens, { periodo: 'tarde', situacao: 'agendado' }).length, 0);
});

test('divergência de materiais e situação de documentos', () => {
  assert.equal(R.diferencaMateriais(10, 8.5), -1.5);
  assert.equal(R.diferencaMateriais('', 3), null);
  assert.equal(R.situacaoDocumento('2026-11-01', '2026-11-19').codigo, 'vencido');
  assert.equal(R.situacaoDocumento('2026-12-01', '2026-11-19').rotulo, 'Vence em 12 dia(s)');
  assert.equal(R.situacaoDocumento('2027-06-01', '2026-11-19').codigo, 'valido');
});

test('validação de senha e de nome de usuário', () => {
  assert.ok(R.validarSenha('abc'));
  assert.ok(R.validarSenha('abcdefgh'));
  assert.equal(R.validarSenha('caminhao2026'), null);
  assert.equal(R.validarUsuario('joao.silva'), null);
  assert.ok(R.validarUsuario('João Silva'));
  assert.ok(R.validarUsuario('ab'));
});

test('paginação padrão das tabelas', async () => {
  const { paginar, paginacaoHTML } = await import('../../web/js/ui.js');
  const lista = Array.from({ length: 60 }, (_, i) => i);
  const p0 = paginar(lista, 0);
  assert.equal(p0.itens.length, 25); assert.equal(p0.paginas, 3); assert.equal(p0.inicio, 1); assert.equal(p0.fim, 25);
  const p2 = paginar(lista, 2);
  assert.deepEqual([p2.itens[0], p2.itens.length, p2.desloc], [50, 10, 50]);
  assert.equal(paginar(lista, 99).pagina, 2);          // página além do fim volta para a última
  assert.equal(paginar([], 0).total, 0);
  assert.match(paginacaoHTML(p0), /Página 1 de 3/);
  assert.match(paginacaoHTML(p0), /data-pagina="-1" disabled/);
  assert.equal(paginacaoHTML(paginar([1, 2], 0)), '<p class="pag-info">2 registro(s)</p>');
});
