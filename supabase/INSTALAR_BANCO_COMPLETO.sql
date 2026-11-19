-- =====================================================================
-- CAMINHÃO MASTERS — INSTALAÇÃO COMPLETA DO BANCO (gerado automaticamente)
-- Cole TODO este conteúdo no Supabase > SQL Editor > New query > Run.
-- Pode ser executado de novo com segurança (não apaga dados).
-- =====================================================================

-- >>> 20261119000001_estrutura.sql
-- =====================================================================
-- CAMINHÃO MASTERS — MIGRAÇÃO 1: ESTRUTURA DO BANCO
-- Banco: Supabase (PostgreSQL 15+)
-- Execute as migrações em ordem numérica (1, 2, 3, 4).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES GERAIS (linha única, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  id                     int primary key default 1 check (id = 1),
  antecedencia_modo      text not null default 'proximo_dia_util'
                         check (antecedencia_modo in ('proximo_dia_util','24h','48h','personalizado')),
  antecedencia_horas     int  not null default 24 check (antecedencia_horas between 0 and 720),
  materiais_obrigatorios boolean not null default false,
  fuso_horario           text not null default 'America/Manaus',
  alerta_documento_dias  int not null default 30 check (alerta_documento_dias between 1 and 180),
  alerta_manutencao_dias int not null default 15 check (alerta_manutencao_dias between 1 and 180),
  alerta_manutencao_km   int not null default 1000 check (alerta_manutencao_km between 0 and 100000),
  atualizado_em          timestamptz not null default now(),
  atualizado_por         uuid
);

-- ---------------------------------------------------------------------
-- USUÁRIOS (perfil público) — ligado ao auth.users do Supabase
-- O e-mail interno é sintético e nunca é exibido nem pedido ao usuário.
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id                       uuid primary key references auth.users(id) on delete restrict,
  nome_completo            text not null check (length(trim(nome_completo)) between 3 and 120),
  usuario                  text not null check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  perfil                   text not null check (perfil in ('admin','solicitante','motorista')),
  ativo                    boolean not null default true,
  primeiro_acesso_pendente boolean not null default true,
  sessoes_invalidadas_em   timestamptz not null default now(),
  criado_em                timestamptz not null default now(),
  criado_por               uuid,
  atualizado_em            timestamptz not null default now()
);
create unique index if not exists perfis_usuario_unico on public.perfis (lower(usuario));

-- Credenciais auxiliares (somente hashes). NUNCA acessível pelo navegador.
create table if not exists public.credenciais_acesso (
  usuario_id               uuid primary key references public.perfis(id) on delete cascade,
  codigo_acesso_hash       text,
  codigo_acesso_expira_em  timestamptz,
  chave_recuperacao_hash   text,
  chave_gerada_em          timestamptz,
  atualizado_em            timestamptz not null default now()
);

-- Tentativas (proteção contra força bruta). Somente service_role.
create table if not exists public.tentativas_acesso (
  id          bigserial primary key,
  chave       text not null,          -- ex.: 'usuario:joao' ou 'ip:1.2.3.4'
  tipo        text not null,          -- 'primeiro_acesso' | 'recuperacao' | 'alterar_senha' | 'bootstrap'
  sucesso     boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index if not exists tentativas_chave_idx on public.tentativas_acesso (chave, tipo, criado_em desc);

-- ---------------------------------------------------------------------
-- CAMINHÕES (estrutura pronta para vários)
-- ---------------------------------------------------------------------
create table if not exists public.caminhoes (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null check (length(trim(nome)) between 2 and 80),
  placa                 text not null,
  marca_modelo          text not null,
  ano_modelo            text,
  responsavel_nome      text not null check (length(trim(responsavel_nome)) >= 3),
  responsavel_telefone  text,
  km_atual              numeric(10,1) not null default 0 check (km_atual >= 0),
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
create unique index if not exists caminhoes_placa_unica on public.caminhoes (upper(replace(placa,'-','')));

-- ---------------------------------------------------------------------
-- OBRAS
-- ---------------------------------------------------------------------
create table if not exists public.obras (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null check (length(trim(nome)) between 2 and 120),
  endereco               text,
  responsavel_nome       text not null check (length(trim(responsavel_nome)) >= 3),
  responsavel_telefone   text,
  contato1_nome          text,
  contato1_telefone      text,
  contato2_nome          text,
  contato2_telefone      text,
  ativa                  boolean not null default true,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create unique index if not exists obras_nome_unico on public.obras (lower(trim(nome)));

-- ---------------------------------------------------------------------
-- CATEGORIAS DE SOLICITAÇÃO
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) between 2 and 80),
  ordem       int not null default 100,
  ativa       boolean not null default true,
  protegida   boolean not null default false,   -- "Outros": não pode ser desativada
  criado_em   timestamptz not null default now()
);
create unique index if not exists categorias_nome_unico on public.categorias (lower(trim(nome)));

