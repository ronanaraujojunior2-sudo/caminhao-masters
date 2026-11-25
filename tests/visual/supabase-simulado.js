// SIMULADOR do cliente Supabase — usado SOMENTE nos testes visuais automatizados.
// Substitui a biblioteca real via interceptação de rede no navegador de teste.
const hoje = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
const dia = (n) => { const d = new Date(seg); d.setDate(seg.getDate() + n); return iso(d); };
const HOJE = iso(hoje);
const HOJE_10H = `${HOJE}T10:00:00-04:00`; // registros com data e hora no fuso de Manaus

const U = { admin: '00000000-0000-4000-8000-000000000001', sol: '00000000-0000-4000-8000-000000000002', mot: '00000000-0000-4000-8000-000000000003' };
const CAM = 'c0000000-0000-4000-8000-000000000001';
const O1 = 'b0000000-0000-4000-8000-000000000001', O2 = 'b0000000-0000-4000-8000-000000000002', O3 = 'b0000000-0000-4000-8000-000000000003';
const perfis = [
  { id: U.admin, nome_completo: 'Administrador Exemplo', usuario: 'admin', perfil: 'admin', ativo: true, primeiro_acesso_pendente: false, criado_em: hoje.toISOString() },
  { id: U.sol, nome_completo: 'Solicitante Exemplo', usuario: 'solicitante', perfil: 'solicitante', ativo: true, primeiro_acesso_pendente: false, criado_em: hoje.toISOString() },
  { id: U.mot, nome_completo: 'Motorista Exemplo', usuario: 'motorista', perfil: 'motorista', ativo: true, primeiro_acesso_pendente: false, criado_em: hoje.toISOString() },
  { id: 'u4', nome_completo: 'Novo Funcionário', usuario: 'novo.func', perfil: 'solicitante', ativo: true, primeiro_acesso_pendente: true, criado_em: hoje.toISOString() },
  { id: 'u5', nome_completo: 'Funcionário Desativado', usuario: 'desativado', perfil: 'solicitante', ativo: false, primeiro_acesso_pendente: false, criado_em: hoje.toISOString() },
  { id: 'u6', nome_completo: 'Funcionário Arquivado', usuario: 'arquivado', perfil: 'motorista', ativo: false, arquivado_em: hoje.toISOString(), primeiro_acesso_pendente: false, criado_em: hoje.toISOString() },
  { id: 'u7', nome_completo: 'Ex-motorista Histórico', usuario: 'excluido-abc123', usuario_original: 'ex.motorista', perfil: 'motorista', ativo: false, arquivado_em: hoje.toISOString(), excluido_em: hoje.toISOString(), primeiro_acesso_pendente: false, criado_em: hoje.toISOString() },
];
const obras = [
  { id: O1, nome: 'Obra Exemplo A', endereco: 'Av. Exemplo, 100 - Manaus/AM', responsavel_nome: 'Eng. Responsável A', responsavel_telefone: '(92) 90000-0001', contato1_nome: 'Mestre de obras A', contato1_telefone: '(92) 90000-0011', ativa: true },
  { id: O2, nome: 'Obra Exemplo B', endereco: 'Rua Exemplo, 200 - Manaus/AM', responsavel_nome: 'Eng. Responsável B', responsavel_telefone: '(92) 90000-0002', ativa: true },
  { id: O3, nome: 'Obra Exemplo C (inativa)', endereco: null, responsavel_nome: 'Eng. Responsável C', ativa: false },
  ...Array.from({ length: 28 }, (_, i) => ({ id: 'ob' + i, nome: `Obra Teste ${String(i + 1).padStart(2, '0')}`, endereco: null, responsavel_nome: 'Responsável Teste', ativa: true })),
];
const base = (o) => ({ obra_endereco: obras.find((x) => x.id === o)?.endereco, obra_responsavel: obras.find((x) => x.id === o)?.responsavel_nome, obra_telefone: '(92) 90000-0001', obra_id: o, obra_nome: obras.find((x) => x.id === o)?.nome, caminhao_id: CAM });
const agenda = [
  { origem: 'solicitacao', id: 's1', numero: 11, data: dia(0), periodo: 'manha', situacao: 'concluido', status: 'concluida', execucao: 'finalizada', prioridade: 'normal', ...base(O1), solicitante_id: U.sol, solicitante_nome: 'Solicitante Exemplo', categoria: 'Entrega de materiais', descricao: 'Entrega de blocos cerâmicos' },
  { origem: 'solicitacao', id: 's2', numero: 12, data: HOJE, periodo: 'manha', situacao: 'em_atendimento', status: 'aprovada', execucao: 'em_atendimento', prioridade: 'alta', ...base(O2), solicitante_id: U.sol, solicitante_nome: 'Solicitante Exemplo', categoria: 'Transporte de materiais', descricao: 'Transporte de vergalhões e telas soldadas', local_especifico: 'Bloco B — acesso lateral', observacoes: 'Levar cintas extras', execucao_inicio: hoje.toISOString() },
  { origem: 'solicitacao', id: 's3', numero: 13, data: HOJE, periodo: 'tarde', situacao: 'agendado', status: 'aprovada', execucao: 'aguardando', prioridade: 'normal', ...base(O1), solicitante_id: U.sol, solicitante_nome: 'Solicitante Exemplo', categoria: 'Movimentação de materiais dentro da obra', descricao: 'Içar caixa d’água para a laje' },
  { origem: 'solicitacao', id: 's4', numero: 14, data: dia(7), periodo: 'manha', situacao: 'reservado', status: 'pendente', execucao: 'aguardando', prioridade: 'normal', ...base(O2), solicitante_id: U.sol, solicitante_nome: 'Solicitante Exemplo', categoria: 'Retirada de materiais', descricao: 'Retirada de entulho metálico' },
  { origem: 'bloqueio', id: 'b1', data: dia(4), periodo: 'tarde', situacao: 'bloqueado', status: 'bloqueado', categoria: 'Bloqueio', descricao: 'Uso interno do escritório', caminhao_id: CAM },
  { origem: 'atividade', id: 'a1', data: dia(2), periodo: 'manha', situacao: 'manutencao', status: 'programada', categoria: 'Manutenção Preventiva', descricao: 'Troca de óleo e filtros', obra_responsavel: 'Oficina Exemplo', caminhao_id: CAM },
  { origem: 'atividade', id: 'a1', data: dia(2), periodo: 'tarde', situacao: 'manutencao', status: 'programada', categoria: 'Manutenção Preventiva', descricao: 'Troca de óleo e filtros', caminhao_id: CAM },
  { origem: 'solicitacao', id: 's5', numero: 15, data: dia(8), periodo: 'tarde', situacao: 'agendado', status: 'aprovada', execucao: 'aguardando', prioridade: 'normal', ...base(O1), solicitante_id: U.sol, solicitante_nome: 'Solicitante Exemplo', categoria: 'Apoio operacional à obra', descricao: 'Apoio na montagem de andaimes' },
];
const solicitacoes = agenda.filter((a) => a.origem === 'solicitacao').map((a) => ({
  id: a.id, numero: a.numero, caminhao_id: CAM, obra_id: a.obra_id, solicitante_id: a.solicitante_id, data: a.data, periodo: a.periodo, categoria_nome: a.categoria,
  descricao: a.descricao, justificativa: 'Necessário para o cronograma da obra', local_especifico: a.local_especifico, observacoes: a.observacoes, status: a.status,
  prioridade: a.prioridade, execucao: a.execucao, execucao_inicio: a.execucao_inicio, criado_em: hoje.toISOString(),
  obras: obras.find((o) => o.id === a.obra_id), caminhoes: { nome: 'Munck 01', placa: 'ABC1D23' }, solicitante: { nome_completo: a.solicitante_nome },
  'perfis': { nome_completo: a.solicitante_nome },
}));
const T = {
  perfis, obras,
  configuracoes: [{ id: 1, antecedencia_modo: 'proximo_dia_util', antecedencia_horas: 24, materiais_obrigatorios: false, fuso_horario: 'America/Manaus', alerta_documento_dias: 30, alerta_manutencao_dias: 15, alerta_manutencao_km: 1000 }],
  caminhoes: [{ id: CAM, nome: 'Munck 01', placa: 'ABC1D23', marca_modelo: 'Modelo Exemplo', ano_modelo: '2020/2021', responsavel_nome: 'Responsável Geral Exemplo', responsavel_telefone: '(92) 90000-0000', km_atual: 45230, ativo: true }],
  categorias: ['Transporte de materiais', 'Transporte de ferramentas/equipamentos', 'Retirada de materiais', 'Entrega de materiais', 'Apoio operacional à obra', 'Movimentação de materiais dentro da obra', 'Outros']
    .map((n, i) => ({ id: 'cat' + i, nome: n, ordem: (i + 1) * 10, ativa: true, protegida: n === 'Outros' })),
  vw_agenda: agenda, solicitacoes,
  solicitacao_historico: [
    { id: 1, solicitacao_id: 's4', tipo: 'criacao', texto: 'Solicitação criada.', criado_em: hoje.toISOString(), perfis: { nome_completo: 'Solicitante Exemplo' } },
    { id: 2, solicitacao_id: 's4', tipo: 'esclarecimento_pedido', texto: 'Qual o peso aproximado do material?', criado_em: hoje.toISOString(), perfis: { nome_completo: 'Administrador Exemplo' } },
    { id: 3, solicitacao_id: 's4', tipo: 'esclarecimento_resposta', texto: 'Cerca de 2 toneladas.', criado_em: hoje.toISOString(), perfis: { nome_completo: 'Solicitante Exemplo' } }],
  ocupacoes: [], notificacoes: [{ id: 1, usuario_id: 'x', titulo: 'Nova solicitação nº 14', mensagem: 'Retirada de materiais — Obra Exemplo B', link: '#/solicitacoes/s4', lida: false, criado_em: hoje.toISOString() }],
  ocorrencias: [{ id: 'oc1', tipo: 'impedimento_acesso', descricao: 'Portão da obra fechado na chegada', data_hora: hoje.toISOString(), status: 'aberta', motorista: { nome_completo: 'Motorista Exemplo' } }],
  checklists: [], vw_planos_manutencao: [{ id: 'p1', descricao: 'Troca de óleo', intervalo_km: 10000, ultimo_km: 36000, proximo_km: 46000, situacao: 'proxima', ativo: true }],
  planos_manutencao: [], documentos: [{ id: 'doc1', tipo: 'crlv', descricao: 'CRLV 2026', validade: dia(20), ativo: true, visivel_motorista: true }],
  anexos: [],
  expedientes: [{ id: 'e1', inicio_em: HOJE_10H, fim_em: HOJE_10H, km_inicial: 15200, km_final: 15262, motorista_id: U.mot, perfis: { nome_completo: 'Motorista Exemplo' } }],
  atendimentos: [{ id: 'at1', inicio_em: HOJE_10H, fim_em: HOJE_10H, obra_id: O1, obras: { nome: 'Obra Exemplo A' }, servico: 'Transporte de vergalhões', distancia_km: 18, motorista_id: U.mot, perfis: { nome_completo: 'Motorista Exemplo' }, atendimento_materiais: [] }],
  abastecimentos: [
    { id: 'ab1', caminhao_id: CAM, data_hora: HOJE_10H, km: 15230, litros: 62.5, valor: 412.5, posto: 'Posto Exemplo', observacoes: 'Tanque cheio', motorista_id: U.mot, perfis: { nome_completo: 'Motorista Exemplo' } },
    { id: 'ab2', caminhao_id: CAM, data_hora: HOJE_10H, km: 15250, litros: 20, valor: null, posto: 'Posto Exemplo 2', motorista_id: U.mot, perfis: { nome_completo: 'Motorista Exemplo' } }], auditoria: [{ id: 1, usuario_nome: 'Administrador Exemplo', acao: 'update', tabela: 'solicitacoes', registro_id: 's2', justificativa: null, criado_em: hoje.toISOString(), valor_anterior: { status: 'pendente' }, valor_novo: { status: 'aprovada' } }],
  atividades_operacionais: [], bloqueios: [{ id: 'b1', data: dia(4), periodo: 'tarde', motivo: 'Uso interno do escritório', ativo: true, criado_em: hoje.toISOString(), autor: { nome_completo: 'Administrador Exemplo' } }],
  push_inscricoes: [],
};

