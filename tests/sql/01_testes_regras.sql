-- =====================================================================
-- CAMINHÃO MASTERS — TESTES AUTOMATIZADOS DO BANCO
-- Executa como superusuário e "se passa" por cada perfil, exatamente como
-- o Supabase faz (papel authenticated + token JWT).
-- Rodar com:  bash tests/rodar_testes_banco.sh
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

create schema if not exists teste;
grant usage on schema teste to anon, authenticated, service_role;

create table if not exists teste.ids (nome text primary key, id uuid);
grant select, insert on teste.ids to authenticated, service_role;

create or replace function teste.id(p text) returns uuid language sql stable as $$
  select id from teste.ids where nome = p $$;

create or replace function teste.entrar(p_nome text, p_iat bigint default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', teste.id(p_nome), 'role', 'authenticated',
    'iat', coalesce(p_iat, floor(extract(epoch from now()))::bigint))::text, false);
end $$;

-- n-ésimo dia útil a partir de daqui a 7 dias (sempre respeita antecedência)
create or replace function teste.dia(n int) returns date language plpgsql stable as $$
declare d date := current_date + 7; c int := 0;
begin
  loop
    if extract(isodow from d) <= 5 then c := c + 1; if c = n then return d; end if; end if;
    d := d + 1;
  end loop;
end $$;

create or replace function teste.sabado() returns date language sql stable as $$
  select d::date from generate_series(current_date + 7, current_date + 14, interval '1 day') d
   where extract(isodow from d) = 6 limit 1 $$;

