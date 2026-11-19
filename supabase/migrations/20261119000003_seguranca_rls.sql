-- =====================================================================
-- CAMINHÃO MASTERS — MIGRAÇÃO 3: SEGURANÇA (RLS), STORAGE E TEMPO REAL
-- Princípio: tudo bloqueado por padrão; cada perfil recebe só o necessário.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMISSÕES BÁSICAS
-- Visitantes não autenticados (anon) não acessam NADA do banco.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Funções que o navegador (usuário logado) pode chamar
grant execute on function
  public.fn_meu_perfil(), public.fn_is_admin(), public.fn_usuario_ativo(), public.fn_hoje_local(),
  public.fn_fuso(), public.fn_inicio_periodo(date, text), public.fn_proximo_dia_util(date),
  public.fn_rotulo_periodo(text),
  public.criar_solicitacao(uuid, uuid, date, text, uuid, text, text, text, text),
  public.aprovar_solicitacao(uuid, text, text), public.recusar_solicitacao(uuid, text),
  public.pedir_esclarecimento(uuid, text), public.responder_esclarecimento(uuid, text),
  public.cancelar_solicitacao(uuid, text), public.definir_prioridade(uuid, text),
  public.iniciar_atendimento(uuid, timestamptz, boolean),
  public.finalizar_atendimento(uuid, timestamptz, text, boolean),
  public.concluir_solicitacao(uuid, text), public.gerar_alertas(), public.registrar_login(),
  public.marcar_notificacoes_lidas(bigint[]), public.resumo_financeiro(uuid, date, date)
to authenticated;

-- Funções usadas internamente pelas regras de segurança (precisam ser executáveis)
-- (removido na migração 5: fn_exigir_perfil não precisa ser chamável pelo navegador)

-- Funções svc_* : SOMENTE service_role (Edge Functions)
revoke execute on function
  public.svc_normalizar_segredo(text), public.svc_limite_excedido(text, text, int, int),
  public.svc_registrar_tentativa(text, text, boolean), public.svc_validar_codigo_acesso(text, text),
  public.svc_validar_chave_recuperacao(text, text), public.svc_invalidar_sessoes(uuid),
  public.svc_gravar_nova_chave(uuid, text, text, uuid),
  public.svc_definir_codigo_acesso(uuid, text, uuid, text, text, int),
  public.svc_auditar(uuid, text, text, text, text, jsonb)
from authenticated;

-- Tabelas que o navegador não pode ver nem tocar, nem mesmo o administrador
revoke all on public.credenciais_acesso, public.tentativas_acesso from authenticated;

-- Notificações: o usuário só pode alterar a coluna "lida"
revoke insert, update, delete on public.notificacoes from authenticated;
grant update (lida) on public.notificacoes to authenticated;

-- Escritas em solicitações, histórico, ocupações e auditoria só pelas funções
revoke insert, update, delete on public.solicitacoes, public.solicitacao_historico,
  public.ocupacoes, public.auditoria from authenticated;

-- Perfis: criação/remoção apenas pelo servidor
revoke insert, delete on public.perfis from authenticated;

-- ---------------------------------------------------------------------
-- 2. ATIVAR RLS EM TODAS AS TABELAS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['configuracoes','perfis','credenciais_acesso','tentativas_acesso','caminhoes','obras',
    'categorias','solicitacoes','solicitacao_historico','bloqueios','planos_manutencao','atividades_operacionais',
    'ocupacoes','expedientes','checklists','atendimentos','atendimento_materiais','abastecimentos','ocorrencias',
    'anexos','despesas','documentos','notificacoes','push_inscricoes','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. POLÍTICAS
-- ---------------------------------------------------------------------
-- configuracoes
drop policy if exists cfg_ler on public.configuracoes;
create policy cfg_ler on public.configuracoes for select to authenticated using (public.fn_usuario_ativo());
drop policy if exists cfg_admin on public.configuracoes;
create policy cfg_admin on public.configuracoes for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- perfis (dados não sensíveis: nome, usuário, perfil)
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or public.fn_usuario_ativo());
drop policy if exists perfis_admin on public.perfis;
create policy perfis_admin on public.perfis for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- caminhões, obras, categorias: todos leem; admin escreve
drop policy if exists cam_ler on public.caminhoes;
create policy cam_ler on public.caminhoes for select to authenticated using (public.fn_usuario_ativo());
drop policy if exists cam_ins on public.caminhoes;
create policy cam_ins on public.caminhoes for insert to authenticated with check (public.fn_is_admin());
drop policy if exists cam_upd on public.caminhoes;
create policy cam_upd on public.caminhoes for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists obras_ler on public.obras;
create policy obras_ler on public.obras for select to authenticated using (public.fn_usuario_ativo());
drop policy if exists obras_ins on public.obras;
create policy obras_ins on public.obras for insert to authenticated with check (public.fn_is_admin());
drop policy if exists obras_upd on public.obras;
create policy obras_upd on public.obras for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists cat_ler on public.categorias;
create policy cat_ler on public.categorias for select to authenticated using (public.fn_usuario_ativo());
drop policy if exists cat_ins on public.categorias;
create policy cat_ins on public.categorias for insert to authenticated with check (public.fn_is_admin());
drop policy if exists cat_upd on public.categorias;
create policy cat_upd on public.categorias for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- solicitações: agenda visível a todos (exceto recusadas/canceladas de terceiros)
drop policy if exists sol_ler on public.solicitacoes;
create policy sol_ler on public.solicitacoes for select to authenticated using (
  public.fn_is_admin()
  or (public.fn_usuario_ativo() and (solicitante_id = auth.uid() or status in ('pendente','esclarecimento','aprovada','concluida'))));