let atual = null;
const sessao = () => (atual ? { access_token: 'simulado', user: { id: atual } } : null);
try { atual = sessionStorage.getItem('sim-usuario'); } catch { /* */ }

class Consulta {
  constructor(t) { this.t = t; this.filtros = []; this.op = 'select'; this.um = false; this.cabeca = false; }
  select(_c, o) { if (o?.head) this.cabeca = true; return this; }
  eq(k, v) { this.filtros.push((r) => r[k] === undefined || r[k] === v || (k === 'ativo' || k === 'ativa' ? r[k] === v : r[k] === v)); return this; }
  neq(k, v) { this.filtros.push((r) => r[k] !== v); return this; }
  in(k, vs) { this.filtros.push((r) => r[k] === undefined || vs.includes(r[k])); return this; }
  gte(k, v) { this.filtros.push((r) => r[k] === undefined || String(r[k]) >= v); return this; }
  lte(k, v) { this.filtros.push((r) => r[k] === undefined || String(r[k]) <= v); return this; }
  is(k, v) { this.filtros.push((r) => r[k] === undefined || (v === null ? r[k] == null : r[k] === v)); return this; } ilike() { return this; } order() { return this; } limit() { return this; } range() { return this; }
  insert() { this.op = 'w'; return this; } update() { this.op = 'w'; return this; } upsert() { this.op = 'w'; return this; } delete() { this.op = 'w'; return this; }
  maybeSingle() { this.um = true; return this; } single() { this.um = true; return this; }
  then(ok, falha) {
    if (this.t === 'despesas') return Promise.resolve({ data: null, error: { message: 'permission denied for table despesas' } }).then(ok, falha);
    window.__tabelasLidas = [...new Set([...(window.__tabelasLidas || []), this.t])];
    let linhas = (T[this.t] || []).filter((r) => this.filtros.every((f) => f(r)));
    if (this.t === 'perfis' && this.um) linhas = perfis.filter((p) => p.id === atual);
    const r = this.op === 'w' ? { data: this.um ? { id: 'novo', numero: 99 } : [], error: null }
      : this.cabeca ? { data: null, count: linhas.length, error: null }
      : { data: this.um ? linhas[0] || null : linhas, count: linhas.length, error: null };
    return Promise.resolve(r).then(ok, falha);
  }
}