create or replace function teste.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- executa SQL que DEVE falhar; confere trecho da mensagem
create or replace function teste.erro(p_sql text, p_trecho text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_trecho || '%' then raise notice 'ok - %', p_msg; return; end if;
    raise exception 'FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
  end;
  raise exception 'FALHOU: % (deveria ter dado erro)', p_msg;
end $$;
grant execute on all functions in schema teste to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- PREPARAÇÃO: usuários (como faria a Edge Function)
-- ---------------------------------------------------------------------
do $$
declare r record; v uuid;
begin
  for r in select * from (values ('admin','Administrador Teste','admin'),
                                 ('admin2','Segundo Admin','admin'),
                                 ('sol1','Solicitante Um','solicitante'),
                                 ('sol2','Solicitante Dois','solicitante'),
                                 ('mot','Motorista Teste','motorista')) t(u, n, p) loop
    insert into auth.users (email) values (r.u || '@caminhaomasters.local') returning id into v;
    insert into public.perfis (id, nome_completo, usuario, perfil, primeiro_acesso_pendente, sessoes_invalidadas_em)
    values (v, r.n, r.u, r.p, false, now() - interval '1 hour');
    insert into teste.ids values (r.u, v);
  end loop;
end $$;

\echo '--- 0. Visitante não autenticado'
set role anon;
do $$ begin
  perform teste.erro($q$select * from public.obras$q$, 'permission denied', 'visitante NÃO lê obras');
  perform teste.erro($q$select * from public.perfis$q$, 'permission denied', 'visitante NÃO lê usuários (não revela contas)');
  perform teste.erro($q$select public.svc_validar_codigo_acesso('a','b')$q$, 'permission denied', 'visitante NÃO executa funções de acesso');
end $$;
reset role;
\echo '--- 1. Cadastros e permissões de cadastro'
select teste.entrar('admin');
set role authenticated;
do $$
declare v uuid;
begin
  insert into public.caminhoes (nome, placa, marca_modelo, responsavel_nome) values ('Munck 01','ABC1D23','VW Constellation','Responsável Geral') returning id into v;
  insert into teste.ids values ('cam', v);
  insert into public.obras (nome, responsavel_nome) values ('Obra Ativa','Engenheiro A') returning id into v;
  insert into teste.ids values ('obra', v);
  insert into public.obras (nome, responsavel_nome, ativa) values ('Obra Inativa','Engenheiro B', false) returning id into v;
  insert into teste.ids values ('obra_inativa', v);
  insert into teste.ids select 'cat', id from public.categorias where nome = 'Transporte de materiais';
  insert into teste.ids select 'outros', id from public.categorias where nome = 'Outros';
  perform teste.ok(true, 'admin cadastra caminhão e obras');
  perform teste.erro($q$update public.categorias set ativa = false where nome = 'Outros'$q$, 'Outros', 'categoria Outros não pode ser desativada');
end $$;
reset role;
-- teste.ids precisa de escrita pelo bloco acima
\echo ''

select teste.entrar('sol1');
set role authenticated;
do $$ begin
  perform teste.erro($q$insert into public.obras (nome, responsavel_nome) values ('X','Fulano de Tal')$q$, 'row-level security', 'solicitante NÃO cadastra obra');
  perform teste.erro($q$insert into public.bloqueios (caminhao_id, data, periodo, motivo) values (teste.id('cam'), teste.dia(1), 'manha', 'teste')$q$, 'row-level security', 'solicitante NÃO cria bloqueio');
  perform teste.erro($q$select * from public.credenciais_acesso$q$, 'permission denied', 'solicitante NÃO lê credenciais');
  perform teste.ok((select count(*) from public.auditoria) = 0, 'solicitante NÃO lê auditoria');
end $$;
reset role;

\echo '--- 2. Solicitações e conflitos'
select teste.entrar('sol1');
set role authenticated;
do $$
declare s public.solicitacoes;
begin
  s := public.criar_solicitacao(teste.id('cam'), teste.id('obra'), teste.dia(1), 'manha', teste.id('cat'), 'Levar vergalhões', 'Concretagem dia seguinte');
  perform teste.ok(s.status = 'pendente' and s.solicitante_id = teste.id('sol1'), 'solicitante cria solicitação (pendente, autor = sessão)');
  perform teste.ok(s.categoria_nome = 'Transporte de materiais', 'nome da categoria preservado na solicitação');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'manha', %L, 'x desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(1), teste.id('cat')), 'CONFLITO DE AGENDA', 'mesmo período bloqueado por solicitação pendente');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'manha', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.sabado(), teste.id('cat')), 'segunda a sexta', 'fim de semana recusado');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'manha', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), current_date, teste.id('cat')), '', 'hoje recusado (passado ou antecedência)');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'tarde', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra_inativa'), teste.dia(1), teste.id('cat')), 'inativa', 'obra inativa não recebe solicitação');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'noite', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(1), teste.id('cat')), 'período', 'período inválido recusado');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'tarde', %L, 'desc', '  ')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(1), teste.id('cat')), 'justificativa', 'justificativa obrigatória');
  perform teste.erro(format($q$select public.aprovar_solicitacao(%L)$q$, s.id), 'permissão', 'solicitante NÃO aprova');
  perform teste.erro(format($q$select public.cancelar_solicitacao(%L, 'quero')$q$, s.id), 'permissão', 'solicitante NÃO cancela (só admin)');
  perform teste.erro($q$insert into public.solicitacoes (caminhao_id, obra_id, solicitante_id, data, periodo, categoria_id, categoria_nome, descricao, justificativa) select teste.id('cam'), teste.id('obra'), teste.id('sol2'), teste.dia(5), 'manha', teste.id('cat'), 'x', 'abc', 'abc'$q$, 'permission denied', 'inserção direta na tabela bloqueada (identidade não pode ser forjada)');
end $$;
reset role;

-- antecedência configurável
select teste.entrar('admin'); set role authenticated;
update public.configuracoes set antecedencia_modo = 'personalizado', antecedencia_horas = 24*30;
reset role;
select teste.entrar('sol2'); set role authenticated;
do $$ begin
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'tarde', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(2), teste.id('cat')), 'Antecedência mínima de 720', 'antecedência personalizada respeitada');
end $$;
reset role;
select teste.entrar('admin'); set role authenticated;
do $$ begin
  perform public.criar_solicitacao(teste.id('cam'), teste.id('obra'), teste.dia(2), 'tarde', teste.id('outros'), 'Urgente admin', 'Emergência');
  perform teste.ok(true, 'administrador pode agendar com prazo menor');