-- histórico: admin e o próprio solicitante (motorista NÃO vê motivos internos)
drop policy if exists hist_ler on public.solicitacao_historico;
create policy hist_ler on public.solicitacao_historico for select to authenticated using (
  public.fn_is_admin()
  or (public.fn_meu_perfil() = 'solicitante'
      and exists (select 1 from public.solicitacoes s where s.id = solicitacao_id and s.solicitante_id = auth.uid())));

-- ocupações: todos leem (mostra disponível/ocupado)
drop policy if exists ocup_ler on public.ocupacoes;
create policy ocup_ler on public.ocupacoes for select to authenticated using (public.fn_usuario_ativo());

-- bloqueios e atividades operacionais: todos leem; admin cria/edita
drop policy if exists bloq_ler on public.bloqueios;
create policy bloq_ler on public.bloqueios for select to authenticated using (public.fn_usuario_ativo());
drop policy if exists bloq_ins on public.bloqueios;
create policy bloq_ins on public.bloqueios for insert to authenticated with check (public.fn_is_admin());
drop policy if exists bloq_upd on public.bloqueios;
create policy bloq_upd on public.bloqueios for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists ativ_ler on public.atividades_operacionais;
create policy ativ_ler on public.atividades_operacionais for select to authenticated using (public.fn_usuario_ativo());
drop policy if exists ativ_ins on public.atividades_operacionais;
create policy ativ_ins on public.atividades_operacionais for insert to authenticated with check (public.fn_is_admin());
drop policy if exists ativ_upd on public.atividades_operacionais;
create policy ativ_upd on public.atividades_operacionais for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- planos de manutenção: somente admin
drop policy if exists plano_admin on public.planos_manutencao;
create policy plano_admin on public.planos_manutencao for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- DIÁRIO DE BORDO: admin vê tudo; motorista vê/insere o próprio
drop policy if exists exp_ler on public.expedientes;
create policy exp_ler on public.expedientes for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid()));
drop policy if exists exp_ins on public.expedientes;
create policy exp_ins on public.expedientes for insert to authenticated with check (
  public.fn_meu_perfil() in ('motorista','admin') and motorista_id = auth.uid());
drop policy if exists exp_upd on public.expedientes;
create policy exp_upd on public.expedientes for update to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid() and fim_em is null))
  with check (public.fn_is_admin() or motorista_id = auth.uid());

drop policy if exists chk_ler on public.checklists;
create policy chk_ler on public.checklists for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid()));
drop policy if exists chk_ins on public.checklists;
create policy chk_ins on public.checklists for insert to authenticated with check (
  public.fn_meu_perfil() in ('motorista','admin') and motorista_id = auth.uid());

drop policy if exists atd_ler on public.atendimentos;
create policy atd_ler on public.atendimentos for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid()));
drop policy if exists atd_ins on public.atendimentos;
create policy atd_ins on public.atendimentos for insert to authenticated with check (
  public.fn_meu_perfil() in ('motorista','admin') and motorista_id = auth.uid());
drop policy if exists atd_upd on public.atendimentos;
create policy atd_upd on public.atendimentos for update to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid() and fim_em is null))
  with check (public.fn_is_admin() or motorista_id = auth.uid());

drop policy if exists mat_ler on public.atendimento_materiais;
create policy mat_ler on public.atendimento_materiais for select to authenticated using (
  exists (select 1 from public.atendimentos a where a.id = atendimento_id
          and (public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and a.motorista_id = auth.uid()))));
drop policy if exists mat_ins on public.atendimento_materiais;
create policy mat_ins on public.atendimento_materiais for insert to authenticated with check (
  exists (select 1 from public.atendimentos a where a.id = atendimento_id
          and a.motorista_id = auth.uid() and public.fn_meu_perfil() in ('motorista','admin')));

drop policy if exists abs_ler on public.abastecimentos;
create policy abs_ler on public.abastecimentos for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid()));
drop policy if exists abs_ins on public.abastecimentos;
create policy abs_ins on public.abastecimentos for insert to authenticated with check (
  public.fn_meu_perfil() in ('motorista','admin') and motorista_id = auth.uid());