-- ---------------------------------------------------------------------
-- SOLICITAÇÕES DE AGENDAMENTO (módulo principal)
-- ---------------------------------------------------------------------
create table if not exists public.solicitacoes (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,
  caminhao_id       uuid not null references public.caminhoes(id),
  obra_id           uuid not null references public.obras(id),
  solicitante_id    uuid not null references public.perfis(id),
  data              date not null,
  periodo           text not null check (periodo in ('manha','tarde')),
  categoria_id      uuid not null references public.categorias(id),
  categoria_nome    text not null,           -- cópia preservada do nome original
  descricao         text not null check (length(trim(descricao)) >= 3),
  local_especifico  text,
  justificativa     text not null check (length(trim(justificativa)) >= 3),
  observacoes       text,
  status            text not null default 'pendente'
                    check (status in ('pendente','esclarecimento','aprovada','recusada','cancelada','concluida')),
  prioridade        text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  execucao          text not null default 'aguardando' check (execucao in ('aguardando','em_atendimento','finalizada')),
  execucao_inicio   timestamptz,
  execucao_fim      timestamptz,
  execucao_motorista_id uuid references public.perfis(id),
  execucao_offline  boolean not null default false,
  decidido_por      uuid references public.perfis(id),
  decidido_em       timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists solicitacoes_data_idx on public.solicitacoes (caminhao_id, data);
create index if not exists solicitacoes_solicitante_idx on public.solicitacoes (solicitante_id);
create index if not exists solicitacoes_status_idx on public.solicitacoes (status);

-- Histórico / comunicação (imutável)
create table if not exists public.solicitacao_historico (
  id              bigserial primary key,
  solicitacao_id  uuid not null references public.solicitacoes(id),
  autor_id        uuid references public.perfis(id),
  tipo            text not null check (tipo in ('criacao','aprovacao','recusa','esclarecimento_pedido',
                     'esclarecimento_resposta','cancelamento','conclusao','prioridade','inicio_atendimento',
                     'fim_atendimento','comentario')),
  texto           text,
  criado_em       timestamptz not null default now()
);
create index if not exists historico_solic_idx on public.solicitacao_historico (solicitacao_id, criado_em);

-- ---------------------------------------------------------------------
-- BLOQUEIOS E ATIVIDADES OPERACIONAIS (manutenção, lavagem etc.)
-- ---------------------------------------------------------------------
create table if not exists public.bloqueios (
  id            uuid primary key default gen_random_uuid(),
  caminhao_id   uuid not null references public.caminhoes(id),
  data          date not null,
  periodo       text not null check (periodo in ('manha','tarde','dia')),
  motivo        text not null check (length(trim(motivo)) >= 3),
  ativo         boolean not null default true,
  criado_por    uuid references public.perfis(id),
  criado_em     timestamptz not null default now(),
  removido_por  uuid references public.perfis(id),
  removido_em   timestamptz,
  motivo_remocao text
);

create table if not exists public.planos_manutencao (
  id              uuid primary key default gen_random_uuid(),
  caminhao_id     uuid not null references public.caminhoes(id),
  descricao       text not null,
  intervalo_dias  int check (intervalo_dias > 0),
  intervalo_km    int check (intervalo_km > 0),
  ultima_data     date,
  ultimo_km       numeric(10,1),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  check (intervalo_dias is not null or intervalo_km is not null)
);

create table if not exists public.atividades_operacionais (
  id            uuid primary key default gen_random_uuid(),
  caminhao_id   uuid not null references public.caminhoes(id),
  tipo          text not null check (tipo in ('manutencao_preventiva','manutencao_corretiva','lavagem',
                   'borracharia','revisao','abastecimento','outros')),
  data          date not null,
  periodo       text not null check (periodo in ('manha','tarde','dia')),
  descricao     text not null check (length(trim(descricao)) >= 3),
  empresa       text,
  endereco      text,
  telefone      text,
  observacoes   text,
  plano_id      uuid references public.planos_manutencao(id),
  km_execucao   numeric(10,1),
  status        text not null default 'programada' check (status in ('programada','concluida','cancelada')),
  criado_por    uuid references public.perfis(id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Ocupação de períodos: GARANTIA DE NÃO-CONFLITO NO BANCO.
-- Cada período (caminhão + data + manhã/tarde) só pode ter UMA linha.
create table if not exists public.ocupacoes (
  id           bigserial primary key,
  caminhao_id  uuid not null references public.caminhoes(id),
  data         date not null,
  periodo      text not null check (periodo in ('manha','tarde')),
  origem       text not null check (origem in ('solicitacao','bloqueio','atividade')),
  origem_id    uuid not null,
  criado_em    timestamptz not null default now(),
  constraint ocupacoes_periodo_unico unique (caminhao_id, data, periodo)
);
create index if not exists ocupacoes_origem_idx on public.ocupacoes (origem, origem_id);

-- ---------------------------------------------------------------------
-- DIÁRIO DE BORDO
-- (IDs gerados no aparelho para permitir registro offline sem duplicar)
-- ---------------------------------------------------------------------
create table if not exists public.expedientes (
  id                   uuid primary key,
  caminhao_id          uuid not null references public.caminhoes(id),
  motorista_id         uuid not null references public.perfis(id),
  inicio_em            timestamptz not null,
  km_inicial           numeric(10,1) not null check (km_inicial >= 0),
  fim_em               timestamptz,
  km_final             numeric(10,1),
  condicoes_gerais     text,
  local_estacionamento text check (local_estacionamento in ('estacionamento_masters','obra','outro')),
  local_obra_id        uuid references public.obras(id),
  local_outro          text,
  observacoes          text,
  registrado_offline   boolean not null default false,
  criado_em            timestamptz not null default now(),
  sincronizado_em      timestamptz not null default now(),
  check (km_final is null or km_final >= km_inicial)
);
create index if not exists expedientes_mot_idx on public.expedientes (motorista_id, inicio_em desc);

create table if not exists public.checklists (
  id                      uuid primary key,
  expediente_id           uuid references public.expedientes(id),
  caminhao_id             uuid not null references public.caminhoes(id),
  motorista_id            uuid not null references public.perfis(id),
  tipo                    text not null check (tipo in ('abertura','encerramento','munck')),
  itens                   jsonb not null,   -- [{item, resultado: conforme|irregular|na, critico, obs}]
  observacoes             text,
  tem_irregularidade      boolean not null default false,
  tem_critico             boolean not null default false,
  registrado_em           timestamptz not null,
  criado_em               timestamptz not null default now()
);

create table if not exists public.atendimentos (
  id                     uuid primary key,
  expediente_id          uuid references public.expedientes(id),
  solicitacao_id         uuid references public.solicitacoes(id),
  caminhao_id            uuid not null references public.caminhoes(id),
  motorista_id           uuid not null references public.perfis(id),
  obra_id                uuid not null references public.obras(id),
  servico                text not null,
  inicio_em              timestamptz not null,
  fim_em                 timestamptz,
  km_inicial             numeric(10,1),
  km_final               numeric(10,1),
  distancia_km           numeric(10,1) generated always as (
                           case when km_final is not null and km_inicial is not null then km_final - km_inicial end) stored,
  recebedor_nome         text,
  recebedor_cargo        text,
  recebimento_confirmado boolean not null default false,
  observacoes            text,
  registrado_offline     boolean not null default false,
  criado_em              timestamptz not null default now(),
  check (km_final is null or km_inicial is null or km_final >= km_inicial),
  check (fim_em is null or fim_em >= inicio_em)
);

create table if not exists public.atendimento_materiais (
  id              uuid primary key,
  atendimento_id  uuid not null references public.atendimentos(id) on delete cascade,
  material        text not null,
  unidade         text not null,
  qtd_prevista    numeric(12,3),
  qtd_entregue    numeric(12,3),
  divergencia     numeric(12,3) generated always as (coalesce(qtd_entregue,0) - coalesce(qtd_prevista,0)) stored,
  obs_divergencia text
);

create table if not exists public.abastecimentos (
  id               uuid primary key,
  caminhao_id      uuid not null references public.caminhoes(id),
  expediente_id    uuid references public.expedientes(id),
  motorista_id     uuid not null references public.perfis(id),
  data_hora        timestamptz not null,
  km               numeric(10,1) not null check (km >= 0),
  litros           numeric(10,3) not null check (litros > 0),
  valor            numeric(12,2) not null check (valor >= 0),
  posto            text,
  registrado_offline boolean not null default false,
  criado_em        timestamptz not null default now()
);

create table if not exists public.ocorrencias (
  id               uuid primary key,
  caminhao_id      uuid not null references public.caminhoes(id),
  expediente_id    uuid references public.expedientes(id),
  motorista_id     uuid not null references public.perfis(id),
  tipo             text not null check (tipo in ('avaria','acidente','problema_transporte','dano_material',
                      'impedimento_acesso','outro')),
  descricao        text not null check (length(trim(descricao)) >= 3),
  data_hora        timestamptz not null,
  local            text,
  status           text not null default 'aberta' check (status in ('aberta','em_tratamento','resolvida')),
  resolucao        text,
  resolvido_por    uuid references public.perfis(id),
  resolvido_em     timestamptz,
  registrado_offline boolean not null default false,
  criado_em        timestamptz not null default now()
);

-- Anexos (fotos e documentos) — arquivos ficam no Storage, aqui só o caminho
create table if not exists public.anexos (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null check (entidade in ('atendimento','checklist','ocorrencia','abastecimento',
                   'despesa','documento','atividade','expediente')),
  entidade_id   uuid not null,
  bucket        text not null check (bucket in ('fotos','documentos')),
  caminho       text not null unique,
  nome_arquivo  text,
  mime          text,
  enviado_por   uuid not null references public.perfis(id),
  criado_em     timestamptz not null default now()
);
create index if not exists anexos_ent_idx on public.anexos (entidade, entidade_id);

-- ---------------------------------------------------------------------
-- FINANCEIRO E DOCUMENTOS
-- ---------------------------------------------------------------------
create table if not exists public.despesas (
  id             uuid primary key default gen_random_uuid(),
  caminhao_id    uuid not null references public.caminhoes(id),
  categoria      text not null check (categoria in ('abastecimento','manutencao_preventiva','manutencao_corretiva',
                    'lavagem','borracharia','revisao','pneus','multas','emergencial','recorrente','outros')),
  descricao      text not null,
  valor          numeric(12,2) not null check (valor >= 0),
  data           date not null,
  km             numeric(10,1),
  fornecedor     text,
  status         text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  origem         text not null default 'admin' check (origem in ('admin','motorista','abastecimento','atividade')),
  origem_id      uuid,
  lancado_por    uuid references public.perfis(id),
  aprovado_por   uuid references public.perfis(id),
  aprovado_em    timestamptz,
  motivo_recusa  text,
  criado_em      timestamptz not null default now()
);
create index if not exists despesas_data_idx on public.despesas (caminhao_id, data);
create unique index if not exists despesas_origem_unica on public.despesas (origem, origem_id) where origem_id is not null;

create table if not exists public.documentos (
  id                 uuid primary key default gen_random_uuid(),
  caminhao_id        uuid not null references public.caminhoes(id),
  tipo               text not null check (tipo in ('crlv','licenciamento','seguro','comprovante','outro')),
  descricao          text not null,
  data_emissao       date,
  validade           date,
  visivel_motorista  boolean not null default false,
  ativo              boolean not null default true,
  criado_por         uuid references public.perfis(id),
  criado_em          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES E PUSH
-- ---------------------------------------------------------------------
create table if not exists public.notificacoes (
  id           bigserial primary key,
  usuario_id   uuid not null references public.perfis(id),
  tipo         text not null default 'geral',
  titulo       text not null,
  mensagem     text,
  link         text,
  lida         boolean not null default false,
  chave_dedup  text,
  criado_em    timestamptz not null default now()
);
create index if not exists notif_usuario_idx on public.notificacoes (usuario_id, lida, criado_em desc);
create unique index if not exists notif_dedup on public.notificacoes (usuario_id, chave_dedup) where chave_dedup is not null;

create table if not exists public.push_inscricoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfis(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUDITORIA (imutável)
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id              bigserial primary key,
  usuario_id      uuid,
  usuario_nome    text,
  acao            text not null,
  tabela          text,
  registro_id     text,
  valor_anterior  jsonb,
  valor_novo      jsonb,
  justificativa   text,
  criado_em       timestamptz not null default now()
);
create index if not exists auditoria_data_idx on public.auditoria (criado_em desc);
create index if not exists auditoria_tab_idx on public.auditoria (tabela, registro_id);

-- >>> 20261119000002_funcoes_regras.sql
-- =====================================================================
-- CAMINHÃO MASTERS — MIGRAÇÃO 2: FUNÇÕES, REGRAS DE NEGÓCIO E GATILHOS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. IDENTIDADE DA SESSÃO
-- A identidade SEMPRE vem do token autenticado (auth.uid()), nunca de
-- campo digitado. Sessões emitidas antes de uma invalidação (troca de
-- senha, recuperação, redefinição) deixam de valer imediatamente.
-- ---------------------------------------------------------------------
create or replace function public.fn_meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select p.perfil
    from public.perfis p
   where p.id = auth.uid()
     and p.ativo
     and not p.primeiro_acesso_pendente
     -- tolerância de 2 s para diferença de relógio entre Auth e banco
     and coalesce((auth.jwt() ->> 'iat')::bigint, 0)
         >= floor(extract(epoch from p.sessoes_invalidadas_em))::bigint - 2
$$;

create or replace function public.fn_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_meu_perfil() = 'admin', false)
$$;

create or replace function public.fn_usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_meu_perfil() is not null
$$;

create or replace function public.fn_exigir_perfil(p_perfis text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare v text := public.fn_meu_perfil();
begin
  if v is null then
    raise exception 'Sessão expirada ou acesso desativado. Entre novamente no sistema.' using errcode = '42501';
  end if;
  if not (v = any(p_perfis)) then
    raise exception 'Seu perfil não tem permissão para esta operação.' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 2. DATAS, PERÍODOS E ANTECEDÊNCIA
-- ---------------------------------------------------------------------
create or replace function public.fn_fuso()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select fuso_horario from public.configuracoes where id = 1), 'America/Manaus')
$$;

create or replace function public.fn_hoje_local()
returns date language sql stable as $$
  select (now() at time zone public.fn_fuso())::date
$$;

-- Início do período: manhã 07h, tarde 13h (horário local configurado)
create or replace function public.fn_inicio_periodo(p_data date, p_periodo text)
returns timestamptz language sql stable as $$
  select (p_data + case when p_periodo = 'tarde' then time '13:00' else time '07:00' end)
         at time zone public.fn_fuso()
$$;

create or replace function public.fn_proximo_dia_util(p_data date)
returns date language plpgsql immutable as $$
declare d date := p_data + 1;
begin
  while extract(isodow from d) > 5 loop d := d + 1; end loop;
  return d;
end $$;

create or replace function public.fn_validar_data_agendamento(p_data date, p_periodo text, p_admin boolean)
returns void language plpgsql stable security definer set search_path = public as $$
declare c public.configuracoes; v_inicio timestamptz; v_horas int;
begin
  if p_data is null or p_periodo not in ('manha','tarde') then
    raise exception 'Informe a data e o período (manhã ou tarde).';
  end if;
  if extract(isodow from p_data) > 5 then
    raise exception 'O caminhão só pode ser agendado de segunda a sexta-feira.';
  end if;
  v_inicio := public.fn_inicio_periodo(p_data, p_periodo);
  if v_inicio <= now() then
    raise exception 'Este período já começou ou já passou. Escolha uma data futura.';
  end if;
  if p_admin then return; end if;   -- administrador pode agendar com prazo menor (registrado em auditoria)

  select * into c from public.configuracoes where id = 1;
  if c.antecedencia_modo = 'proximo_dia_util' then
    if p_data < public.fn_proximo_dia_util(public.fn_hoje_local()) then
      raise exception 'Antecedência mínima: a solicitação deve ser para o próximo dia útil ou depois.';
    end if;
  else
    v_horas := case c.antecedencia_modo when '24h' then 24 when '48h' then 48 else c.antecedencia_horas end;
    if v_inicio - now() < make_interval(hours => v_horas) then
      raise exception 'Antecedência mínima de % horas não respeitada para este período.', v_horas;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. NOTIFICAÇÕES
-- ---------------------------------------------------------------------
create or replace function public.fn_notificar(p_usuario uuid, p_tipo text, p_titulo text,
  p_mensagem text, p_link text default null, p_dedup text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null then return; end if;
  insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, chave_dedup)
  values (p_usuario, p_tipo, p_titulo, p_mensagem, p_link, p_dedup)
  on conflict do nothing;
end $$;

create or replace function public.fn_notificar_perfis(p_perfis text[], p_tipo text, p_titulo text,
  p_mensagem text, p_link text default null, p_dedup text default null, p_exceto uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.perfis
            where ativo and perfil = any(p_perfis) and id is distinct from p_exceto loop
    perform public.fn_notificar(r.id, p_tipo, p_titulo, p_mensagem, p_link, p_dedup);
  end loop;
end $$;

create or replace function public.fn_rotulo_periodo(p text)
returns text language sql immutable as $$
  select case p when 'manha' then 'Manhã (07h–12h)' when 'tarde' then 'Tarde (13h–17h)' else 'Dia inteiro' end
$$;

-- ---------------------------------------------------------------------
-- 4. AUDITORIA AUTOMÁTICA
-- ---------------------------------------------------------------------
create or replace function public.fn_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_nome text; v_id text;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
      into v_old, v_new
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('atualizado_em','sincronizado_em');
    if v_new is null then return new; end if;
  end if;

  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');
  select nome_completo into v_nome from public.perfis where id = auth.uid();

  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id,
                                valor_anterior, valor_novo, justificativa)
  values (auth.uid(),
          coalesce(v_nome, case when auth.uid() is null then 'Sistema' end),
          lower(tg_op), tg_table_name, v_id, v_old, v_new,
          nullif(current_setting('app.justificativa', true), ''));
  return coalesce(new, old);
end $$;

create or replace function public.fn_bloquear_alteracao()
returns trigger language plpgsql as $$
begin
  raise exception 'Registros de histórico e auditoria não podem ser alterados nem apagados.' using errcode = '42501';
end $$;

create or replace function public.fn_set_justificativa(p_texto text)
returns void language sql as $$
  select set_config('app.justificativa', coalesce(p_texto, ''), true)
$$;

create or replace function public.fn_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 5. OCUPAÇÃO DE PERÍODOS (proteção contra conflito no banco)
-- ---------------------------------------------------------------------
create or replace function public.fn_descrever_ocupacao(p_caminhao uuid, p_data date, p_periodo text)
returns text language plpgsql stable security definer set search_path = public as $$
declare o public.ocupacoes; s public.solicitacoes;
begin
  select * into o from public.ocupacoes where caminhao_id = p_caminhao and data = p_data and periodo = p_periodo;
  if not found then return 'outra reserva'; end if;
  if o.origem = 'solicitacao' then
    select * into s from public.solicitacoes where id = o.origem_id;
    return format('a solicitação nº %s (%s)', s.numero,
      case s.status when 'pendente' then 'pendente' when 'esclarecimento' then 'aguardando esclarecimentos'
                    else 'aprovada' end);
  elsif o.origem = 'bloqueio' then return 'um bloqueio administrativo';
  else return 'uma atividade de manutenção/serviço';
  end if;
end $$;

create or replace function public.fn_ocupar(p_caminhao uuid, p_data date, p_periodo text,
  p_origem text, p_origem_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p text;
begin
  foreach v_p in array (case when p_periodo = 'dia' then array['manha','tarde'] else array[p_periodo] end) loop
    begin
      insert into public.ocupacoes (caminhao_id, data, periodo, origem, origem_id)
      values (p_caminhao, p_data, v_p, p_origem, p_origem_id);
    exception when unique_violation then
      raise exception 'CONFLITO DE AGENDA: o período % de % já está ocupado por %. Resolva o conflito ou escolha outro período.',
        public.fn_rotulo_periodo(v_p), to_char(p_data, 'DD/MM/YYYY'),
        public.fn_descrever_ocupacao(p_caminhao, p_data, v_p)
        using errcode = '23505';
    end;
  end loop;
end $$;

create or replace function public.fn_liberar(p_origem text, p_origem_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.ocupacoes where origem = p_origem and origem_id = p_origem_id
$$;

-- Solicitações: pendente / esclarecimento / aprovada OCUPAM o período.
create or replace function public.trg_solicitacao_ocupacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old_ativa boolean := false; v_new_ativa boolean;
begin
  v_new_ativa := new.status in ('pendente','esclarecimento','aprovada');
  if tg_op = 'UPDATE' then
    v_old_ativa := old.status in ('pendente','esclarecimento','aprovada');
    if v_old_ativa = v_new_ativa and old.data = new.data and old.periodo = new.periodo
       and old.caminhao_id = new.caminhao_id then
      return new;
    end if;
    if v_old_ativa then perform public.fn_liberar('solicitacao', old.id); end if;
  end if;
  if v_new_ativa then
    perform public.fn_ocupar(new.caminhao_id, new.data, new.periodo, 'solicitacao', new.id);
  end if;
  return new;
end $$;

create or replace function public.trg_bloqueio_ocupacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.ativo then
      if extract(isodow from new.data) > 5 then
        raise exception 'Bloqueios só são necessários de segunda a sexta-feira.';
      end if;
      perform public.fn_ocupar(new.caminhao_id, new.data, new.periodo, 'bloqueio', new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.ativo and not new.ativo then
      if coalesce(trim(new.motivo_remocao), '') = '' then
        raise exception 'Informe o motivo da remoção do bloqueio.';
      end if;
      new.removido_em := now();
      new.removido_por := auth.uid();
      perform public.fn_liberar('bloqueio', old.id);
    elsif new.ativo and (old.data, old.periodo, old.caminhao_id) is distinct from (new.data, new.periodo, new.caminhao_id) then
      raise exception 'Para alterar um bloqueio, remova-o e crie outro.';
    elsif not old.ativo and new.ativo then
      raise exception 'Bloqueio removido não pode ser reativado. Crie um novo bloqueio.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.trg_atividade_ocupacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'programada' then
      perform public.fn_ocupar(new.caminhao_id, new.data, new.periodo, 'atividade', new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if (old.data, old.periodo, old.caminhao_id) is distinct from (new.data, new.periodo, new.caminhao_id) then
      if old.status <> 'programada' then
        raise exception 'Somente atividades programadas podem mudar de data.';
      end if;
      perform public.fn_liberar('atividade', old.id);
      perform public.fn_ocupar(new.caminhao_id, new.data, new.periodo, 'atividade', new.id);
    end if;
    if new.status = 'cancelada' and old.status <> 'cancelada' then
      perform public.fn_liberar('atividade', old.id);
    elsif old.status = 'cancelada' and new.status <> 'cancelada' then
      raise exception 'Atividade cancelada não pode ser reaberta. Cadastre uma nova.';
    end if;
    -- conclusão de manutenção vinculada a plano preventivo atualiza o plano
    if new.status = 'concluida' and old.status <> 'concluida' and new.plano_id is not null then
      update public.planos_manutencao
         set ultima_data = new.data,
             ultimo_km = coalesce(new.km_execucao, (select km_atual from public.caminhoes where id = new.caminhao_id))
       where id = new.plano_id;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. SOLICITAÇÕES — OPERAÇÕES (únicas portas de escrita)
-- ---------------------------------------------------------------------
create or replace function public.criar_solicitacao(
  p_caminhao_id uuid, p_obra_id uuid, p_data date, p_periodo text, p_categoria_id uuid,
  p_descricao text, p_justificativa text, p_local_especifico text default null, p_observacoes text default null)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v_perfil text; v_cat public.categorias; v_obra public.obras; v_s public.solicitacoes;
begin
  v_perfil := public.fn_exigir_perfil(array['admin','solicitante']);

  if not exists (select 1 from public.caminhoes where id = p_caminhao_id and ativo) then
    raise exception 'Caminhão não encontrado ou inativo.';
  end if;
  select * into v_obra from public.obras where id = p_obra_id;
  if not found or not v_obra.ativa then
    raise exception 'Obra não encontrada ou inativa. Obras inativas não recebem novas solicitações.';
  end if;
  select * into v_cat from public.categorias where id = p_categoria_id;
  if not found or not v_cat.ativa then raise exception 'Categoria inválida ou desativada.'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'Descreva a atividade.'; end if;
  if coalesce(trim(p_justificativa), '') = '' then raise exception 'Informe a justificativa.'; end if;

  perform public.fn_validar_data_agendamento(p_data, p_periodo, v_perfil = 'admin');

  insert into public.solicitacoes (caminhao_id, obra_id, solicitante_id, data, periodo, categoria_id,
         categoria_nome, descricao, local_especifico, justificativa, observacoes)
  values (p_caminhao_id, p_obra_id, auth.uid(), p_data, p_periodo, p_categoria_id, v_cat.nome,
         trim(p_descricao), nullif(trim(p_local_especifico), ''), trim(p_justificativa), nullif(trim(p_observacoes), ''))
  returning * into v_s;

  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (v_s.id, auth.uid(), 'criacao', 'Solicitação criada.');

  perform public.fn_notificar_perfis(array['admin'], 'nova_solicitacao',
    format('Nova solicitação nº %s', v_s.numero),
    format('%s — %s, %s. Obra: %s.', v_cat.nome, to_char(v_s.data, 'DD/MM/YYYY'),
           public.fn_rotulo_periodo(v_s.periodo), v_obra.nome),
    '#/solicitacoes/' || v_s.id, null, auth.uid());
  return v_s;
end $$;

create or replace function public.fn_carregar_solicitacao(p_id uuid)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes;
begin
  select * into v from public.solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  return v;
end $$;

create or replace function public.aprovar_solicitacao(p_id uuid, p_prioridade text default null, p_comentario text default null)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes;
begin
  perform public.fn_exigir_perfil(array['admin']);
  v := public.fn_carregar_solicitacao(p_id);
  if v.status not in ('pendente','esclarecimento') then
    raise exception 'Somente solicitações pendentes ou em esclarecimento podem ser aprovadas.';
  end if;
  if public.fn_inicio_periodo(v.data, v.periodo) + interval '5 hours' < now() then
    raise exception 'O período desta solicitação já passou. Recuse ou cancele a solicitação.';
  end if;
  perform public.fn_set_justificativa(p_comentario);
  update public.solicitacoes
     set status = 'aprovada', prioridade = coalesce(p_prioridade, prioridade),
         decidido_por = auth.uid(), decidido_em = now()
   where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'aprovacao', coalesce(nullif(trim(p_comentario), ''), 'Solicitação aprovada.'));
  perform public.fn_notificar(v.solicitante_id, 'aprovacao', format('Solicitação nº %s aprovada', v.numero),
    format('%s, %s.', to_char(v.data, 'DD/MM/YYYY'), public.fn_rotulo_periodo(v.periodo)), '#/solicitacoes/' || v.id);
  perform public.fn_notificar_perfis(array['motorista'], 'programacao', format('Nova atividade programada (nº %s)', v.numero),
    format('%s, %s — %s.', to_char(v.data, 'DD/MM/YYYY'), public.fn_rotulo_periodo(v.periodo), v.categoria_nome), '#/motorista');
  return v;
end $$;

create or replace function public.recusar_solicitacao(p_id uuid, p_motivo text)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes;
begin
  perform public.fn_exigir_perfil(array['admin']);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'A recusa exige justificativa.'; end if;
  v := public.fn_carregar_solicitacao(p_id);
  if v.status not in ('pendente','esclarecimento') then
    raise exception 'Somente solicitações pendentes ou em esclarecimento podem ser recusadas.';
  end if;
  perform public.fn_set_justificativa(p_motivo);
  update public.solicitacoes set status = 'recusada', decidido_por = auth.uid(), decidido_em = now()
   where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'recusa', trim(p_motivo));
  perform public.fn_notificar(v.solicitante_id, 'recusa', format('Solicitação nº %s recusada', v.numero),
    'Motivo: ' || trim(p_motivo), '#/solicitacoes/' || v.id);
  return v;
end $$;

create or replace function public.pedir_esclarecimento(p_id uuid, p_texto text)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes;
begin
  perform public.fn_exigir_perfil(array['admin']);
  if coalesce(trim(p_texto), '') = '' then raise exception 'Informe o que precisa ser esclarecido.'; end if;
  v := public.fn_carregar_solicitacao(p_id);
  if v.status <> 'pendente' then
    raise exception 'Só é possível pedir esclarecimentos de solicitações pendentes.';
  end if;
  update public.solicitacoes set status = 'esclarecimento' where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'esclarecimento_pedido', trim(p_texto));
  perform public.fn_notificar(v.solicitante_id, 'esclarecimento',
    format('Esclarecimento solicitado — nº %s', v.numero), trim(p_texto), '#/solicitacoes/' || v.id);
  return v;
end $$;

create or replace function public.responder_esclarecimento(p_id uuid, p_texto text)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes; v_perfil text;
begin
  v_perfil := public.fn_exigir_perfil(array['admin','solicitante']);
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a resposta ao esclarecimento.'; end if;
  v := public.fn_carregar_solicitacao(p_id);
  if v.solicitante_id <> auth.uid() and v_perfil <> 'admin' then
    raise exception 'Somente o solicitante pode responder a este esclarecimento.' using errcode = '42501';
  end if;
  if v.status <> 'esclarecimento' then raise exception 'Esta solicitação não está aguardando esclarecimentos.'; end if;
  update public.solicitacoes set status = 'pendente' where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'esclarecimento_resposta', trim(p_texto));
  perform public.fn_notificar_perfis(array['admin'], 'esclarecimento_resposta',
    format('Esclarecimento respondido — nº %s', v.numero), left(trim(p_texto), 200), '#/solicitacoes/' || v.id);
  return v;
end $$;

create or replace function public.cancelar_solicitacao(p_id uuid, p_motivo text)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes; v_status_ant text;
begin
  perform public.fn_exigir_perfil(array['admin']);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'O cancelamento exige motivo.'; end if;
  v := public.fn_carregar_solicitacao(p_id);
  if v.status not in ('pendente','esclarecimento','aprovada') then
    raise exception 'Esta solicitação não pode mais ser cancelada.';
  end if;
  if v.execucao = 'em_atendimento' then
    raise exception 'O atendimento já foi iniciado pelo motorista. Aguarde a finalização ou conclua a solicitação.';
  end if;
  v_status_ant := v.status;
  perform public.fn_set_justificativa(p_motivo);
  update public.solicitacoes set status = 'cancelada', decidido_por = auth.uid(), decidido_em = now()
   where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'cancelamento', trim(p_motivo));
  perform public.fn_notificar(v.solicitante_id, 'cancelamento', format('Solicitação nº %s cancelada', v.numero),
    'Motivo: ' || trim(p_motivo), '#/solicitacoes/' || v.id);
  if v_status_ant = 'aprovada' then
    perform public.fn_notificar_perfis(array['motorista'], 'cancelamento',
      format('Atividade nº %s cancelada', v.numero),
      format('%s, %s — período liberado.', to_char(v.data, 'DD/MM/YYYY'), public.fn_rotulo_periodo(v.periodo)), '#/motorista');
  end if;
  return v;
end $$;

create or replace function public.definir_prioridade(p_id uuid, p_prioridade text)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes;
begin
  perform public.fn_exigir_perfil(array['admin']);
  if p_prioridade not in ('baixa','normal','alta','urgente') then raise exception 'Prioridade inválida.'; end if;
  v := public.fn_carregar_solicitacao(p_id);
  update public.solicitacoes set prioridade = p_prioridade where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'prioridade', 'Prioridade definida como: ' || p_prioridade);
  return v;
