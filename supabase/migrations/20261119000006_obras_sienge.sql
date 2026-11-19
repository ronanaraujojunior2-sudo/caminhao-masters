-- =====================================================================
-- CAMINHÃO MASTERS — Migração 6: importação de obras do Sienge
-- - Obras ganham o código oficial do Sienge (único), cliente, situação e
--   demais dados do arquivo.
-- - Obra importada pode ficar sem responsável até o administrador completar
--   (o arquivo do Sienge não traz responsável). Obra manual continua exigindo.
-- - Importação só pela função importar_obras_sienge (somente administrador,
--   uma transação, auditada). Nada é apagado; campo vazio nunca apaga dado.
-- =====================================================================

alter table public.obras add column if not exists codigo_sienge   text;
alter table public.obras add column if not exists cliente         text;
alter table public.obras add column if not exists situacao_sienge text;
alter table public.obras add column if not exists dados_sienge    jsonb not null default '{}'::jsonb;
alter table public.obras add column if not exists origem          text  not null default 'manual';

alter table public.obras drop constraint if exists obras_origem_check;
alter table public.obras add  constraint obras_origem_check check (origem in ('manual','sienge'));
alter table public.obras drop constraint if exists obras_codigo_sienge_check;
alter table public.obras add  constraint obras_codigo_sienge_check check (codigo_sienge is null or codigo_sienge ~ '^[0-9]{1,10}$');

-- nomes do Sienge podem ser mais longos que 120 caracteres
alter table public.obras drop constraint if exists obras_nome_check;
alter table public.obras add  constraint obras_nome_check check (length(trim(nome)) between 2 and 200);

-- responsável: obrigatório na obra manual; opcional na importada (completar depois)
alter table public.obras alter column responsavel_nome drop not null;
alter table public.obras drop constraint if exists obras_responsavel_nome_check;
alter table public.obras add  constraint obras_responsavel_nome_check
  check (responsavel_nome is null or length(trim(responsavel_nome)) >= 3);
alter table public.obras drop constraint if exists obras_responsavel_obrigatorio;
alter table public.obras add  constraint obras_responsavel_obrigatorio
  check (origem = 'sienge' or responsavel_nome is not null);

create unique index if not exists obras_codigo_sienge_unico on public.obras (codigo_sienge) where codigo_sienge is not null;

-- Nome: o Sienge pode ter duas obras com o mesmo nome e códigos diferentes.
-- Sem código, o nome continua único; e uma obra sem código não pode repetir o
-- nome de outra (com ou sem código) — nesse caso, vincula-se o código.
drop index if exists public.obras_nome_unico;
create unique index if not exists obras_nome_unico on public.obras (lower(trim(nome)), coalesce(codigo_sienge, ''));

create or replace function public.trg_obras_nome_sem_duplicar()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.obras o
              where o.id <> new.id and lower(trim(o.nome)) = lower(trim(new.nome))
                and (o.codigo_sienge is null or new.codigo_sienge is null)) then
    raise exception 'Já existe uma obra com o nome "%". Se for a mesma obra do Sienge, vincule o código a ela.', trim(new.nome)
      using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists t_obras_nome on public.obras;
create trigger t_obras_nome before insert or update of nome, codigo_sienge on public.obras
  for each row execute function public.trg_obras_nome_sem_duplicar();

