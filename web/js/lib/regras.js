// =====================================================================
// Regras da agenda (espelho das regras do banco, para orientar a tela).
// A decisão final é SEMPRE do banco de dados; aqui só evitamos que o
// usuário preencha algo que será recusado.  Módulo puro: testado em Node.
// =====================================================================

export const PERIODOS = {
  manha: { rotulo: 'Manhã', horario: '07h às 12h', inicio: 7, fim: 12 },
  tarde: { rotulo: 'Tarde', horario: '13h às 17h', inicio: 13, fim: 17 },
};

export const SITUACOES = {
  disponivel:     { rotulo: 'Disponível', classe: 'sit-disponivel' },
  reservado:      { rotulo: 'Reservado (aguardando aprovação)', classe: 'sit-reservado' },
  agendado:       { rotulo: 'Agendado', classe: 'sit-agendado' },
  em_atendimento: { rotulo: 'Em atendimento', classe: 'sit-atendimento' },
  finalizado:     { rotulo: 'Finalizado (aguardando validação)', classe: 'sit-finalizado' },
  concluido:      { rotulo: 'Concluído', classe: 'sit-concluido' },
  manutencao:     { rotulo: 'Em manutenção', classe: 'sit-manutencao' },
  bloqueado:      { rotulo: 'Bloqueado', classe: 'sit-bloqueado' },
};

export const STATUS_SOLICITACAO = {
  pendente: 'Pendente',
  esclarecimento: 'Aguardando esclarecimentos',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
};

export const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

// ---------- datas (sempre em "data local" AAAA-MM-DD) ----------
export function paraISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function deISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function somarDias(iso, n) {
  const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d);
}
export function diaSemana(iso) { return deISO(iso).getDay(); }          // 0 dom ... 6 sáb
export function ehDiaUtil(iso) { const w = diaSemana(iso); return w >= 1 && w <= 5; }