end $$;

-- Motorista: iniciar e finalizar atendimento (idempotentes; aceitam horário
-- registrado offline no aparelho). Finalizar NÃO libera o período: o
-- administrador valida e conclui.
create or replace function public.iniciar_atendimento(p_id uuid, p_momento timestamptz default null, p_offline boolean default false)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes; v_m timestamptz := least(coalesce(p_momento, now()), now());
begin
  perform public.fn_exigir_perfil(array['admin','motorista']);
  v := public.fn_carregar_solicitacao(p_id);
  if v.status <> 'aprovada' then raise exception 'Somente atividades aprovadas podem ser iniciadas.'; end if;
  if v.execucao <> 'aguardando' then return v; end if;  -- já iniciada (sincronização repetida)
  if v_m::date < v.data - 1 then raise exception 'Esta atividade está programada para %.', to_char(v.data,'DD/MM/YYYY'); end if;
  update public.solicitacoes
     set execucao = 'em_atendimento', execucao_inicio = v_m, execucao_motorista_id = auth.uid(),
         execucao_offline = execucao_offline or p_offline
   where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'inicio_atendimento',
          'Atendimento iniciado em ' || to_char(v_m at time zone public.fn_fuso(), 'DD/MM/YYYY HH24:MI')
          || case when p_offline then ' (registrado sem conexão)' else '' end);
  return v;