export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: sessao() } }),
      getUser: async () => ({ data: { user: sessao()?.user } }),
      signInWithPassword: async ({ email }) => {
        const u = perfis.find((p) => email.startsWith(p.usuario + '@'));
        if (!u) return { error: { message: 'Invalid login credentials' } };
        atual = u.id; sessionStorage.setItem('sim-usuario', u.id); return { data: {}, error: null };
      },
      signOut: async () => { atual = null; sessionStorage.removeItem('sim-usuario'); return {}; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (t) => new Consulta(t),
    rpc: async (fn, args) => {
      if (fn === 'importar_obras_sienge') {
        window.__ultimaImportacao = args;
        const n = (a) => args.p_linhas.filter((l) => l.acao === a).length;
        return { data: { cadastradas: n('cadastrar'), vinculadas: n('vincular'), atualizadas: n('atualizar'), nao_aplicadas: 0,
          resultados: args.p_linhas.map((l) => ({ codigo: l.codigo, nome: l.nome, acao: l.acao, ok: true })) }, error: null };
      }
      if (fn === 'resumo_financeiro') throw new Error('resumo_financeiro não existe mais');
      if (fn === 'criar_solicitacao') return { data: { id: 's4', numero: 16 }, error: null };
      return { data: null, error: null };
    },
    channel: () => ({ on() { return this; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 50); return this; } }),
    removeChannel: async () => {},
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'data:,' } }), upload: async () => ({ data: { path: 'x' } }) }) },
  };
}