-- ---------------------------------------------------------------------
-- importar_obras_sienge(arquivo, linhas)
-- Cada linha: { acao: 'cadastrar' | 'vincular' | 'atualizar', codigo, nome,
--               cliente, situacao, dados (objeto), ativa (cadastrar), obra_id (vincular) }
-- ---------------------------------------------------------------------
create or replace function public.importar_obras_sienge(p_arquivo text, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e jsonb; v_acao text; v_cod text; v_nome text; v_cli text; v_sit text; v_dados jsonb;
  v_id uuid; v_ok boolean; v_motivo text; v_res jsonb := '[]'::jsonb;
  n_cad int := 0; n_vin int := 0; n_atu int := 0; n_fal int := 0;
begin
  perform public.fn_exigir_perfil(array['admin']);
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then raise exception 'Nada para importar.'; end if;
  if jsonb_array_length(p_linhas) > 3000 then raise exception 'O arquivo tem mais de 3000 obras.'; end if;
  perform public.fn_set_justificativa('Importação de obras do Sienge — arquivo ' || left(coalesce(p_arquivo, '?'), 150));

  for e in select * from jsonb_array_elements(p_linhas) loop
    v_acao  := e->>'acao';
    v_cod   := trim(coalesce(e->>'codigo', ''));
    v_nome  := regexp_replace(trim(coalesce(e->>'nome', '')), '\s+', ' ', 'g');
    v_cli   := nullif(left(trim(coalesce(e->>'cliente', '')), 200), '');
    v_sit   := nullif(left(trim(coalesce(e->>'situacao', '')), 100), '');
    v_dados := case when jsonb_typeof(e->'dados') = 'object' then jsonb_strip_nulls(e->'dados') else '{}'::jsonb end;
    v_ok := false; v_motivo := null; v_id := null;

    begin
      if v_cod !~ '^[0-9]{1,10}$' then
        v_motivo := 'Código do Sienge inválido.';
      elsif length(v_dados::text) > 4000 then
        v_motivo := 'Informações extras grandes demais.';
      elsif v_acao = 'cadastrar' then
        if length(v_nome) not between 2 and 200 then
          v_motivo := 'Nome da obra inválido.';
        elsif exists (select 1 from public.obras where codigo_sienge = v_cod) then
          v_motivo := 'Já estava cadastrada com este código (talvez por outra importação ao mesmo tempo).';
        elsif exists (select 1 from public.obras where codigo_sienge is null and lower(trim(nome)) = lower(v_nome)) then
          v_motivo := 'Existe obra cadastrada à mão com este nome: vincule o código a ela.';
        else
          insert into public.obras (nome, codigo_sienge, cliente, situacao_sienge, dados_sienge, origem, ativa)
          values (v_nome, v_cod, v_cli, v_sit, v_dados, 'sienge', coalesce((e->>'ativa')::boolean, true))
          on conflict (codigo_sienge) where codigo_sienge is not null do nothing
          returning id into v_id;
          if v_id is null then v_motivo := 'Já estava cadastrada com este código.';
          else v_ok := true; n_cad := n_cad + 1; end if;
        end if;
      elsif v_acao = 'vincular' then
        update public.obras
           set codigo_sienge = v_cod,
               cliente = coalesce(v_cli, cliente),
               situacao_sienge = coalesce(v_sit, situacao_sienge),
               dados_sienge = dados_sienge || v_dados
         where id = (e->>'obra_id')::uuid and codigo_sienge is null
        returning id into v_id;
        if v_id is null then v_motivo := 'A obra não existe mais ou já recebeu um código.';
        else v_ok := true; n_vin := n_vin + 1; end if;
      elsif v_acao = 'atualizar' then
        update public.obras
           set cliente = coalesce(v_cli, cliente),
               situacao_sienge = coalesce(v_sit, situacao_sienge),
               dados_sienge = dados_sienge || v_dados
         where codigo_sienge = v_cod
           and (cliente is distinct from coalesce(v_cli, cliente)
             or situacao_sienge is distinct from coalesce(v_sit, situacao_sienge)
             or dados_sienge is distinct from dados_sienge || v_dados)
        returning id into v_id;
        if v_id is null then
          if exists (select 1 from public.obras where codigo_sienge = v_cod) then v_motivo := 'Sem diferenças.';
          else v_motivo := 'Obra com este código não encontrada.'; end if;
        else v_ok := true; n_atu := n_atu + 1; end if;
      else
        v_motivo := 'Ação inválida.';
      end if;
    exception
      when unique_violation then v_motivo := 'Conflito com outra obra: ' || sqlerrm;
      when invalid_text_representation then v_motivo := 'Dados inválidos na linha.';
    end;

    if not v_ok then n_fal := n_fal + 1; end if;
    v_res := v_res || jsonb_build_object('codigo', v_cod, 'nome', v_nome, 'acao', v_acao, 'ok', v_ok, 'motivo', v_motivo);
  end loop;

  perform public.svc_auditar(auth.uid(), 'importacao_obras_sienge', 'obras', null,
    'Arquivo ' || left(coalesce(p_arquivo, '?'), 150),
    jsonb_build_object('cadastradas', n_cad, 'vinculadas', n_vin, 'atualizadas', n_atu, 'nao_aplicadas', n_fal));

  return jsonb_build_object('cadastradas', n_cad, 'vinculadas', n_vin, 'atualizadas', n_atu,
                            'nao_aplicadas', n_fal, 'resultados', v_res);
end $$;

revoke all on function public.importar_obras_sienge(text, jsonb) from public, anon;
grant execute on function public.importar_obras_sienge(text, jsonb) to authenticated;