end $$;
update public.configuracoes set antecedencia_modo = 'proximo_dia_util';
reset role;

\echo '--- 3. Esclarecimento, recusa e liberação do período'
select teste.entrar('admin'); set role authenticated;
do $$
declare s public.solicitacoes;
begin
  select * into s from public.solicitacoes where data = teste.dia(1) and periodo = 'manha';
  s := public.pedir_esclarecimento(s.id, 'Qual a quantidade de vergalhões?');
  perform teste.ok(s.status = 'esclarecimento', 'admin pede esclarecimento');
  perform teste.ok(exists (select 1 from public.ocupacoes where origem_id = s.id), 'período continua reservado durante esclarecimento');
end $$;
reset role;
select teste.entrar('sol2'); set role authenticated;
do $$ declare v uuid; begin
  select id into v from public.solicitacoes where data = teste.dia(1) and periodo = 'manha';
  perform teste.erro(format($q$select public.responder_esclarecimento(%L, 'resp')$q$, v), 'Somente o solicitante', 'outro solicitante NÃO responde');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'manha', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(1), teste.id('cat')), 'aguardando esclarecimentos', 'conflito informa o motivo da ocupação');
end $$;
reset role;
select teste.entrar('sol1'); set role authenticated;
do $$ declare s public.solicitacoes; begin
  select * into s from public.solicitacoes where data = teste.dia(1) and periodo = 'manha';
  s := public.responder_esclarecimento(s.id, '2 toneladas');
  perform teste.ok(s.status = 'pendente', 'solicitante responde e volta para análise');
  perform teste.ok((select count(*) from public.solicitacao_historico where solicitacao_id = s.id) = 3, 'histórico registra toda a comunicação');
end $$;
reset role;
select teste.entrar('admin'); set role authenticated;
do $$ declare s public.solicitacoes; begin
  select * into s from public.solicitacoes where data = teste.dia(1) and periodo = 'manha';
  perform teste.erro(format($q$select public.recusar_solicitacao(%L, '')$q$, s.id), 'justificativa', 'recusa sem justificativa bloqueada');
  s := public.recusar_solicitacao(s.id, 'Caminhão reservado para serviço interno');
  perform teste.ok(s.status = 'recusada' and not exists (select 1 from public.ocupacoes where origem_id = s.id), 'recusa libera o período');
end $$;
reset role;
select teste.entrar('sol2'); set role authenticated;
do $$ declare s public.solicitacoes; begin
  s := public.criar_solicitacao(teste.id('cam'), teste.id('obra'), teste.dia(1), 'manha', teste.id('cat'), 'Retirar sobras', 'Limpeza do canteiro');
  perform teste.ok(s.status = 'pendente', 'período liberado pode ser solicitado novamente');
  perform teste.ok(not exists (select 1 from public.solicitacoes where status = 'recusada' and solicitante_id <> auth.uid()), 'recusadas de terceiros não aparecem');
end $$;
reset role;
select teste.entrar('sol1'); set role authenticated;
do $$ begin
  perform teste.ok((select count(*) from public.notificacoes where tipo = 'recusa') = 1, 'solicitante notificado da recusa');
  perform teste.ok((select count(*) from public.solicitacao_historico) >= 4, 'solicitante vê histórico das próprias solicitações');
end $$;
reset role;

