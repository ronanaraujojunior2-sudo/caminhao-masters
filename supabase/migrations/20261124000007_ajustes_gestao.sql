-- =====================================================================
-- CAMINHÃO MASTERS — Migração 7: ajustes pedidos pela gestão (24/11/2026)
-- 1) Sem controle financeiro: o Sienge cuida disso.
--    - abastecimento não gera mais despesa; o valor pago fica OPCIONAL e é só
--      informação do registro operacional (não alimenta painéis nem relatórios);
--    - a tabela de despesas é PRESERVADA (nenhum dado apagado), mas fica
--      fechada para o sistema; o resumo financeiro deixa de existir.
-- 2) Abastecimento: campo de observações; posto obrigatório nos novos registros.
-- 3) Usuários: arquivar, reativar e EXCLUIR preservando o histórico.
-- =====================================================================

-- ---------------------------------------------------------------- 1) Financeiro
alter table public.abastecimentos alter column valor drop not null;
alter table public.abastecimentos drop constraint if exists abastecimentos_valor_check;
alter table public.abastecimentos add constraint abastecimentos_valor_check check (valor is null or valor >= 0);
alter table public.abastecimentos add column if not exists observacoes text;
alter table public.abastecimentos drop constraint if exists abastecimentos_observacoes_check;
alter table public.abastecimentos add constraint abastecimentos_observacoes_check check (observacoes is null or length(observacoes) <= 1000);
-- posto obrigatório só para registros novos (os antigos são preservados como estão)
alter table public.abastecimentos drop constraint if exists abastecimentos_posto_obrigatorio;
alter table public.abastecimentos add constraint abastecimentos_posto_obrigatorio
  check (posto is not null and length(trim(posto)) >= 2) not valid;

-- abastecimento só atualiza o KM do caminhão (não cria mais despesa)
create or replace function public.trg_abastecimento_pos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_atualizar_km(new.caminhao_id, new.km);
  return new;
end $$;

-- despesas: dados preservados, sem acesso pelo sistema
drop policy if exists desp_ler on public.despesas;
drop policy if exists desp_ins on public.despesas;
drop policy if exists desp_upd on public.despesas;
revoke all on public.despesas from anon, authenticated;
drop function if exists public.resumo_financeiro(uuid, date, date);

-- anexos: não se anexa mais comprovante de despesa
drop policy if exists anx_ins on public.anexos;
create policy anx_ins on public.anexos for insert to authenticated with check (
  public.fn_usuario_ativo() and enviado_por = auth.uid() and entidade <> 'despesa'
  and (entidade not in ('documento','atividade') or public.fn_is_admin()));

-- ---------------------------------------------------------------- 3) Usuários
-- O cadastro (perfis) passa a poder existir sem a conta de acesso: quando o
-- usuário é excluído e tem histórico, a conta de login é apagada e o cadastro
-- fica como registro histórico (nome preservado nos registros antigos).
alter table public.perfis drop constraint if exists perfis_id_fkey;
alter table public.perfis add column if not exists arquivado_em     timestamptz;
alter table public.perfis add column if not exists arquivado_por    uuid;
alter table public.perfis add column if not exists excluido_em      timestamptz;
alter table public.perfis add column if not exists excluido_por     uuid;
alter table public.perfis add column if not exists usuario_original text;
alter table public.perfis drop constraint if exists perfis_arquivado_inativo;
alter table public.perfis add constraint perfis_arquivado_inativo check (arquivado_em is null or not ativo);
alter table public.perfis drop constraint if exists perfis_excluido_arquivado;
alter table public.perfis add constraint perfis_excluido_arquivado check (excluido_em is null or arquivado_em is not null);

create or replace function public.trg_perfis_protecao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_servico boolean := coalesce(current_setting('cm.gestao_usuario', true), '') = 'on';
begin
  if old.excluido_em is not null and not v_servico then
    raise exception 'Este usuário foi excluído: o registro é mantido apenas como histórico e não pode ser alterado.';
  end if;
  if new.usuario is distinct from old.usuario and not v_servico then
    raise exception 'O nome de usuário não pode ser alterado. Cadastre um novo usuário se necessário.';
  end if;
  if new.arquivado_em is not null and new.ativo then
    raise exception 'Usuário arquivado não pode ficar ativo. Use “Reativar”.';
  end if;
  if old.perfil = 'admin' and old.ativo and (new.perfil <> 'admin' or not new.ativo) then
    if (select count(*) from public.perfis where perfil = 'admin' and ativo and id <> old.id) = 0 then
      raise exception 'Não é possível remover o último administrador ativo do sistema.';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.trg_perfis_exclusao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.perfil = 'admin' and old.ativo
     and (select count(*) from public.perfis where perfil = 'admin' and ativo and id <> old.id) = 0 then
    raise exception 'Não é possível excluir o último administrador ativo do sistema.';
  end if;
  return old;
end $$;
drop trigger if exists t_perfis_exclusao on public.perfis;
create trigger t_perfis_exclusao before delete on public.perfis for each row execute function public.trg_perfis_exclusao();

