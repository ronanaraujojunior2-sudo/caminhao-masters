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