end $$;

create or replace function public.finalizar_atendimento(p_id uuid, p_momento timestamptz default null,
  p_observacao text default null, p_offline boolean default false)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes; v_m timestamptz := least(coalesce(p_momento, now()), now());
begin
  perform public.fn_exigir_perfil(array['admin','motorista']);
  v := public.fn_carregar_solicitacao(p_id);
  if v.execucao = 'finalizada' then return v; end if;   -- idempotente
  if v.status <> 'aprovada' then raise exception 'Somente atividades aprovadas podem ser finalizadas.'; end if;
  update public.solicitacoes
     set execucao = 'finalizada',
         execucao_inicio = coalesce(execucao_inicio, v_m),
         execucao_fim = v_m,
         execucao_motorista_id = coalesce(execucao_motorista_id, auth.uid()),
         execucao_offline = execucao_offline or p_offline
   where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'fim_atendimento',
          'Atendimento finalizado em ' || to_char(v_m at time zone public.fn_fuso(), 'DD/MM/YYYY HH24:MI')
          || case when p_offline then ' (registrado sem conexão e sincronizado)' else '' end
          || coalesce('. ' || nullif(trim(p_observacao), ''), ''));
  perform public.fn_notificar_perfis(array['admin'], 'atendimento_finalizado',
    format('Atendimento nº %s finalizado', v.numero),
    'O motorista finalizou o atendimento. Valide e conclua para liberar o período.', '#/solicitacoes/' || v.id);
  return v;
