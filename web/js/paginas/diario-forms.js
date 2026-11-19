// Formulários do Diário de Bordo — todos funcionam SEM INTERNET (fila de sincronização).
import { estado, caminhaoAtual, lerCache, gravarCache } from '../api.js';
import { esc, janela, opcoes, aviso, fmtDataHora, fmtNum } from '../ui.js';
import { CHECKLISTS, RESULTADOS, ehCritico, lerChecklist, faltando } from '../lib/checklists.js';
import { diferencaMateriais } from '../lib/regras.js';
import { novoId } from '../lib/fila.js';
import { registrar, registrarFotos } from '../sync.js';

const agoraISO = () => new Date().toISOString();
const paraLocalInput = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const deLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const num = (v) => (v === '' || v === undefined || v === null ? null : Number(String(v).replace(',', '.')));

const chaveExp = () => `expediente-aberto-${estado.usuario.id}`;
export const expedienteAberto = () => lerCache(chaveExp());
export const guardarExpedienteAberto = (e) => gravarCache(chaveExp(), e);
const aviseOffline = (msg) => aviso(navigator.onLine ? msg : `${msg} Sem conexão: ficou guardado no aparelho e será enviado automaticamente.`, navigator.onLine ? 'sucesso' : 'info', 7000);

export function htmlChecklist(tipo) {
  return `<fieldset class="cartao"><legend><b>${esc(CHECKLISTS[tipo].titulo)}</b></legend>
    ${CHECKLISTS[tipo].itens.map((item, i) => `<div class="checklist-item">
      <b>${esc(item)}${ehCritico(item) ? ' <small class="txt-erro">(item crítico)</small>' : ''}</b>
      <div class="opcoes-chk" role="radiogroup" aria-label="${esc(item)}">
        ${Object.entries(RESULTADOS).map(([v, t]) => `<label class="${v === 'irregular' ? 'irr' : ''}"><input type="radio" name="${tipo}_r${i}" value="${v}"> ${t}</label>`).join('')}
      </div>
      <div class="obs-item linha-campos">
        <input name="${tipo}_o${i}" placeholder="Observação (opcional)" maxlength="300" aria-label="Observação ${esc(item)}">
        ${ehCritico(item) ? '' : `<label class="check"><input type="checkbox" name="${tipo}_c${i}"> Irregularidade crítica</label>`}
      </div></div>`).join('')}
  </fieldset>`;
}

const campoFotos = (name = 'fotos', rot = 'Fotos') => `<label class="campo"><span>${rot}</span>
  <input type="file" name="${name}" accept="image/*" capture="environment" multiple><small>Opcional. As fotos são reduzidas antes do envio.</small></label>`;

