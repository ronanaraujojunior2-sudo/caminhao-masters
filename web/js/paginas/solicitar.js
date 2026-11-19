// SOLICITAR O CAMINHÃO
import { sb, estado, q, ehAdmin, offsetFuso, msgErro } from '../api.js';
import { esc, opcoes, lerForm, ocupado, aviso, fmtData, nomeDia, vazio } from '../ui.js';
import * as R from '../lib/regras.js';
import { ativarBuscaObra } from '../busca-obra.js';
import { aoMudarAgenda } from '../sync.js';

export async function render(el, params) {
  if (!estado.caminhoes.length) { el.innerHTML = `<h1>Solicitar caminhão</h1>${vazio('Nenhum caminhão ativo cadastrado.')}`; return; }
  const off = offsetFuso();
  const admin = ehAdmin();
  const [obras, categorias] = await Promise.all([
    q(sb.from('obras').select('id, nome, codigo_sienge, cliente, endereco, responsavel_nome').eq('ativa', true).order('nome')),
    q(sb.from('categorias').select('id, nome').eq('ativa', true).order('ordem')),
  ]);
  if (!obras.length) { el.innerHTML = `<h1>Solicitar caminhão</h1>${vazio('Nenhuma obra ativa cadastrada. ' + (admin ? 'Cadastre em Cadastros > Obras.' : 'Procure o administrador.'))}`; return; }
  const minData = R.primeiraDataPermitida({ config: estado.config, admin, offsetMinutos: off });
  const dataInicial = params.data && params.data >= minData ? params.data : '';

  el.innerHTML = `
    <div class="cabecalho"><h1>Solicitar caminhão</h1><div class="acoes"><a class="btn btn-sec" href="#/agenda">Ver agenda</a></div></div>
    <div class="alerta alerta-info">Solicitações por <b>período completo</b>: Manhã (07h–12h) ou Tarde (13h–17h), de segunda a sexta-feira,
      ${esc(R.descreverAntecedencia(estado.config))}.${admin ? ' <b>Administrador:</b> você pode agendar com prazo menor (fica registrado na auditoria).' : ''}
      A solicitação reserva o período provisoriamente até a análise do administrador.</div>
    <form id="f" class="cartao" novalidate>
      <div class="linha-campos">
        <label class="campo"><span>Obra <b class="obr">*</b></span><select name="obra_id" required>${opcoes(obras.map((o) => [o.id, (o.codigo_sienge ? o.codigo_sienge + ' · ' : '') + o.nome]), params.obra, 'Selecione a obra')}</select></label>
        ${estado.caminhoes.length > 1 ? `<label class="campo"><span>Caminhão <b class="obr">*</b></span><select name="caminhao_id" required>${opcoes(estado.caminhoes.map((c) => [c.id, `${c.nome} · ${c.placa}`]), estado.caminhaoId)}</select></label>` : ''}
        <label class="campo"><span>Solicitante</span><input value="${esc(estado.perfil.nome_completo)}" disabled><small>Preenchido automaticamente pelo seu login.</small></label>
      </div>
      <div class="linha-campos">
        <label class="campo"><span>Data <b class="obr">*</b></span><input type="date" name="data" required min="${minData}" value="${dataInicial}"><small id="dia-semana"></small></label>
        <div class="campo"><span>Período <b class="obr">*</b></span><div class="opcoes-periodo" id="periodos"></div></div>
      </div>
      <label class="campo"><span>Categoria <b class="obr">*</b></span><select name="categoria_id" required>${opcoes(categorias.map((c) => [c.id, c.nome]), '', 'Selecione a categoria')}</select></label>
      <label class="campo"><span>Descrição da atividade <b class="obr">*</b></span><textarea name="descricao" rows="3" required maxlength="1000" placeholder="O que será transportado/movimentado, quantidades aproximadas, peso..."></textarea></label>
      <label class="campo"><span>Justificativa <b class="obr">*</b></span><textarea name="justificativa" rows="2" required maxlength="1000" placeholder="Por que o caminhão é necessário nesta data?"></textarea></label>
      <div class="linha-campos">
        <label class="campo"><span>Local específico dentro da obra</span><input name="local_especifico" maxlength="200" placeholder="Ex.: Bloco B, acesso pela rua lateral"></label>
        <label class="campo"><span>Observações</span><input name="observacoes" maxlength="500"></label>
      </div>
      <div id="erro" class="alerta alerta-erro" role="alert" hidden></div>
      <button class="btn btn-dest btn-grande" type="submit">Enviar solicitação</button>
    </form>`;

  const f = el.querySelector('#f');
  ativarBuscaObra(f.querySelector('[name=obra_id]'), obras);  // só obras ativas (consulta acima)
  const caixa = el.querySelector('#periodos');
  let ocupados = {};

  async function atualizarPeriodos() {
    const data = f.data.value;
    const cam = f.caminhao_id?.value || estado.caminhaoId;
    el.querySelector('#dia-semana').textContent = data ? `${nomeDia(data)}, ${fmtData(data)}` : '';
    ocupados = {};
    if (data) {
      const linhas = await q(sb.from('ocupacoes').select('periodo, origem').eq('caminhao_id', cam).eq('data', data)).catch(() => []);
      for (const l of linhas) ocupados[l.periodo] = l.origem;
    }
    const marcado = f.querySelector('input[name=periodo]:checked')?.value || params.periodo;
    caixa.innerHTML = ['manha', 'tarde'].map((p) => {
      const regra = data ? R.validarAgendamento({ data, periodo: p, config: estado.config, admin, offsetMinutos: off }) : 'Escolha a data.';
      const oc = ocupados[p];
      const motivo = oc ? (oc === 'solicitacao' ? 'Já reservado' : oc === 'bloqueio' ? 'Bloqueado' : 'Em manutenção') : regra;
      const ok = !motivo;
      return `<label class="opcao-periodo ${ok ? '' : 'indisponivel'}"><input type="radio" name="periodo" value="${p}" ${ok ? '' : 'disabled'} ${ok && marcado === p ? 'checked' : ''} required>
        <span><b>${R.PERIODOS[p].rotulo}</b><small>${R.PERIODOS[p].horario}</small><small>${ok ? 'Disponível' : esc(motivo)}</small></span></label>`;
    }).join('');
  }
  f.data.addEventListener('change', atualizarPeriodos);
  f.caminhao_id?.addEventListener('change', atualizarPeriodos);
  aoMudarAgenda(atualizarPeriodos);
  await atualizarPeriodos();

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = el.querySelector('#erro');
    erro.hidden = true;
    const falta = [];
    if (!d.obra_id) falta.push('obra');
    if (!d.data) falta.push('data');
    if (!d.periodo) falta.push('período');
    if (!d.categoria_id) falta.push('categoria');
    if (!d.descricao) falta.push('descrição');
    if (!d.justificativa) falta.push('justificativa');
    if (falta.length) { erro.textContent = 'Preencha: ' + falta.join(', ') + '.'; erro.hidden = false; return; }
    ocupado(f.querySelector('[type=submit]'), async () => {
      try {
        const s = await q(sb.rpc('criar_solicitacao', {
          p_caminhao_id: d.caminhao_id || estado.caminhaoId, p_obra_id: d.obra_id, p_data: d.data, p_periodo: d.periodo,
          p_categoria_id: d.categoria_id, p_descricao: d.descricao, p_justificativa: d.justificativa,
          p_local_especifico: d.local_especifico || null, p_observacoes: d.observacoes || null,
        }));
        aviso(`Solicitação nº ${s.numero} enviada. O período está reservado até a análise do administrador.`);
        location.hash = `#/solicitacoes/${s.id}`;
      } catch (ex) {
        erro.textContent = msgErro(ex); erro.hidden = false;
        if (/CONFLITO/.test(ex.message)) atualizarPeriodos();
      }
    });
  });
}
