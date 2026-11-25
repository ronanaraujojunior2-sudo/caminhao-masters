// RELATÓRIO OPERACIONAL — consolidação pura (sem valores financeiros).
// Testada em tests/unit/relatorios.test.mjs
export function consolidar({ sols, atds, exps, abs, ativ, ocs }) {
  const kmRodados = exps.reduce((s, e) => s + (e.km_final != null ? Math.max(0, Number(e.km_final) - Number(e.km_inicial)) : 0), 0);
  const litros = abs.reduce((s, a) => s + Number(a.litros || 0), 0);
  const conc = atds.filter((a) => a.fim_em);
  const porObra = {};
  const obra = (id, nome) => (porObra[id] ??= { nome: nome || '—', solicitacoes: 0, aprovadas: 0, recusadas: 0, atendimentos: 0, km: 0 });
  sols.forEach((s) => { const o = obra(s.obra_id, s.obras?.nome); o.solicitacoes++;
    if (['aprovada', 'concluida'].includes(s.status)) o.aprovadas++; if (['recusada', 'cancelada'].includes(s.status)) o.recusadas++; });
  conc.forEach((a) => { const o = obra(a.obra_id, a.obras?.nome); o.atendimentos++; o.km += Number(a.distancia_km || 0); });
  const porMes = {};
  const mes = (iso) => (porMes[iso.slice(0, 7)] ??= { atendimentos: 0, km: 0, litros: 0, servicos: 0, ocorrencias: 0 });
  conc.forEach((a) => { mes(a.inicio_em).atendimentos++; });
  exps.forEach((e) => { if (e.km_final != null) mes(e.inicio_em).km += Math.max(0, Number(e.km_final) - Number(e.km_inicial)); });
  abs.forEach((a) => { mes(a.data_hora).litros += Number(a.litros || 0); });
  ativ.filter((a) => a.status === 'concluida').forEach((a) => { mes(a.data).servicos++; });
  ocs.forEach((o) => { mes(o.data_hora).ocorrencias++; });
  const servicos = {};
  ativ.filter((a) => a.status === 'concluida').forEach((a) => { servicos[a.tipo] = (servicos[a.tipo] || 0) + 1; });
  return {
    solicitacoes: sols.length,
    aprovadas: sols.filter((s) => ['aprovada', 'concluida'].includes(s.status)).length,
    recusadas: sols.filter((s) => ['recusada', 'cancelada'].includes(s.status)).length,
    atendimentos: conc.length, kmRodados, litros,
    consumo: litros > 0 && kmRodados > 0 ? kmRodados / litros : null,
    servicosConcluidos: ativ.filter((a) => a.status === 'concluida').length,
    programados: ativ.filter((a) => a.status === 'programada').length,
    ocorrencias: ocs.length, ocorrenciasAbertas: ocs.filter((o) => o.status !== 'resolvida').length,
    porObra: Object.values(porObra).sort((a, b) => b.solicitacoes + b.atendimentos - (a.solicitacoes + a.atendimentos)),
    porMes: Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ mes: m, ...v })),
    servicos,
  };
}