\echo '--- 4. Aprovação, bloqueios e manutenção'
select teste.entrar('admin'); set role authenticated;
do $$ declare s public.solicitacoes; v uuid; begin
  select * into s from public.solicitacoes where data = teste.dia(1) and periodo = 'manha' and status = 'pendente';
  s := public.aprovar_solicitacao(s.id, 'alta');
  perform teste.ok(s.status = 'aprovada' and s.prioridade = 'alta', 'admin aprova com prioridade');
  perform teste.erro(format($q$insert into public.bloqueios (caminhao_id, data, periodo, motivo) values (%L, %L, 'dia', 'Feriado local')$q$,
    teste.id('cam'), teste.dia(1)), 'CONFLITO DE AGENDA', 'bloqueio impedido sobre solicitação aprovada');
  insert into public.bloqueios (caminhao_id, data, periodo, motivo) values (teste.id('cam'), teste.dia(3), 'dia', 'Feriado municipal') returning id into v;
  insert into teste.ids values ('bloq', v);
  perform teste.ok((select count(*) from public.ocupacoes where origem_id = v) = 2, 'bloqueio de dia inteiro ocupa manhã e tarde');
  perform teste.erro(format($q$insert into public.bloqueios (caminhao_id, data, periodo, motivo) values (%L, %L, 'manha', '  ')$q$,
    teste.id('cam'), teste.dia(4)), 'motivo', 'bloqueio exige motivo');
  insert into public.atividades_operacionais (caminhao_id, tipo, data, periodo, descricao, empresa)
  values (teste.id('cam'), 'manutencao_preventiva', teste.dia(4), 'manha', 'Troca de óleo', 'Oficina X') returning id into v;
  insert into teste.ids values ('ativ', v);
  perform teste.ok(exists (select 1 from public.ocupacoes where origem_id = v), 'manutenção torna o caminhão indisponível');
end $$;
reset role;
select teste.entrar('sol1'); set role authenticated;
do $$ begin
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'tarde', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(3), teste.id('cat')), 'bloqueio administrativo', 'não solicita em dia bloqueado');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'manha', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(4), teste.id('cat')), 'manutenção', 'não solicita durante manutenção');
  perform teste.ok((select count(*) from public.notificacoes where tipo = 'bloqueio') = 1, 'bloqueio notificado aos usuários');
end $$;
reset role;
select teste.entrar('admin'); set role authenticated;
do $$ begin
  perform teste.erro($q$update public.bloqueios set ativo = false where id = teste.id('bloq')$q$, 'motivo da remoção', 'remover bloqueio exige motivo');
  update public.bloqueios set ativo = false, motivo_remocao = 'Feriado transferido' where id = teste.id('bloq');
  perform teste.ok(not exists (select 1 from public.ocupacoes where origem_id = teste.id('bloq')), 'remoção do bloqueio libera a agenda');
  update public.atividades_operacionais set status = 'cancelada' where id = teste.id('ativ');
  perform teste.ok(not exists (select 1 from public.ocupacoes where origem_id = teste.id('ativ')), 'cancelar manutenção libera a agenda');
end $$;
reset role;

\echo '--- 5. Motorista: execução, offline e conclusão administrativa'
-- simula a chegada do dia programado (move a reserva aprovada para hoje)
insert into teste.ids select 'aprov', id from public.solicitacoes where data = teste.dia(1) and periodo = 'manha' and status = 'aprovada';
update public.solicitacoes set data = current_date where id = teste.id('aprov');
select teste.entrar('mot'); set role authenticated;
do $$ declare s public.solicitacoes; begin
  select * into s from public.solicitacoes where id = teste.id('aprov');
  perform teste.ok(s.id is not null, 'motorista vê atividade aprovada');
  perform teste.ok((select count(*) from public.solicitacao_historico) = 0, 'motorista NÃO vê histórico/motivos internos');
  perform teste.ok((select count(*) from public.vw_agenda) > 0, 'motorista vê a agenda consolidada');
  perform teste.erro(format($q$select public.aprovar_solicitacao(%L)$q$, s.id), 'permissão', 'motorista NÃO aprova');
  perform teste.erro(format($q$select public.cancelar_solicitacao(%L, 'x')$q$, s.id), 'permissão', 'motorista NÃO cancela');
  perform teste.erro(format($q$select public.criar_solicitacao(%L, %L, %L, 'tarde', %L, 'desc', 'just')$q$,
    teste.id('cam'), teste.id('obra'), teste.dia(5), teste.id('cat')), 'permissão', 'motorista NÃO solicita');
  s := public.iniciar_atendimento(s.id);
  perform teste.ok(s.execucao = 'em_atendimento', 'motorista inicia atendimento');
  s := public.finalizar_atendimento(s.id, now() - interval '10 minutes', 'Entregue', true);
  perform teste.ok(s.execucao = 'finalizada' and s.execucao_offline, 'finalização offline sincronizada');
  s := public.finalizar_atendimento(s.id, now(), null, true);
  perform teste.ok(s.execucao = 'finalizada', 'sincronização repetida é idempotente (sem duplicar)');
  perform teste.ok(exists (select 1 from public.ocupacoes where origem_id = s.id), 'finalizar NÃO libera o período sem validação do admin');