export function proximoDiaUtil(iso) {
  let d = somarDias(iso, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}

export function segundaDaSemana(iso) {
  const w = diaSemana(iso);                         // dom=0
  return somarDias(iso, w === 0 ? -6 : 1 - w);
}

export function diasUteisDaSemana(iso) {
  const seg = segundaDaSemana(iso);
  return [0, 1, 2, 3, 4].map((i) => somarDias(seg, i));
}

/** Semanas (seg–sex) que cobrem o mês de `iso`. Dias fora do mês vêm com foraDoMes=true. */
export function semanasDoMes(iso) {
  const d = deISO(iso);
  const primeiro = paraISO(new Date(d.getFullYear(), d.getMonth(), 1));
  const ultimo = paraISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const mes = d.getMonth();
  const semanas = [];
  let seg = segundaDaSemana(primeiro);
  while (seg <= ultimo) {
    const dias = [0, 1, 2, 3, 4].map((i) => {
      const dia = somarDias(seg, i);
      return { data: dia, foraDoMes: deISO(dia).getMonth() !== mes };
    });
    if (dias.some((x) => !x.foraDoMes)) semanas.push(dias);
    seg = somarDias(seg, 7);
  }
  return semanas;
}

/**
 * Converte "data + hora local da empresa" em instante absoluto (ms).
 * offsetMinutos: diferença do fuso da empresa para UTC (Manaus = -240).
 */
export function inicioPeriodoMs(iso, periodo, offsetMinutos = -240) {
  const [y, m, d] = iso.split('-').map(Number);
  const hora = PERIODOS[periodo]?.inicio ?? 7;
  return Date.UTC(y, m - 1, d, hora, 0, 0) - offsetMinutos * 60000;
}

export function hojeNoFuso(agoraMs, offsetMinutos = -240) {
  const d = new Date(agoraMs + offsetMinutos * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function horasAntecedencia(config) {
  switch (config?.antecedencia_modo) {
    case '24h': return 24;
    case '48h': return 48;
    case 'personalizado': return Number(config.antecedencia_horas) || 0;
    default: return null; // próximo dia útil
  }
}

export function descreverAntecedencia(config) {
  const h = horasAntecedencia(config);
  return h === null ? 'a partir do próximo dia útil' : `com pelo menos ${h} horas de antecedência`;
}

/**
 * Verifica se um período pode ser solicitado. Retorna null se ok, ou a mensagem do motivo.
 * Mesma lógica de public.fn_validar_data_agendamento.
 */
export function validarAgendamento({ data, periodo, config, agoraMs = Date.now(), admin = false, offsetMinutos = -240 }) {
  if (!data || !PERIODOS[periodo]) return 'Informe a data e o período (manhã ou tarde).';
  if (!ehDiaUtil(data)) return 'O caminhão só pode ser agendado de segunda a sexta-feira.';
  const inicio = inicioPeriodoMs(data, periodo, offsetMinutos);
  if (inicio <= agoraMs) return 'Este período já começou ou já passou. Escolha uma data futura.';
  if (admin) return null;
  const h = horasAntecedencia(config);
  if (h === null) {
    if (data < proximoDiaUtil(hojeNoFuso(agoraMs, offsetMinutos))) {
      return 'Antecedência mínima: a solicitação deve ser para o próximo dia útil ou depois.';
    }
  } else if (inicio - agoraMs < h * 3600000) {
    return `Antecedência mínima de ${h} horas não respeitada para este período.`;
  }
  return null;
}

/** Primeira data que pode ser escolhida no formulário (para o atributo min). */
export function primeiraDataPermitida({ config, agoraMs = Date.now(), admin = false, offsetMinutos = -240 }) {
  let d = hojeNoFuso(agoraMs, offsetMinutos);
  for (let i = 0; i < 60; i++) {
    if (validarAgendamento({ data: d, periodo: 'tarde', config, agoraMs, admin, offsetMinutos }) === null) return d;
    d = somarDias(d, 1);
  }
  return d;
}

/** Monta a grade de uma semana: { 'AAAA-MM-DD': { manha: item|null, tarde: item|null } } */
export function montarGrade(dias, itens) {
  const g = {};
  for (const d of dias) g[d] = { manha: null, tarde: null };
  for (const it of itens) {
    if (g[it.data] && (it.periodo === 'manha' || it.periodo === 'tarde')) g[it.data][it.periodo] = it;
  }
  return g;
}

/** Filtros da agenda (obra, situação, categoria, período). */
export function filtrarItens(itens, f = {}) {
  return itens.filter((it) =>
    (!f.obra || it.obra_id === f.obra) &&
    (!f.situacao || it.situacao === f.situacao) &&
    (!f.categoria || it.categoria === f.categoria) &&
    (!f.periodo || it.periodo === f.periodo));
}

export function diferencaMateriais(prevista, entregue) {
  if (prevista === '' || prevista == null || entregue === '' || entregue == null) return null;
  const d = Number(entregue) - Number(prevista);
  return Math.round(d * 1000) / 1000;
}

export function situacaoDocumento(validadeISO, hojeISO, diasAlerta = 30) {
  if (!validadeISO) return { codigo: 'sem_validade', rotulo: 'Sem validade' };
  if (validadeISO < hojeISO) return { codigo: 'vencido', rotulo: 'Vencido' };
  const dias = Math.round((deISO(validadeISO) - deISO(hojeISO)) / 86400000);
  if (dias <= diasAlerta) return { codigo: 'a_vencer', rotulo: `Vence em ${dias} dia(s)` };
  return { codigo: 'valido', rotulo: 'Válido' };
}

export function validarSenha(s) {
  if (!s || s.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (s.length > 72) return 'A senha deve ter no máximo 72 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/[0-9]/.test(s)) return 'A senha deve conter letras e números.';
  return null;
}

export function validarUsuario(u) {
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u || '')
    ? null
    : 'Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaços e sem acentos).';
}