end $$;

-- Encerramento administrativo: conclui e LIBERA o período
create or replace function public.concluir_solicitacao(p_id uuid, p_observacao text default null)
returns public.solicitacoes language plpgsql security definer set search_path = public as $$
declare v public.solicitacoes;
begin
  perform public.fn_exigir_perfil(array['admin']);
  v := public.fn_carregar_solicitacao(p_id);
  if v.status <> 'aprovada' then raise exception 'Somente solicitações aprovadas podem ser concluídas.'; end if;
  perform public.fn_set_justificativa(p_observacao);
  update public.solicitacoes set status = 'concluida',
         execucao = case when execucao = 'aguardando' then 'aguardando' else 'finalizada' end,
         execucao_fim = coalesce(execucao_fim, case when execucao <> 'aguardando' then now() end)
   where id = p_id returning * into v;
  insert into public.solicitacao_historico (solicitacao_id, autor_id, tipo, texto)
  values (p_id, auth.uid(), 'conclusao', coalesce(nullif(trim(p_observacao), ''), 'Solicitação concluída pelo administrador.'));
  perform public.fn_notificar(v.solicitante_id, 'conclusao', format('Solicitação nº %s concluída', v.numero),
    'Atendimento encerrado.', '#/solicitacoes/' || v.id);
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. GATILHOS DE PROTEÇÃO E NOTIFICAÇÃO
-- ---------------------------------------------------------------------
-- Último administrador ativo não pode ser removido; nome de usuário é imutável.
create or replace function public.trg_perfis_protecao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario is distinct from old.usuario then
    raise exception 'O nome de usuário não pode ser alterado. Cadastre um novo usuário se necessário.';
  end if;
  if old.perfil = 'admin' and old.ativo and (new.perfil <> 'admin' or not new.ativo) then
    if (select count(*) from public.perfis where perfil = 'admin' and ativo and id <> old.id) = 0 then
      raise exception 'Não é possível remover o último administrador ativo do sistema.';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.trg_categoria_protecao()
returns trigger language plpgsql as $$
begin
  if old.protegida and (not new.ativa or new.nome <> old.nome) then
    raise exception 'A categoria "Outros" deve permanecer disponível e não pode ser renomeada.';
  end if;
  new.protegida := old.protegida;
  return new;
end $$;

create or replace function public.trg_bloqueio_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.criado_por := coalesce(auth.uid(), new.criado_por);
  return new;
end $$;

create or replace function public.trg_bloqueio_pos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo then
    perform public.fn_notificar_perfis(array['motorista','solicitante'], 'bloqueio',
      'Agenda bloqueada: ' || to_char(new.data, 'DD/MM/YYYY'),
      public.fn_rotulo_periodo(new.periodo) || ' — ' || new.motivo, '#/agenda');
  end if;
  return new;