end $$;
reset role;
select teste.entrar('admin'); set role authenticated;
do $$ declare s public.solicitacoes; begin
  select * into s from public.solicitacoes where id = teste.id('aprov');
  perform teste.ok(exists (select 1 from public.notificacoes where tipo = 'atendimento_finalizado'), 'admin notificado da finalização');
  s := public.concluir_solicitacao(s.id, 'Validado');
  perform teste.ok(s.status = 'concluida' and not exists (select 1 from public.ocupacoes where origem_id = s.id), 'conclusão administrativa libera o período');
  -- cancelamento
  s := public.criar_solicitacao(teste.id('cam'), teste.id('obra'), teste.dia(6), 'manha', teste.id('cat'), 'Desc', 'Just');
  perform public.aprovar_solicitacao(s.id);
  perform teste.erro(format($q$select public.cancelar_solicitacao(%L, '')$q$, s.id), 'motivo', 'cancelamento exige motivo');
  s := public.cancelar_solicitacao(s.id, 'Obra adiada');
  perform teste.ok(s.status = 'cancelada' and not exists (select 1 from public.ocupacoes where origem_id = s.id), 'cancelamento libera o período');
  perform teste.ok(exists (select 1 from public.solicitacao_historico where solicitacao_id = s.id and tipo = 'cancelamento'), 'cancelamento preservado no histórico');
end $$;
reset role;