// ---------------------------------------------------------------------
export async function iniciarExpediente(aoConcluir) {
  const cam = caminhaoAtual();
  if (!cam) return aviso('Nenhum caminhão cadastrado.', 'erro');
  if (expedienteAberto()) return aviso('Já existe um expediente aberto. Encerre-o antes de iniciar outro.', 'erro');
  const r = await janela({
    titulo: 'Iniciar expediente', largura: 'larga',
    corpo: `<form>
      <p>Motorista: <b>${esc(estado.perfil.nome_completo)}</b> · Caminhão: <b>${esc(cam.nome)} (${esc(cam.placa)})</b> · Data e hora registradas automaticamente.</p>
      <label class="campo"><span>KM inicial <b class="obr">*</b></span><input name="km_inicial" inputmode="decimal" required value="${cam.km_atual || ''}">
        <small>Último KM registrado: ${fmtNum(cam.km_atual)} km</small></label>
      ${htmlChecklist('abertura')}
      <label class="check"><input type="checkbox" name="com_munck" id="com-munck"> Fazer também o checklist específico do Munck</label>
      <div id="bloco-munck" hidden>${htmlChecklist('munck')}</div>
      <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2"></textarea></label>
      ${campoFotos()}
    </form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Iniciar expediente', valor: 'ok' }],
    aoAbrir: (j) => { j.querySelector('#com-munck').onchange = (e) => { j.querySelector('#bloco-munck').hidden = !e.target.checked; }; },
    validar: (d) => {
      const km = num(d.km_inicial);
      if (km === null || Number.isNaN(km) || km < 0) return 'Informe o KM inicial.';
      if (km < Number(cam.km_atual || 0)) return `O KM inicial não pode ser menor que o último registrado (${fmtNum(cam.km_atual)}).`;
      const f = faltando(lerChecklist('abertura', d));
      if (f.length) return 'Responda todos os itens do checklist: ' + f.join(', ');
      if (d.com_munck) { const fm = faltando(lerChecklist('munck', d)); if (fm.length) return 'Responda os itens do checklist do Munck: ' + fm.join(', '); }
      return null;
    },
  });
  if (!r) return;
  const d = r.dados;
  const exp = { id: novoId(), caminhao_id: cam.id, motorista_id: estado.usuario.id, inicio_em: agoraISO(), km_inicial: num(d.km_inicial),
    observacoes: d.observacoes || null, registrado_offline: !navigator.onLine };
  guardarExpedienteAberto(exp);
  await registrar({ tipo: 'insert', tabela: 'expedientes', dados: exp, rotulo: 'Início do expediente' });
  const tipos = ['abertura', ...(d.com_munck ? ['munck'] : [])];
  for (const t of tipos) {
    const itens = lerChecklist(t, d);
    const chk = { id: novoId(), expediente_id: exp.id, caminhao_id: cam.id, motorista_id: estado.usuario.id, tipo: t, itens, registrado_em: agoraISO() };
    await registrar({ tipo: 'insert', tabela: 'checklists', dados: chk, rotulo: CHECKLISTS[t].titulo });
    if (t === 'abertura') await registrarFotos('checklist', chk.id, d.fotos);
    if (itens.some((x) => x.critico)) aviso('Irregularidade CRÍTICA registrada: o administrador será alertado. Não opere o caminhão sem liberação.', 'erro', 10000);
  }
  cam.km_atual = Math.max(Number(cam.km_atual || 0), exp.km_inicial);
  aviseOffline('Expediente iniciado.');
  aoConcluir?.();
}

export async function encerrarExpediente(aoConcluir, obras = []) {
  const exp = expedienteAberto();
  if (!exp) return aviso('Nenhum expediente aberto.', 'erro');
  const r = await janela({
    titulo: 'Encerrar expediente', largura: 'larga',
    corpo: `<form>
      <p>Iniciado em <b>${fmtDataHora(exp.inicio_em)}</b> com KM <b>${fmtNum(exp.km_inicial)}</b>.</p>
      <label class="campo"><span>KM final <b class="obr">*</b></span><input name="km_final" inputmode="decimal" required></label>
      ${htmlChecklist('encerramento')}
      <label class="campo"><span>Condições gerais do caminhão <b class="obr">*</b></span><textarea name="condicoes_gerais" rows="2" required></textarea></label>
      <div class="linha-campos">
        <label class="campo"><span>Onde o caminhão ficou <b class="obr">*</b></span><select name="local_estacionamento" required id="local">
          ${opcoes([['estacionamento_masters', 'Estacionamento Masters'], ['obra', 'Obra cadastrada'], ['outro', 'Outro local']], 'estacionamento_masters')}</select></label>
        <label class="campo" id="c-obra" hidden><span>Obra</span><select name="local_obra_id">${opcoes(obras.map((o) => [o.id, o.nome]), '', 'Selecione')}</select></label>
        <label class="campo" id="c-outro" hidden><span>Qual local?</span><input name="local_outro" maxlength="200"></label>
      </div>
      <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2"></textarea></label>
      ${campoFotos()}
    </form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Encerrar expediente', valor: 'ok' }],
    aoAbrir: (j) => {
      const s = j.querySelector('#local');
      s.onchange = () => { j.querySelector('#c-obra').hidden = s.value !== 'obra'; j.querySelector('#c-outro').hidden = s.value !== 'outro'; };
    },
    validar: (d) => {
      const km = num(d.km_final);
      if (km === null || Number.isNaN(km)) return 'Informe o KM final.';
      if (km < exp.km_inicial) return `O KM final não pode ser menor que o inicial (${fmtNum(exp.km_inicial)}).`;
      const f = faltando(lerChecklist('encerramento', d));
      if (f.length) return 'Responda todos os itens do checklist: ' + f.join(', ');
      if (d.local_estacionamento === 'obra' && !d.local_obra_id) return 'Selecione a obra onde o caminhão ficou.';
      if (d.local_estacionamento === 'outro' && !d.local_outro) return 'Informe o local onde o caminhão ficou.';
      return null;
    },
  });
  if (!r) return;
  const d = r.dados;
  await registrar({
    tipo: 'update', tabela: 'expedientes', chave: exp.id, rotulo: 'Encerramento do expediente',
    dados: { fim_em: agoraISO(), km_final: num(d.km_final), condicoes_gerais: d.condicoes_gerais, local_estacionamento: d.local_estacionamento,
      local_obra_id: d.local_estacionamento === 'obra' ? d.local_obra_id : null, local_outro: d.local_estacionamento === 'outro' ? d.local_outro : null,
      observacoes: [exp.observacoes, d.observacoes].filter(Boolean).join('\n') || null },
  });
  const chk = { id: novoId(), expediente_id: exp.id, caminhao_id: exp.caminhao_id, motorista_id: estado.usuario.id, tipo: 'encerramento',
    itens: lerChecklist('encerramento', d), registrado_em: agoraISO() };
  await registrar({ tipo: 'insert', tabela: 'checklists', dados: chk, rotulo: 'Checklist de encerramento' });
  await registrarFotos('expediente', exp.id, d.fotos);
  guardarExpedienteAberto(null);
  const cam = caminhaoAtual(); if (cam) cam.km_atual = Math.max(Number(cam.km_atual || 0), num(d.km_final));
  aviseOffline('Expediente encerrado.');
  aoConcluir?.();
}