drop policy if exists oco_ler on public.ocorrencias;
create policy oco_ler on public.ocorrencias for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and motorista_id = auth.uid()));
drop policy if exists oco_ins on public.ocorrencias;
create policy oco_ins on public.ocorrencias for insert to authenticated with check (
  public.fn_meu_perfil() in ('motorista','admin') and motorista_id = auth.uid() and status = 'aberta');
drop policy if exists oco_upd on public.ocorrencias;
create policy oco_upd on public.ocorrencias for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- anexos (registro das fotos/arquivos)
drop policy if exists anx_ler on public.anexos;
create policy anx_ler on public.anexos for select to authenticated using (
  public.fn_is_admin()
  or (public.fn_usuario_ativo() and enviado_por = auth.uid())
  or (public.fn_meu_perfil() = 'motorista' and entidade = 'documento'
      and exists (select 1 from public.documentos d where d.id = entidade_id and d.visivel_motorista and d.ativo)));
drop policy if exists anx_ins on public.anexos;
create policy anx_ins on public.anexos for insert to authenticated with check (
  public.fn_usuario_ativo() and enviado_por = auth.uid()
  and (entidade not in ('documento','despesa','atividade') or public.fn_is_admin() or
       (entidade = 'despesa' and public.fn_meu_perfil() = 'motorista')));

-- despesas: admin tudo; motorista só as próprias (pendentes por regra)
drop policy if exists desp_ler on public.despesas;
create policy desp_ler on public.despesas for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and lancado_por = auth.uid()));
drop policy if exists desp_ins on public.despesas;
create policy desp_ins on public.despesas for insert to authenticated with check (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and status = 'pendente'));
drop policy if exists desp_upd on public.despesas;
create policy desp_upd on public.despesas for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- documentos: admin tudo; motorista só os marcados como visíveis
drop policy if exists doc_ler on public.documentos;
create policy doc_ler on public.documentos for select to authenticated using (
  public.fn_is_admin() or (public.fn_meu_perfil() = 'motorista' and visivel_motorista and ativo));
drop policy if exists doc_ins on public.documentos;
create policy doc_ins on public.documentos for insert to authenticated with check (public.fn_is_admin());
drop policy if exists doc_upd on public.documentos;
create policy doc_upd on public.documentos for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- notificações: cada um vê e marca as suas
drop policy if exists notif_ler on public.notificacoes;
create policy notif_ler on public.notificacoes for select to authenticated using (usuario_id = auth.uid());
drop policy if exists notif_upd on public.notificacoes;
create policy notif_upd on public.notificacoes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- inscrições push: cada um gerencia as suas
drop policy if exists push_own on public.push_inscricoes;
create policy push_own on public.push_inscricoes for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.fn_usuario_ativo());

-- auditoria: somente leitura pelo admin
drop policy if exists aud_ler on public.auditoria;
create policy aud_ler on public.auditoria for select to authenticated using (public.fn_is_admin());

-- credenciais_acesso e tentativas_acesso: SEM políticas = ninguém do navegador acessa.

-- ---------------------------------------------------------------------
-- 4. ARMAZENAMENTO DE ARQUIVOS (Supabase Storage)
-- fotos/<id-do-usuário>/<entidade>/<arquivo>    (privado)
-- documentos/<id-do-caminhão>/<arquivo>          (privado, só admin envia)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
       ('documentos', 'documentos', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cm_fotos_enviar on storage.objects;
create policy cm_fotos_enviar on storage.objects for insert to authenticated with check (
  bucket_id = 'fotos' and public.fn_usuario_ativo() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cm_fotos_ler on storage.objects;
create policy cm_fotos_ler on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and (public.fn_is_admin()
    or (public.fn_usuario_ativo() and (storage.foldername(name))[1] = auth.uid()::text)));

drop policy if exists cm_docs_admin on storage.objects;
create policy cm_docs_admin on storage.objects for all to authenticated
  using (bucket_id = 'documentos' and public.fn_is_admin())
  with check (bucket_id = 'documentos' and public.fn_is_admin());

drop policy if exists cm_docs_motorista on storage.objects;
create policy cm_docs_motorista on storage.objects for select to authenticated using (
  bucket_id = 'documentos' and public.fn_meu_perfil() = 'motorista'
  and exists (select 1 from public.anexos a join public.documentos d on d.id = a.entidade_id
              where a.caminho = name and a.bucket = 'documentos' and a.entidade = 'documento'
                and d.visivel_motorista and d.ativo));

-- ---------------------------------------------------------------------
-- 5. TEMPO REAL (Supabase Realtime) — respeita as mesmas regras RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['solicitacoes','ocupacoes','bloqueios','atividades_operacionais','notificacoes'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