\echo '--- 6. Diário de Bordo, checklists, abastecimento, ocorrências e despesas'
select teste.entrar('mot'); set role authenticated;
do $$ declare v uuid := gen_random_uuid(); begin
  insert into public.expedientes (id, caminhao_id, motorista_id, inicio_em, km_inicial) values (v, teste.id('cam'), auth.uid(), now(), 1000);
  perform teste.erro(format($q$insert into public.expedientes (id, caminhao_id, motorista_id, inicio_em, km_inicial) values (%L, %L, %L, now(), 1000)$q$,
     gen_random_uuid(), teste.id('cam'), teste.id('sol1')), 'row-level security', 'motorista NÃO registra em nome de outro');
  insert into public.expedientes (id, caminhao_id, motorista_id, inicio_em, km_inicial) values (v, teste.id('cam'), auth.uid(), now(), 1000) on conflict do nothing;
  perform teste.ok((select count(*) from public.expedientes) = 1, 'reenvio offline do mesmo registro não duplica');
  insert into public.checklists (id, expediente_id, caminhao_id, motorista_id, tipo, itens, registrado_em)
  values (gen_random_uuid(), v, teste.id('cam'), auth.uid(), 'abertura',
    '[{"item":"Pneus","resultado":"conforme"},{"item":"Freios","resultado":"irregular","obs":"pedal baixo"}]', now());
  perform teste.ok((select tem_critico from public.checklists limit 1), 'freio irregular marcado como crítico pelo servidor');
  insert into public.abastecimentos (id, caminhao_id, expediente_id, motorista_id, data_hora, km, litros, valor, posto)
  values (gen_random_uuid(), teste.id('cam'), v, auth.uid(), now(), 1050, 80, 520, 'Posto A');
  perform teste.ok((select status from public.despesas where origem = 'abastecimento') = 'pendente', 'abastecimento do motorista gera despesa pendente');
  insert into public.despesas (caminhao_id, categoria, descricao, valor, data, status) values (teste.id('cam'), 'emergencial', 'Pneu furado', 150, current_date, 'aprovada');
  perform teste.ok((select status from public.despesas where descricao = 'Pneu furado') = 'pendente', 'despesa emergencial do motorista fica pendente');
  insert into public.ocorrencias (id, caminhao_id, motorista_id, tipo, descricao, data_hora) values (gen_random_uuid(), teste.id('cam'), auth.uid(), 'impedimento_acesso', 'Portão fechado', now());
  update public.ocorrencias set status = 'resolvida';
  perform teste.ok((select status from public.ocorrencias limit 1) = 'aberta', 'motorista NÃO resolve ocorrência');
  update public.expedientes set km_final = 1080, fim_em = now(), local_estacionamento = 'estacionamento_masters' where id = v;
  perform teste.ok((select count(*) from public.expedientes where fim_em is not null) = 1, 'motorista encerra expediente');
  update public.expedientes set km_final = 5000 where id = v;
  perform teste.ok((select km_final from public.expedientes where id = v) = 1080, 'expediente encerrado não pode ser alterado pelo motorista');
  perform teste.ok((select count(*) from public.planos_manutencao) = 0 and (select count(*) from public.auditoria) = 0, 'motorista NÃO vê planos nem auditoria');
end $$;
reset role;
select teste.entrar('sol1'); set role authenticated;
do $$ begin
  perform teste.erro(format($q$insert into public.expedientes (id, caminhao_id, motorista_id, inicio_em, km_inicial) values (%L, %L, auth.uid(), now(), 1)$q$,
    gen_random_uuid(), teste.id('cam')), 'row-level security', 'solicitante NÃO usa Diário de Bordo');
  perform teste.ok((select count(*) from public.despesas) = 0, 'solicitante NÃO vê despesas');
end $$;
reset role;
select teste.entrar('admin'); set role authenticated;
do $$ declare r jsonb; begin
  perform teste.ok(exists (select 1 from public.notificacoes where tipo = 'irregularidade'), 'admin alertado da irregularidade crítica');
  perform teste.ok(exists (select 1 from public.notificacoes where tipo = 'ocorrencia'), 'admin notificado da ocorrência');
  perform teste.ok((select km_atual from public.caminhoes where id = teste.id('cam')) = 1080, 'KM do caminhão atualizado');
  r := public.resumo_financeiro(teste.id('cam'), current_date - 30, current_date + 1);
  perform teste.ok((r ->> 'total')::numeric = 0 and (r ->> 'pendentes')::numeric = 670, 'despesas pendentes NÃO compõem o total oficial');
  perform teste.erro($q$update public.despesas set status = 'recusada' where descricao = 'Pneu furado'$q$, 'motivo', 'recusa de despesa exige motivo');
  update public.despesas set status = 'aprovada' where status = 'pendente';
  r := public.resumo_financeiro(teste.id('cam'), current_date - 30, current_date + 1);
  perform teste.ok((r ->> 'total')::numeric = 670 and (r ->> 'custo_por_km')::numeric = 8.38, 'aprovadas compõem total e custo/km');
  update public.ocorrencias set status = 'resolvida', resolucao = 'Contato com a obra';
  perform teste.ok((select resolvido_por from public.ocorrencias limit 1) = auth.uid(), 'admin resolve ocorrência (autor pela sessão)');
end $$;
reset role;