end $$;

create or replace function public.trg_atividade_pos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_notificar_perfis(array['motorista'], 'manutencao',
    'Caminhão indisponível: ' || to_char(new.data, 'DD/MM/YYYY'),
    public.fn_rotulo_periodo(new.periodo) || ' — ' || replace(new.tipo, '_', ' ') || ': ' || new.descricao, '#/agenda');
  return new;
end $$;

-- Checklist: o servidor recalcula irregularidades (não confia no aparelho)
create or replace function public.trg_checklist_avaliar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_criticos text[] := array['pneus','freios','luzes e sinalização','gancho e dispositivos de segurança',
                             'cabos e cintas','comandos hidráulicos','estabilizadores/patolas','estrutura da lança',
                             'vazamentos, desgaste ou avarias'];
  it jsonb; v_irr boolean := false; v_crit boolean := false;
begin
  if jsonb_typeof(new.itens) <> 'array' or jsonb_array_length(new.itens) = 0 then
    raise exception 'Checklist sem itens.';
  end if;
  for it in select * from jsonb_array_elements(new.itens) loop
    if it ->> 'resultado' not in ('conforme','irregular','na') then
      raise exception 'Resultado inválido no item "%". Use conforme, irregular ou não se aplica.', it ->> 'item';
    end if;
    if it ->> 'resultado' = 'irregular' then
      v_irr := true;
      if coalesce((it ->> 'critico')::boolean, false) or lower(it ->> 'item') = any(v_criticos) then
        v_crit := true;
      end if;
    end if;
  end loop;
  new.tem_irregularidade := v_irr;
  new.tem_critico := v_crit;
  return new;
end $$;

create or replace function public.trg_checklist_pos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if new.tem_critico then
    select nome_completo into v_nome from public.perfis where id = new.motorista_id;
    perform public.fn_notificar_perfis(array['admin'], 'irregularidade',
      'IRREGULARIDADE CRÍTICA no checklist de ' || new.tipo,
      coalesce(v_nome, 'Motorista') || ' registrou irregularidade crítica. Verifique antes de liberar o caminhão.',
      '#/diario', 'checklist:' || new.id);
  end if;
  return new;
end $$;

create or replace function public.trg_ocorrencia_pos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.fn_notificar_perfis(array['admin'], 'ocorrencia',
      'Nova ocorrência: ' || replace(new.tipo, '_', ' '), left(new.descricao, 200), '#/ocorrencias', 'ocorrencia:' || new.id);
  elsif new.status is distinct from old.status then
    if new.status = 'resolvida' then
      new.resolvido_em := now(); new.resolvido_por := auth.uid();
    end if;
    perform public.fn_notificar(new.motorista_id, 'ocorrencia',
      'Ocorrência atualizada: ' || replace(new.status, '_', ' '), coalesce(new.resolucao, ''), '#/diario');
  end if;
  return new;
end $$;

-- Quilometragem atual do caminhão
create or replace function public.fn_atualizar_km(p_caminhao uuid, p_km numeric)
returns void language sql security definer set search_path = public as $$
  update public.caminhoes set km_atual = greatest(km_atual, coalesce(p_km, 0)) where id = p_caminhao
$$;

create or replace function public.trg_expediente_km()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_atualizar_km(new.caminhao_id, greatest(new.km_inicial, coalesce(new.km_final, 0)));
  return new;
end $$;

-- Abastecimento gera despesa (pendente quando lançada pelo motorista)
create or replace function public.trg_abastecimento_pos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.fn_is_admin();
begin
  perform public.fn_atualizar_km(new.caminhao_id, new.km);
  insert into public.despesas (caminhao_id, categoria, descricao, valor, data, km, fornecedor, status, origem,
                               origem_id, lancado_por, aprovado_por, aprovado_em)
  values (new.caminhao_id, 'abastecimento',
          format('Abastecimento: %s L', trim(to_char(new.litros, 'FM999990.000'))),
          new.valor, (new.data_hora at time zone public.fn_fuso())::date, new.km, new.posto,
          case when v_admin then 'aprovada' else 'pendente' end, 'abastecimento', new.id, new.motorista_id,
          case when v_admin then auth.uid() end, case when v_admin then now() end)
  on conflict do nothing;
  return new;
end $$;

-- Despesas: motorista só lança como pendente; admin aprova/recusa
create or replace function public.trg_despesa_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.fn_is_admin();
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not v_admin and new.origem <> 'abastecimento' then
      new.status := 'pendente'; new.origem := 'motorista'; new.lancado_por := auth.uid();
      new.aprovado_por := null; new.aprovado_em := null;
    elsif v_admin and new.origem = 'admin' then
      new.lancado_por := auth.uid();
      if new.status = 'aprovada' then new.aprovado_por := auth.uid(); new.aprovado_em := now(); end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status = 'recusada' and coalesce(trim(new.motivo_recusa), '') = '' then
        raise exception 'Informe o motivo da recusa da despesa.';
      end if;
      new.aprovado_por := auth.uid(); new.aprovado_em := now();
    end if;
  end if;
  return new;
end $$;

create or replace function public.trg_despesa_pos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pendente' then
    perform public.fn_notificar_perfis(array['admin'], 'despesa',
      'Despesa aguardando aprovação', format('%s — R$ %s', new.descricao, to_char(new.valor, 'FM999G999G990D00')),
      '#/despesas', 'despesa:' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.lancado_por is not null then
    perform public.fn_notificar(new.lancado_por, 'despesa', 'Despesa ' || new.status,
      new.descricao || coalesce(' — ' || new.motivo_recusa, ''), '#/diario');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 8. ALERTAS DE MANUTENÇÃO E DOCUMENTOS
-- ---------------------------------------------------------------------
create or replace view public.vw_planos_manutencao with (security_invoker = true) as
select p.*,
       c.nome as caminhao_nome, c.km_atual,
       case when p.intervalo_dias is not null and p.ultima_data is not null
            then p.ultima_data + p.intervalo_dias end as proxima_data,
       case when p.intervalo_km is not null and p.ultimo_km is not null
            then p.ultimo_km + p.intervalo_km end as proximo_km,
       case
         when p.ultima_data is null and p.ultimo_km is null then 'sem_historico'
         when (p.intervalo_dias is not null and p.ultima_data is not null and p.ultima_data + p.intervalo_dias < public.fn_hoje_local())
           or (p.intervalo_km is not null and p.ultimo_km is not null and c.km_atual >= p.ultimo_km + p.intervalo_km)
           then 'vencida'
         when (p.intervalo_dias is not null and p.ultima_data is not null
               and p.ultima_data + p.intervalo_dias <= public.fn_hoje_local()
                   + (select alerta_manutencao_dias from public.configuracoes where id = 1))
           or (p.intervalo_km is not null and p.ultimo_km is not null
               and c.km_atual >= p.ultimo_km + p.intervalo_km - (select alerta_manutencao_km from public.configuracoes where id = 1))
           then 'proxima'
         else 'em_dia' end as situacao
  from public.planos_manutencao p
  join public.caminhoes c on c.id = p.caminhao_id;

create or replace function public.gerar_alertas()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; c public.configuracoes;
begin
  -- pode ser chamado por administrador logado ou pelo agendador do banco (pg_cron)
  if auth.uid() is not null then perform public.fn_exigir_perfil(array['admin']); end if;
  select * into c from public.configuracoes where id = 1;

  for r in select d.*, k.nome as caminhao_nome from public.documentos d join public.caminhoes k on k.id = d.caminhao_id
            where d.ativo and d.validade is not null
              and d.validade <= public.fn_hoje_local() + c.alerta_documento_dias loop
    perform public.fn_notificar_perfis(array['admin'], 'documento',
      case when r.validade < public.fn_hoje_local() then 'Documento VENCIDO: ' else 'Documento a vencer: ' end || r.descricao,
      format('%s — validade %s', r.caminhao_nome, to_char(r.validade, 'DD/MM/YYYY')),
      '#/documentos', 'doc:' || r.id || ':' || r.validade || ':' || (r.validade < public.fn_hoje_local()));
    n := n + 1;
  end loop;

  for r in select * from public.vw_planos_manutencao where ativo and situacao in ('vencida','proxima') loop
    perform public.fn_notificar_perfis(array['admin'], 'manutencao',
      case when r.situacao = 'vencida' then 'Manutenção VENCIDA: ' else 'Manutenção próxima: ' end || r.descricao,
      format('%s — próxima: %s %s', r.caminhao_nome,
             coalesce(to_char(r.proxima_data, 'DD/MM/YYYY'), ''),
             coalesce('/ ' || r.proximo_km || ' km', '')),
      '#/manutencoes', 'plano:' || r.id || ':' || coalesce(r.ultima_data::text, '') || ':' || coalesce(r.ultimo_km::text, '') || ':' || r.situacao);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 9. AGENDA CONSOLIDADA (visão única para as telas)
-- ---------------------------------------------------------------------
create or replace view public.vw_agenda with (security_invoker = true) as
select 'solicitacao'::text as origem, s.id, s.numero, s.caminhao_id, s.data, s.periodo,
       case
         when s.status in ('pendente','esclarecimento') then 'reservado'
         when s.status = 'concluida' then 'concluido'
         when s.execucao = 'em_atendimento' then 'em_atendimento'
         when s.execucao = 'finalizada' then 'finalizado'
         else 'agendado' end as situacao,
       s.status, s.execucao, s.prioridade,
       s.obra_id, o.nome as obra_nome, o.endereco as obra_endereco,
       o.responsavel_nome as obra_responsavel, o.responsavel_telefone as obra_telefone,
       o.contato1_nome, o.contato1_telefone, o.contato2_nome, o.contato2_telefone,
       s.solicitante_id, p.nome_completo as solicitante_nome,
       s.categoria_nome as categoria, s.descricao, s.local_especifico, s.observacoes,
       s.execucao_inicio, s.execucao_fim
  from public.solicitacoes s
  join public.obras o on o.id = s.obra_id
  join public.perfis p on p.id = s.solicitante_id
 where s.status in ('pendente','esclarecimento','aprovada','concluida')
union all
select 'bloqueio', b.id, null, b.caminhao_id, b.data, per.periodo, 'bloqueado', 'bloqueado', null, null,
       null, null, null, null, null, null, null, null, null, b.criado_por, null,
       'Bloqueio', b.motivo, null, null, null, null
  from public.bloqueios b
  cross join lateral unnest(case when b.periodo = 'dia' then array['manha','tarde'] else array[b.periodo] end) as per(periodo)
 where b.ativo
union all
select 'atividade', a.id, null, a.caminhao_id, a.data, per.periodo, 'manutencao', a.status, null, null,
       null, null, a.endereco, a.empresa, a.telefone, null, null, null, null, a.criado_por, null,
       replace(initcap(replace(a.tipo, '_', ' ')), 'Manutencao', 'Manutenção'), a.descricao, null, a.observacoes, null, null
  from public.atividades_operacionais a
  cross join lateral unnest(case when a.periodo = 'dia' then array['manha','tarde'] else array[a.periodo] end) as per(periodo)
 where a.status <> 'cancelada';

-- ---------------------------------------------------------------------
-- 10. DIVERSOS PARA A INTERFACE
-- ---------------------------------------------------------------------
create or replace function public.registrar_login()
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.fn_usuario_ativo() then
    insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id)
    select id, nome_completo, 'login', 'perfis', id::text from public.perfis where id = auth.uid();
  end if;