// ---------------------------------------------------------------------
function linhaMaterial(i, m = {}) {
  return `<div class="material-linha" data-mat="${i}">
    <label class="campo"><span>Material</span><input name="m_mat_${i}" value="${esc(m.material || '')}" maxlength="200"></label>
    <label class="campo"><span>Unidade</span><input name="m_un_${i}" value="${esc(m.unidade || '')}" placeholder="un, kg, m³..." maxlength="20"></label>
    <label class="campo"><span>Qtd prevista</span><input name="m_prev_${i}" inputmode="decimal"></label>
    <label class="campo"><span>Qtd entregue</span><input name="m_ent_${i}" inputmode="decimal"></label>
    <button type="button" class="btn btn-sm btn-sec" data-remover-mat="${i}" aria-label="Remover material">×</button>
    <label class="campo diverg" hidden><span class="txt-erro">Divergência: <b data-dif></b> — explique</span><input name="m_obs_${i}" maxlength="300"></label>
  </div>`;
}

/** Registro de atendimento/atividade. Se `solicitacao` vier, também finaliza o atendimento. */
export async function registrarAtendimento({ solicitacao = null, obras = [], finalizar = false, aoConcluir } = {}) {
  const cam = caminhaoAtual();
  const exp = expedienteAberto();
  const obrig = Boolean(estado.config?.materiais_obrigatorios);
  let n = 1;
  let materiais = [];
  const r = await janela({
    titulo: finalizar ? `Finalizar atendimento — ${solicitacao?.obra_nome || ''}` : 'Registrar atendimento / atividade', largura: 'larga',
    corpo: `<form>
      ${solicitacao ? `<div class="alerta alerta-info">Solicitação nº ${esc(solicitacao.numero)} · ${esc(solicitacao.categoria)} — ${esc(solicitacao.descricao)}</div>` : ''}
      <div class="linha-campos">
        <label class="campo"><span>Obra <b class="obr">*</b></span><select name="obra_id" required>${opcoes(obras.map((o) => [o.id, o.nome]), solicitacao?.obra_id, 'Selecione')}</select></label>
        <label class="campo"><span>Serviço realizado <b class="obr">*</b></span><input name="servico" required maxlength="300" value="${esc(solicitacao?.categoria || '')}"></label>
      </div>
      <div class="linha-campos">
        <label class="campo"><span>Início <b class="obr">*</b></span><input type="datetime-local" name="inicio_em" required value="${paraLocalInput(solicitacao?.execucao_inicio ? new Date(solicitacao.execucao_inicio) : new Date(Date.now() - 3600000))}"></label>
        <label class="campo"><span>Fim <b class="obr">*</b></span><input type="datetime-local" name="fim_em" required value="${paraLocalInput()}"></label>
        <label class="campo"><span>KM inicial</span><input name="km_inicial" inputmode="decimal" value="${cam?.km_atual || ''}"></label>
        <label class="campo"><span>KM final</span><input name="km_final" inputmode="decimal"><small id="dist"></small></label>
      </div>
      <fieldset class="cartao"><legend><b>Materiais transportados</b>${obrig ? ' <b class="obr">* obrigatório</b>' : ' (opcional)'}</legend>
        <div id="materiais">${linhaMaterial(0)}</div>
        <button type="button" class="btn btn-sm btn-sec" id="add-mat">+ Adicionar material</button>
      </fieldset>
      <div class="linha-campos">
        <label class="campo"><span>Recebedor (nome)</span><input name="recebedor_nome" maxlength="120"></label>
        <label class="campo"><span>Cargo/função</span><input name="recebedor_cargo" maxlength="80"></label>
      </div>
      <label class="check"><input type="checkbox" name="recebimento_confirmado"> Recebimento confirmado pelo recebedor</label>
      <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2"></textarea></label>
      ${campoFotos('fotos', 'Fotos como evidência')}
    </form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: finalizar ? 'Finalizar atendimento' : 'Salvar registro', valor: 'ok' }],
    aoAbrir: (j) => {
      const cont = j.querySelector('#materiais');
      j.querySelector('#add-mat').onclick = () => cont.insertAdjacentHTML('beforeend', linhaMaterial(n++));
      j.addEventListener('click', (e) => { const b = e.target.closest('[data-remover-mat]'); if (b) b.closest('.material-linha').remove(); });
      j.addEventListener('input', (e) => {
        const linha = e.target.closest('.material-linha');
        if (linha) {
          const i = linha.dataset.mat;
          const dif = diferencaMateriais(j.querySelector(`[name=m_prev_${i}]`).value.replace(',', '.'), j.querySelector(`[name=m_ent_${i}]`).value.replace(',', '.'));
          const box = linha.querySelector('.diverg');
          box.hidden = !dif; if (dif) box.querySelector('[data-dif]').textContent = (dif > 0 ? '+' : '') + fmtNum(dif, 3);
        }
        if (/km_/.test(e.target.name)) {
          const a = num(j.querySelector('[name=km_inicial]').value), b = num(j.querySelector('[name=km_final]').value);
          j.querySelector('#dist').textContent = a !== null && b !== null && b >= a ? `Distância: ${fmtNum(b - a)} km` : '';
        }
      });
    },
    validar: (d, form) => {
      if (!d.obra_id || !d.servico) return 'Informe a obra e o serviço realizado.';
      if (new Date(d.fim_em) < new Date(d.inicio_em)) return 'O horário de fim deve ser depois do início.';
      if (new Date(d.fim_em) > new Date(Date.now() + 5 * 60000)) return 'O horário de fim não pode estar no futuro.';
      const a = num(d.km_inicial), b = num(d.km_final);
      if (a !== null && b !== null && b < a) return 'O KM final não pode ser menor que o inicial.';
      const mats = lerMateriais(form);
      materiais = mats;
      if (obrig && !mats.length) return 'Informe pelo menos um material transportado (exigido pela configuração).';
      if (mats.some((m) => !m.unidade)) return 'Informe a unidade de medida de cada material.';
      return null;
    },
  });
  if (!r) return;
  const d = r.dados;
  const atd = {
    id: novoId(), expediente_id: exp?.id || null, solicitacao_id: solicitacao?.id || null, caminhao_id: cam.id,
    motorista_id: estado.usuario.id, obra_id: d.obra_id, servico: d.servico, inicio_em: deLocalInput(d.inicio_em), fim_em: deLocalInput(d.fim_em),
    km_inicial: num(d.km_inicial), km_final: num(d.km_final), recebedor_nome: d.recebedor_nome || null, recebedor_cargo: d.recebedor_cargo || null,
    recebimento_confirmado: Boolean(d.recebimento_confirmado), observacoes: d.observacoes || null, registrado_offline: !navigator.onLine,
  };
  await registrar({ tipo: 'insert', tabela: 'atendimentos', dados: atd, rotulo: 'Atendimento' });
  for (const m of materiais) await registrar({ tipo: 'insert', tabela: 'atendimento_materiais', dados: { id: novoId(), atendimento_id: atd.id, ...m }, rotulo: 'Material' });
  await registrarFotos('atendimento', atd.id, d.fotos);
  if (finalizar && solicitacao) {
    await registrar({ tipo: 'rpc', funcao: 'finalizar_atendimento', rotulo: `Finalização nº ${solicitacao.numero}`,
      args: { p_id: solicitacao.id, p_momento: atd.fim_em, p_observacao: d.observacoes || null, p_offline: !navigator.onLine } });
  }
  if (atd.km_final) { const c = caminhaoAtual(); if (c) c.km_atual = Math.max(Number(c.km_atual || 0), atd.km_final); }
  aviseOffline(finalizar ? 'Atendimento finalizado. O administrador vai validar a liberação do período.' : 'Atendimento registrado.');
  aoConcluir?.();
}

function lerMateriais(form) {
  return [...form.querySelectorAll('.material-linha')].map((l) => {
    const i = l.dataset.mat, v = (n) => form.querySelector(`[name=${n}_${i}]`)?.value.trim();
    return { material: v('m_mat'), unidade: v('m_un'), qtd_prevista: num(v('m_prev')), qtd_entregue: num(v('m_ent')), obs_divergencia: v('m_obs') || null };
  }).filter((m) => m.material);
}

// ---------------------------------------------------------------------
export async function registrarAbastecimento(aoConcluir) {
  const cam = caminhaoAtual();
  const r = await janela({
    titulo: 'Registrar abastecimento',
    corpo: `<form><div class="linha-campos">
      <label class="campo"><span>Data e hora <b class="obr">*</b></span><input type="datetime-local" name="data_hora" required value="${paraLocalInput()}"></label>
      <label class="campo"><span>KM <b class="obr">*</b></span><input name="km" inputmode="decimal" required value="${cam?.km_atual || ''}"></label>
      <label class="campo"><span>Litros <b class="obr">*</b></span><input name="litros" inputmode="decimal" required></label>
      <label class="campo"><span>Valor total (R$) <b class="obr">*</b></span><input name="valor" inputmode="decimal" required></label></div>
      <label class="campo"><span>Posto</span><input name="posto" maxlength="120"></label>
      ${campoFotos('fotos', 'Foto do comprovante')}
      <p class="muted"><small>O valor entra como despesa e aguarda aprovação do administrador.</small></p></form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
    validar: (d) => {
      if (!(num(d.litros) > 0)) return 'Informe os litros.';
      if (!(num(d.valor) >= 0)) return 'Informe o valor.';
      if (num(d.km) < Number(cam?.km_atual || 0) - 1) return `KM menor que o último registrado (${fmtNum(cam.km_atual)}). Confira.`;
      return null;
    },
  });
  if (!r) return;
  const d = r.dados;
  const ab = { id: novoId(), caminhao_id: cam.id, expediente_id: expedienteAberto()?.id || null, motorista_id: estado.usuario.id,
    data_hora: deLocalInput(d.data_hora), km: num(d.km), litros: num(d.litros), valor: num(d.valor), posto: d.posto || null, registrado_offline: !navigator.onLine };
  await registrar({ tipo: 'insert', tabela: 'abastecimentos', dados: ab, rotulo: 'Abastecimento' });
  await registrarFotos('abastecimento', ab.id, d.fotos);
  aviseOffline('Abastecimento registrado.');
  aoConcluir?.();
}