\echo '--- 7. Documentos, planos e alertas'
select teste.entrar('admin'); set role authenticated;
do $$ declare n int; v uuid; begin
  insert into public.documentos (caminhao_id, tipo, descricao, validade, visivel_motorista) values (teste.id('cam'), 'crlv', 'CRLV 2026', current_date + 10, true);
  insert into public.documentos (caminhao_id, tipo, descricao, validade) values (teste.id('cam'), 'seguro', 'Apólice', current_date + 200);
  insert into public.planos_manutencao (caminhao_id, descricao, intervalo_km, ultimo_km) values (teste.id('cam'), 'Troca de óleo', 100, 900) returning id into v;
  n := public.gerar_alertas();
  perform teste.ok(n = 2, 'alertas gerados: documento a vencer + manutenção vencida por KM');
  n := public.gerar_alertas();
  perform teste.ok((select count(*) from public.notificacoes where tipo in ('documento','manutencao') and usuario_id = auth.uid()) = 2, 'alertas não se repetem');
  insert into public.atividades_operacionais (caminhao_id, tipo, data, periodo, descricao, plano_id, km_execucao)
  values (teste.id('cam'), 'manutencao_preventiva', teste.dia(7), 'dia', 'Troca de óleo', v, 1080) returning id into v;
  update public.atividades_operacionais set status = 'concluida' where id = v;
  perform teste.ok((select ultimo_km from public.planos_manutencao limit 1) = 1080 and (select situacao from public.vw_planos_manutencao limit 1) <> 'vencida', 'concluir manutenção atualiza o plano preventivo');
end $$;
reset role;
select teste.entrar('mot'); set role authenticated;
do $$ begin
  perform teste.ok((select count(*) from public.documentos) = 1, 'motorista vê só documentos liberados');
end $$;
reset role;

\echo '--- 8. Auditoria, sessões e proteção de administradores'
select teste.entrar('admin'); set role authenticated;
do $$ begin
  perform teste.ok((select count(*) from public.auditoria where tabela = 'solicitacoes') > 0, 'auditoria registra solicitações');
  perform teste.ok(exists (select 1 from public.auditoria where tabela = 'solicitacoes' and justificativa = 'Obra adiada'), 'auditoria guarda justificativa');
  perform teste.ok(not exists (select 1 from public.auditoria where tabela = 'solicitacoes' and usuario_id is null), 'autor da auditoria vem da sessão');
  perform teste.erro($q$delete from public.auditoria$q$, 'permission denied', 'admin NÃO apaga auditoria');
  perform teste.erro($q$update public.auditoria set acao = 'x'$q$, 'permission denied', 'admin NÃO altera auditoria');
  perform teste.erro($q$update public.perfis set usuario = 'outro' where usuario = 'sol1'$q$, 'não pode ser alterado', 'nome de usuário é imutável');
  update public.perfis set ativo = false where usuario = 'admin2';
  perform teste.erro($q$update public.perfis set perfil = 'solicitante' where usuario = 'admin'$q$, 'último administrador', 'último admin ativo protegido');
  perform teste.ok(true, 'admin desativa outro usuário');
end $$;
reset role;
do $$ begin
  begin
    update public.auditoria set acao = 'x';
    raise exception 'FALHOU: auditoria alterada pelo dono do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok - auditoria imutável até para o dono do banco';
  end;
end $$;
select teste.entrar('admin2'); set role authenticated;
do $$ begin
  perform teste.ok(public.fn_meu_perfil() is null, 'usuário desativado perde acesso imediatamente');
end $$;
reset role;
-- sessão antiga após troca de senha
update public.perfis set sessoes_invalidadas_em = now() where usuario = 'sol1';
select teste.entrar('sol1', floor(extract(epoch from now() - interval '1 hour'))::bigint); set role authenticated;
do $$ begin
  perform teste.ok(public.fn_meu_perfil() is null and (select count(*) from public.obras) = 0, 'sessão anterior à recuperação de senha é invalidada');