end $$;

create or replace function public.marcar_notificacoes_lidas(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notificacoes set lida = true
   where usuario_id = auth.uid() and not lida and (p_ids is null or id = any(p_ids))
$$;

-- Painel financeiro (somente despesas APROVADAS compõem o total oficial)
create or replace function public.resumo_financeiro(p_caminhao uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_km numeric; v_total numeric;
begin
  perform public.fn_exigir_perfil(array['admin']);
  select coalesce(sum(valor), 0) into v_total from public.despesas
   where status = 'aprovada' and data between p_inicio and p_fim and (p_caminhao is null or caminhao_id = p_caminhao);
  select coalesce(sum(km_final - km_inicial), 0) into v_km from public.expedientes
   where km_final is not null and (inicio_em at time zone public.fn_fuso())::date between p_inicio and p_fim
     and (p_caminhao is null or caminhao_id = p_caminhao);
  select jsonb_build_object(
    'total', v_total,
    'km_rodados', v_km,
    'custo_por_km', case when v_km > 0 then round(v_total / v_km, 2) end,
    'pendentes', (select coalesce(sum(valor),0) from public.despesas where status = 'pendente'
                   and data between p_inicio and p_fim and (p_caminhao is null or caminhao_id = p_caminhao)),
    'acumulado_geral', (select coalesce(sum(valor),0) from public.despesas where status = 'aprovada'
                   and (p_caminhao is null or caminhao_id = p_caminhao)),
    'por_categoria', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select categoria, sum(valor) as total, count(*) as qtd from public.despesas
         where status = 'aprovada' and data between p_inicio and p_fim and (p_caminhao is null or caminhao_id = p_caminhao)
         group by categoria) x),
    'por_mes', (select coalesce(jsonb_agg(x order by x.mes), '[]'::jsonb) from (
        select to_char(date_trunc('month', data), 'YYYY-MM') as mes, sum(valor) as total from public.despesas
         where status = 'aprovada' and data between p_inicio and p_fim and (p_caminhao is null or caminhao_id = p_caminhao)
         group by 1) x)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 11. FUNÇÕES EXCLUSIVAS DO SERVIDOR (Edge Functions, chave service_role)
-- Nunca executáveis pelo navegador.
-- ---------------------------------------------------------------------
create or replace function public.svc_normalizar_segredo(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.svc_limite_excedido(p_chave text, p_tipo text, p_max int, p_minutos int)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= p_max from public.tentativas_acesso
   where chave = p_chave and tipo = p_tipo and not sucesso
     and criado_em > now() - make_interval(mins => p_minutos)
$$;

create or replace function public.svc_registrar_tentativa(p_chave text, p_tipo text, p_sucesso boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.tentativas_acesso (chave, tipo, sucesso) values (p_chave, p_tipo, p_sucesso);
  if p_sucesso then
    -- sucesso zera o contador desta chave
    delete from public.tentativas_acesso where chave = p_chave and tipo = p_tipo and not sucesso;
  end if;
  delete from public.tentativas_acesso where criado_em < now() - interval '30 days';
end $$;

-- Valida o código de primeiro acesso. Retorna o id do usuário ou NULL.
-- Sempre executa um bcrypt (mesmo sem usuário) para não revelar se a conta existe.
create or replace function public.svc_validar_codigo_acesso(p_usuario text, p_codigo text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_hash text; v_exp timestamptz; v_ok boolean;
  v_dummy constant text := '$2a$10$abcdefghijklmnopqrstuuK9V8yS1xWJvwr3cZ7ZcVpu1bJvJ0yTO';
begin
  select p.id, c.codigo_acesso_hash, c.codigo_acesso_expira_em into v_id, v_hash, v_exp
    from public.perfis p join public.credenciais_acesso c on c.usuario_id = p.id
   where lower(p.usuario) = lower(trim(p_usuario)) and p.ativo and p.primeiro_acesso_pendente;
  v_ok := extensions.crypt(public.svc_normalizar_segredo(p_codigo), coalesce(v_hash, v_dummy)) = coalesce(v_hash, v_dummy);
  if v_id is null or v_hash is null or not v_ok or v_exp < now() then return null; end if;
  return v_id;
end $$;

create or replace function public.svc_validar_chave_recuperacao(p_usuario text, p_chave text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_hash text; v_ok boolean;
  v_dummy constant text := '$2a$10$abcdefghijklmnopqrstuuK9V8yS1xWJvwr3cZ7ZcVpu1bJvJ0yTO';
begin
  select p.id, c.chave_recuperacao_hash into v_id, v_hash
    from public.perfis p join public.credenciais_acesso c on c.usuario_id = p.id
   where lower(p.usuario) = lower(trim(p_usuario)) and p.ativo and not p.primeiro_acesso_pendente;
  v_ok := extensions.crypt(public.svc_normalizar_segredo(p_chave), coalesce(v_hash, v_dummy)) = coalesce(v_hash, v_dummy);
  if v_id is null or v_hash is null or not v_ok then return null; end if;
  return v_id;
end $$;

create or replace function public.svc_invalidar_sessoes(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.perfis set sessoes_invalidadas_em = now() where id = p_usuario;
  begin
    delete from auth.sessions where user_id = p_usuario;   -- encerra tokens de renovação
  exception when others then null;
  end;
end $$;

-- Grava nova chave de recuperação (hash) após primeiro acesso ou recuperação
create or replace function public.svc_gravar_nova_chave(p_usuario uuid, p_chave text, p_acao text, p_ator uuid default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_nome text;
begin
  insert into public.credenciais_acesso (usuario_id) values (p_usuario) on conflict do nothing;
  update public.credenciais_acesso
     set chave_recuperacao_hash = extensions.crypt(public.svc_normalizar_segredo(p_chave), extensions.gen_salt('bf', 10)),
         chave_gerada_em = now(), codigo_acesso_hash = null, codigo_acesso_expira_em = null, atualizado_em = now()
   where usuario_id = p_usuario;
  update public.perfis set primeiro_acesso_pendente = false where id = p_usuario;
  perform public.svc_invalidar_sessoes(p_usuario);
  select nome_completo into v_nome from public.perfis where id = coalesce(p_ator, p_usuario);
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, justificativa)
  values (coalesce(p_ator, p_usuario), v_nome, p_acao, 'perfis', p_usuario::text,
          case p_acao when 'primeiro_acesso' then 'Senha criada no primeiro acesso; chave de recuperação gerada.'
                      when 'recuperacao_senha' then 'Senha recuperada com chave pessoal; chave anterior invalidada.'
                      else null end);
end $$;

-- Define código de primeiro acesso (cadastro ou redefinição administrativa).
-- Invalida senha/chave/sessões anteriores. Exige justificativa na redefinição.
create or replace function public.svc_definir_codigo_acesso(p_usuario uuid, p_codigo text, p_ator uuid,
  p_acao text, p_justificativa text default null, p_validade_horas int default 72)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_nome text;
begin
  if p_acao = 'redefinicao_acesso' and coalesce(trim(p_justificativa), '') = '' then
    raise exception 'Informe a justificativa e como a identidade foi confirmada.';
  end if;
  insert into public.credenciais_acesso (usuario_id) values (p_usuario) on conflict do nothing;
  update public.credenciais_acesso
     set codigo_acesso_hash = extensions.crypt(public.svc_normalizar_segredo(p_codigo), extensions.gen_salt('bf', 10)),
         codigo_acesso_expira_em = now() + make_interval(hours => p_validade_horas),
         chave_recuperacao_hash = null, chave_gerada_em = null, atualizado_em = now()
   where usuario_id = p_usuario;
  update public.perfis set primeiro_acesso_pendente = true where id = p_usuario;
  perform public.svc_invalidar_sessoes(p_usuario);
  select nome_completo into v_nome from public.perfis where id = p_ator;
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, justificativa)
  values (p_ator, v_nome, p_acao, 'perfis', p_usuario::text, p_justificativa);
end $$;

create or replace function public.svc_auditar(p_usuario uuid, p_acao text, p_tabela text, p_registro text,
  p_justificativa text default null, p_novo jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, justificativa, valor_novo)
  values (p_usuario, (select nome_completo from public.perfis where id = p_usuario), p_acao, p_tabela, p_registro,
          p_justificativa, p_novo)
$$;

-- ---------------------------------------------------------------------
-- 12. LIGAÇÃO DOS GATILHOS
-- ---------------------------------------------------------------------
drop trigger if exists t_solic_ocupacao on public.solicitacoes;
create trigger t_solic_ocupacao after insert or update on public.solicitacoes
  for each row execute function public.trg_solicitacao_ocupacao();
drop trigger if exists t_solic_touch on public.solicitacoes;
create trigger t_solic_touch before update on public.solicitacoes for each row execute function public.fn_touch();

drop trigger if exists t_bloq_ocupacao on public.bloqueios;
create trigger t_bloq_ocupacao before insert or update on public.bloqueios
  for each row execute function public.trg_bloqueio_ocupacao();
drop trigger if exists t_bloq_autor on public.bloqueios;
create trigger t_bloq_autor before insert on public.bloqueios for each row execute function public.trg_bloqueio_notificar();
drop trigger if exists t_bloq_pos on public.bloqueios;
create trigger t_bloq_pos after insert on public.bloqueios for each row execute function public.trg_bloqueio_pos();

drop trigger if exists t_ativ_ocupacao on public.atividades_operacionais;
create trigger t_ativ_ocupacao after insert or update on public.atividades_operacionais
  for each row execute function public.trg_atividade_ocupacao();
drop trigger if exists t_ativ_pos on public.atividades_operacionais;
create trigger t_ativ_pos after insert on public.atividades_operacionais for each row execute function public.trg_atividade_pos();
drop trigger if exists t_ativ_touch on public.atividades_operacionais;
create trigger t_ativ_touch before update on public.atividades_operacionais for each row execute function public.fn_touch();

drop trigger if exists t_perfis_protecao on public.perfis;
create trigger t_perfis_protecao before update on public.perfis for each row execute function public.trg_perfis_protecao();
drop trigger if exists t_cat_protecao on public.categorias;
create trigger t_cat_protecao before update on public.categorias for each row execute function public.trg_categoria_protecao();
drop trigger if exists t_obras_touch on public.obras;
create trigger t_obras_touch before update on public.obras for each row execute function public.fn_touch();
drop trigger if exists t_cam_touch on public.caminhoes;
create trigger t_cam_touch before update on public.caminhoes for each row execute function public.fn_touch();

drop trigger if exists t_check_avaliar on public.checklists;
create trigger t_check_avaliar before insert or update on public.checklists for each row execute function public.trg_checklist_avaliar();
drop trigger if exists t_check_pos on public.checklists;
create trigger t_check_pos after insert on public.checklists for each row execute function public.trg_checklist_pos();

drop trigger if exists t_ocor_pos on public.ocorrencias;
create trigger t_ocor_pos before insert or update on public.ocorrencias for each row execute function public.trg_ocorrencia_pos();

drop trigger if exists t_exp_km on public.expedientes;
create trigger t_exp_km after insert or update on public.expedientes for each row execute function public.trg_expediente_km();
drop trigger if exists t_abast_pos on public.abastecimentos;
create trigger t_abast_pos after insert on public.abastecimentos for each row execute function public.trg_abastecimento_pos();

drop trigger if exists t_desp_antes on public.despesas;
create trigger t_desp_antes before insert or update on public.despesas for each row execute function public.trg_despesa_antes();
drop trigger if exists t_desp_pos on public.despesas;
create trigger t_desp_pos after insert or update on public.despesas for each row execute function public.trg_despesa_pos();

-- Imutáveis
drop trigger if exists t_audit_imutavel on public.auditoria;
create trigger t_audit_imutavel before update or delete on public.auditoria for each row execute function public.fn_bloquear_alteracao();
drop trigger if exists t_hist_imutavel on public.solicitacao_historico;
create trigger t_hist_imutavel before update or delete on public.solicitacao_historico for each row execute function public.fn_bloquear_alteracao();

-- Auditoria automática
do $$
declare t text;
begin
  foreach t in array array['perfis','caminhoes','obras','categorias','solicitacoes','bloqueios',
    'atividades_operacionais','planos_manutencao','despesas','documentos','configuracoes','expedientes',
    'checklists','atendimentos','atendimento_materiais','abastecimentos','ocorrencias','anexos'] loop
    execute format('drop trigger if exists t_auditoria on public.%I', t);
    execute format('create trigger t_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditar()', t);
  end loop;
end $$;

-- >>> 20261119000003_seguranca_rls.sql
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
grant execute on function public.fn_exigir_perfil(text[]) to authenticated;

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

-- >>> 20261119000004_dados_iniciais.sql
-- =====================================================================
-- CAMINHÃO MASTERS — MIGRAÇÃO 4: DADOS INICIAIS
-- Somente o essencial para o sistema funcionar. NENHUM dado fictício:
-- caminhão, obras e usuários são cadastrados pela Masters.
-- =====================================================================

insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

insert into public.categorias (nome, ordem, protegida) values
  ('Transporte de materiais', 10, false),
  ('Transporte de ferramentas/equipamentos', 20, false),
  ('Retirada de materiais', 30, false),
  ('Entrega de materiais', 40, false),
  ('Apoio operacional à obra', 50, false),
  ('Movimentação de materiais dentro da obra', 60, false),
  ('Outros', 999, true)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- OPCIONAL: alertas automáticos diários de documentos e manutenção.
-- No Supabase: Database > Extensions > ative "pg_cron"; depois rode:
--
--   select cron.schedule('alertas-caminhao-masters', '0 10 * * *',
--                        $$ select public.gerar_alertas(); $$);
--
-- (10:00 UTC = 06:00 em Manaus). Sem o pg_cron, os alertas também são
-- gerados sempre que um administrador abre o Painel.
-- ---------------------------------------------------------------------