export async function registrarOcorrencia(aoConcluir) {
  const cam = caminhaoAtual();
  const r = await janela({
    titulo: 'Registrar ocorrência',
    corpo: `<form>
      <label class="campo"><span>Tipo <b class="obr">*</b></span><select name="tipo" required>${opcoes([['avaria', 'Avaria'], ['acidente', 'Acidente/incidente'],
        ['problema_transporte', 'Problema de transporte'], ['dano_material', 'Dano material'], ['impedimento_acesso', 'Impedimento de acesso'], ['outro', 'Outro acontecimento']], '', 'Selecione')}</select></label>
      <div class="linha-campos">
        <label class="campo"><span>Data e hora <b class="obr">*</b></span><input type="datetime-local" name="data_hora" required value="${paraLocalInput()}"></label>
        <label class="campo"><span>Local</span><input name="local" maxlength="200"></label></div>
      <label class="campo"><span>Descrição <b class="obr">*</b></span><textarea name="descricao" rows="4" required minlength="3"></textarea></label>
      ${campoFotos()}
      <p class="muted"><small>O administrador é notificado imediatamente e acompanha a resolução.</small></p></form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Registrar ocorrência', valor: 'ok', classe: 'btn-dest' }],
    validar: (d) => (!d.tipo ? 'Selecione o tipo.' : (d.descricao || '').length < 3 ? 'Descreva a ocorrência.' : null),
  });
  if (!r) return;
  const d = r.dados;
  const oc = { id: novoId(), caminhao_id: cam.id, expediente_id: expedienteAberto()?.id || null, motorista_id: estado.usuario.id,
    tipo: d.tipo, descricao: d.descricao, data_hora: deLocalInput(d.data_hora), local: d.local || null, registrado_offline: !navigator.onLine };
  await registrar({ tipo: 'insert', tabela: 'ocorrencias', dados: oc, rotulo: 'Ocorrência' });
  await registrarFotos('ocorrencia', oc.id, d.fotos);
  aviseOffline('Ocorrência registrada. O administrador será notificado.');
  aoConcluir?.();
}

export async function registrarDespesa(aoConcluir) {
  const cam = caminhaoAtual();
  const r = await janela({
    titulo: 'Despesa emergencial',
    corpo: `<form>
      <div class="alerta alerta-info">Use somente para gastos emergenciais. A despesa <b>aguarda aprovação</b> do administrador antes de entrar no total oficial.</div>
      <label class="campo"><span>Tipo <b class="obr">*</b></span><select name="categoria" required>${opcoes([['emergencial', 'Emergencial'], ['borracharia', 'Borracharia'], ['pneus', 'Pneus'], ['lavagem', 'Lavagem'], ['outros', 'Outros']], 'emergencial')}</select></label>
      <label class="campo"><span>Descrição <b class="obr">*</b></span><input name="descricao" required maxlength="300"></label>
      <div class="linha-campos">
        <label class="campo"><span>Valor (R$) <b class="obr">*</b></span><input name="valor" inputmode="decimal" required></label>
        <label class="campo"><span>Data <b class="obr">*</b></span><input type="date" name="data" required value="${paraLocalInput().slice(0, 10)}"></label>
        <label class="campo"><span>Fornecedor</span><input name="fornecedor" maxlength="120"></label></div>
      ${campoFotos('fotos', 'Foto do comprovante')}</form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Enviar para aprovação', valor: 'ok' }],
    validar: (d) => (!(num(d.valor) > 0) ? 'Informe o valor.' : !d.descricao ? 'Descreva a despesa.' : null),
  });
  if (!r) return;
  const d = r.dados;
  const de = { id: novoId(), caminhao_id: cam.id, categoria: d.categoria, descricao: d.descricao, valor: num(d.valor), data: d.data,
    fornecedor: d.fornecedor || null, status: 'pendente', origem: 'motorista', lancado_por: estado.usuario.id, km: cam.km_atual || null };
  await registrar({ tipo: 'insert', tabela: 'despesas', dados: de, rotulo: 'Despesa emergencial' });
  await registrarFotos('despesa', de.id, d.fotos);
  aviseOffline('Despesa enviada para aprovação.');
  aoConcluir?.();
}