end $$;
reset role;
select teste.entrar('sol1'); set role authenticated;
do $$ begin
  perform teste.ok(public.fn_meu_perfil() = 'solicitante', 'nova sessão funciona normalmente');
  perform teste.erro($q$update public.notificacoes set titulo = 'x'$q$, 'permission denied', 'usuário NÃO altera texto de notificação');
  perform public.marcar_notificacoes_lidas();
  perform teste.ok(not exists (select 1 from public.notificacoes where not lida), 'usuário marca notificações como lidas');
end $$;
reset role;

\echo '--- 9. Primeiro acesso e chave de recuperação (funções do servidor)'
select teste.entrar('sol1'); set role authenticated;
do $$ begin
  perform teste.erro($q$select public.svc_validar_chave_recuperacao('sol1', 'x')$q$, 'permission denied', 'navegador NÃO executa funções de servidor');
end $$;
reset role;
set role service_role;
do $$ declare v uuid; begin
  perform public.svc_definir_codigo_acesso(teste.id('sol2'), 'ABCD-2345-XY', teste.id('admin'), 'cadastro_usuario');
  perform teste.ok(public.svc_validar_codigo_acesso('sol2', 'abcd2345xy') = teste.id('sol2'), 'código de primeiro acesso válido (sem diferenciar hífens/maiúsculas)');
  perform teste.ok(public.svc_validar_codigo_acesso('sol2', 'ERRADO') is null, 'código errado recusado');
  perform teste.ok(public.svc_validar_codigo_acesso('naoexiste', 'ABCD2345XY') is null, 'usuário inexistente: mesma resposta (não revela contas)');
  perform public.svc_gravar_nova_chave(teste.id('sol2'), 'K7QX2-M9P4T-ZR8WV-3HJ6N', 'primeiro_acesso');
  perform teste.ok(public.svc_validar_codigo_acesso('sol2', 'ABCD2345XY') is null, 'código de primeiro acesso deixa de valer após uso');
  perform teste.ok(public.svc_validar_chave_recuperacao('sol2', 'k7qx2m9p4tzr8wv3hj6n') = teste.id('sol2'), 'chave de recuperação válida');
  perform public.svc_gravar_nova_chave(teste.id('sol2'), 'NOVA1-NOVA2-NOVA3-NOVA4', 'recuperacao_senha');
  perform teste.ok(public.svc_validar_chave_recuperacao('sol2', 'K7QX2-M9P4T-ZR8WV-3HJ6N') is null, 'chave anterior invalidada após recuperação');
  perform teste.ok(not exists (select 1 from public.credenciais_acesso where chave_recuperacao_hash like '%NOVA%'), 'somente o hash da chave é armazenado');
  perform teste.ok(exists (select 1 from public.auditoria where acao = 'recuperacao_senha'), 'recuperação registrada na auditoria');
  for i in 1..5 loop perform public.svc_registrar_tentativa('usuario:sol2', 'recuperacao', false); end loop;
  perform teste.ok(public.svc_limite_excedido('usuario:sol2', 'recuperacao', 5, 15), 'limite de tentativas bloqueia força bruta');
  perform public.svc_registrar_tentativa('usuario:sol2', 'recuperacao', true);
  perform teste.ok(not public.svc_limite_excedido('usuario:sol2', 'recuperacao', 5, 15), 'sucesso zera o contador');
  perform teste.erro(format($q$select public.svc_definir_codigo_acesso(%L, 'X', %L, 'redefinicao_acesso', '')$q$, teste.id('sol2'), teste.id('admin')),
     'justificativa', 'redefinição excepcional exige justificativa');
  perform public.svc_definir_codigo_acesso(teste.id('sol2'), 'RESET-1234', teste.id('admin'), 'redefinicao_acesso', 'Identidade confirmada presencialmente com crachá');
  perform teste.ok(public.svc_validar_chave_recuperacao('sol2', 'NOVA1NOVA2NOVA3NOVA4') is null, 'redefinição invalida a chave anterior');
end $$;
reset role;

\echo ''
\echo '=== TODOS OS TESTES DO BANCO PASSARAM ==='
