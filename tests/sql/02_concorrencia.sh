#!/usr/bin/env bash
# Teste de concorrência REAL: duas conexões tentam reservar o MESMO período
# ao mesmo tempo. Exatamente uma deve conseguir.
set -uo pipefail
DB=$1
SOLIC=$(psql -d "$DB" -Atc "select id from teste.ids where nome='sol1'")
SOLIC2=$(psql -d "$DB" -Atc "select id from teste.ids where nome='sol2'")
psql -d "$DB" -qc "update public.perfis set primeiro_acesso_pendente=false, sessoes_invalidadas_em=now()-interval '1 hour' where usuario in ('sol1','sol2')"
DIA=$(psql -d "$DB" -Atc "select teste.dia(10)")
tentar() {
  psql -d "$DB" -At 2>&1 <<SQL
set request.jwt.claims = '{"sub":"$1","role":"authenticated","iat":$(date +%s)}';
set role authenticated;
begin;
select 'RESERVOU' from public.criar_solicitacao(teste.id('cam'), teste.id('obra'), '$DIA', 'tarde', teste.id('cat'), 'Concorrência', 'Teste simultâneo');
select pg_sleep(1.5);
commit;
SQL
}
tentar "$SOLIC" > /tmp/cm_a.txt & P1=$!
tentar "$SOLIC2" > /tmp/cm_b.txt & P2=$!
wait $P1 $P2
OK=$(cat /tmp/cm_a.txt /tmp/cm_b.txt | grep -c '^RESERVOU$' || true)
CONF=$(cat /tmp/cm_a.txt /tmp/cm_b.txt | grep -c 'CONFLITO DE AGENDA' || true)
TOTAL=$(psql -d "$DB" -Atc "select count(*) from public.solicitacoes where data='$DIA' and periodo='tarde' and status='pendente'")
if [ "$OK" = "1" ] && [ "$CONF" = "1" ] && [ "$TOTAL" = "1" ]; then
  echo "  ok - concorrência: 2 pedidos simultâneos -> 1 reservado, 1 recusado por conflito"
else
  echo "FALHOU: concorrência (reservou=$OK conflito=$CONF gravados=$TOTAL)"; cat /tmp/cm_a.txt /tmp/cm_b.txt; exit 1
fi

# Duas importações de obras do Sienge ao mesmo tempo com o MESMO código:
# só uma obra pode ser criada; a outra é informada como "já estava cadastrada".
ADM=$(psql -d "$DB" -Atc "select id from teste.ids where nome='admin'")
psql -d "$DB" -qc "update public.perfis set primeiro_acesso_pendente=false, sessoes_invalidadas_em=now()-interval '1 hour' where id='$ADM'"
importar() {
  psql -d "$DB" -At 2>&1 <<SQL
set request.jwt.claims = '{"sub":"$ADM","role":"authenticated","iat":$(date +%s)}';
set role authenticated;
begin;
select (public.importar_obras_sienge('$1', '[{"acao":"cadastrar","codigo":"7777","nome":"Obra Concorrente"}]'))->>'cadastradas';
select pg_sleep(1.5);
commit;
SQL
}
importar a.xlsx > /tmp/cm_c.txt & P1=$!
sleep 0.3
importar b.xlsx > /tmp/cm_d.txt & P2=$!
wait $P1 $P2
CAD=$(cat /tmp/cm_c.txt /tmp/cm_d.txt | grep -c '^1$' || true)
ZERO=$(cat /tmp/cm_c.txt /tmp/cm_d.txt | grep -c '^0$' || true)
OBRAS=$(psql -d "$DB" -Atc "select count(*) from public.obras where codigo_sienge='7777'")
if [ "$CAD" = "1" ] && [ "$ZERO" = "1" ] && [ "$OBRAS" = "1" ]; then
  echo "  ok - concorrência: 2 importações simultâneas da mesma obra -> 1 cadastrada, sem duplicar"
else
  echo "FALHOU: importação simultânea (cadastradas=$CAD recusadas=$ZERO obras=$OBRAS)"; cat /tmp/cm_c.txt /tmp/cm_d.txt; exit 1
fi