-- Quantos registros operacionais apontam para o usuário (todas as tabelas que
-- referenciam perfis, exceto as pessoais: credenciais, notificações e push).
create or replace function public.svc_vinculos_usuario(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n bigint; v jsonb := '{}'::jsonb; total bigint := 0;
begin
  for r in
    select c.conrelid::regclass::text as tabela, a.attname as coluna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.perfis'::regclass
       and c.conrelid::regclass::text not in ('credenciais_acesso','notificacoes','push_inscricoes',
                                             'public.credenciais_acesso','public.notificacoes','public.push_inscricoes')
  loop
    execute format('select count(*) from %s where %I = $1', r.tabela, r.coluna) into n using p_id;
    if n > 0 then v := v || jsonb_build_object(r.tabela || '.' || r.coluna, n); total := total + n; end if;
  end loop;
  return jsonb_build_object('total', total, 'detalhe', v);
end $$;

-- Arquivar (sai da lista principal e perde o acesso) / Reativar
create or replace function public.svc_arquivar_usuario(p_alvo uuid, p_ator uuid, p_arquivar boolean, p_justificativa text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.perfis;
begin
  select * into v from public.perfis where id = p_alvo for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if v.excluido_em is not null then raise exception 'Este usuário foi excluído e não pode ser alterado.'; end if;
  if p_alvo = p_ator then raise exception 'Você não pode arquivar ou reativar o próprio acesso.'; end if;
  perform public.fn_set_justificativa(coalesce(nullif(trim(p_justificativa), ''), case when p_arquivar then 'Arquivamento' else 'Reativação' end));
  if p_arquivar then
    update public.perfis set ativo = false, arquivado_em = now(), arquivado_por = p_ator, sessoes_invalidadas_em = now() where id = p_alvo;
  else
    update public.perfis set ativo = true, arquivado_em = null, arquivado_por = null where id = p_alvo;
  end if;
  perform public.svc_auditar(p_ator, case when p_arquivar then 'arquivamento_usuario' else 'reativacao_usuario' end, 'perfis', p_alvo::text,
    nullif(trim(p_justificativa), ''), jsonb_build_object('usuario', v.usuario, 'nome', v.nome_completo));
end $$;

-- Excluir: sem histórico -> cadastro apagado; com histórico -> cadastro vira
-- registro histórico (nome preservado), acesso e dados pessoais removidos.
create or replace function public.svc_excluir_usuario(p_alvo uuid, p_ator uuid, p_justificativa text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.perfis; vinc jsonb; modo text;
begin
  select * into v from public.perfis where id = p_alvo for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if v.excluido_em is not null then raise exception 'Este usuário já foi excluído.'; end if;
  if p_alvo = p_ator then raise exception 'Você não pode excluir o próprio acesso.'; end if;
  if v.perfil = 'admin' and v.ativo
     and (select count(*) from public.perfis where perfil = 'admin' and ativo and id <> p_alvo) = 0 then
    raise exception 'Não é possível excluir o último administrador ativo do sistema.';
  end if;
  perform public.fn_set_justificativa('Exclusão de usuário' || coalesce(': ' || nullif(trim(p_justificativa), ''), ''));
  perform set_config('cm.gestao_usuario', 'on', true);
  delete from public.notificacoes where usuario_id = p_alvo;
  delete from public.push_inscricoes where usuario_id = p_alvo;
  delete from public.credenciais_acesso where usuario_id = p_alvo;
  vinc := public.svc_vinculos_usuario(p_alvo);
  if (vinc->>'total')::bigint = 0 then
    delete from public.perfis where id = p_alvo;
    modo := 'removido';
  else
    update public.perfis
       set ativo = false, primeiro_acesso_pendente = false, sessoes_invalidadas_em = now(),
           arquivado_em = coalesce(arquivado_em, now()), arquivado_por = coalesce(arquivado_por, p_ator),
           excluido_em = now(), excluido_por = p_ator, usuario_original = usuario,
           usuario = 'excluido-' || substr(replace(id::text, '-', ''), 1, 12)
     where id = p_alvo;
    modo := 'historico';
  end if;
  perform set_config('cm.gestao_usuario', 'off', true);
  perform public.svc_auditar(p_ator, 'exclusao_usuario', 'perfis', p_alvo::text, nullif(trim(p_justificativa), ''),
    jsonb_build_object('usuario', v.usuario, 'nome', v.nome_completo, 'perfil', v.perfil, 'modo', modo, 'vinculos', vinc->'detalhe'));
  return jsonb_build_object('modo', modo, 'vinculos', vinc);
end $$;

revoke all on function public.svc_vinculos_usuario(uuid) from public, anon, authenticated;
revoke all on function public.svc_arquivar_usuario(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.svc_excluir_usuario(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_vinculos_usuario(uuid) to service_role;
grant execute on function public.svc_arquivar_usuario(uuid, uuid, boolean, text) to service_role;
grant execute on function public.svc_excluir_usuario(uuid, uuid, text) to service_role;
