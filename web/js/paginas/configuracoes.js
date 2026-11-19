// CONFIGURAÇÕES — antecedência, materiais obrigatórios, alertas e categorias
import { sb, q, estado, msgErro, carregarSessao } from '../api.js';
import { esc, opcoes, carregando, janela, aviso, camposHTML, lerForm, ocupado, confirmar } from '../ui.js';
import { descreverAntecedencia } from '../lib/regras.js';

export async function render(el) {
  el.innerHTML = carregando();
  async function desenhar() {
    const [cfg, cats] = await Promise.all([q(sb.from('configuracoes').select('*').eq('id', 1).single()), q(sb.from('categorias').select('*').order('ordem').order('nome'))]);
    el.innerHTML = `<div class="cabecalho"><h1>Configurações</h1></div>
      <form id="f-cfg" class="cartao"><h2>Regras da agenda</h2>
        <div class="linha-campos">
          <label class="campo"><span>Antecedência mínima para solicitar</span><select name="antecedencia_modo" id="modo">${opcoes([['proximo_dia_util', 'A partir do próximo dia útil'],
            ['24h', '24 horas'], ['48h', '48 horas'], ['personalizado', 'Prazo personalizado (horas)']], cfg.antecedencia_modo)}</select>
            <small>Atual: solicitar ${esc(descreverAntecedencia(cfg))}. O administrador pode agendar com prazo menor.</small></label>
          <label class="campo" id="c-horas" ${cfg.antecedencia_modo === 'personalizado' ? '' : 'hidden'}><span>Horas de antecedência</span><input name="antecedencia_horas" type="number" min="0" max="720" value="${cfg.antecedencia_horas}"></label>
        </div>
        ${camposHTML([{ n: 'materiais_obrigatorios', t: 'Exigir preenchimento de materiais transportados no registro de atendimento', tipo: 'checkbox' }], cfg)}
        <h2>Alertas</h2><div class="linha-campos">
          <label class="campo"><span>Avisar documentos com quantos dias de antecedência</span><input name="alerta_documento_dias" type="number" min="1" max="180" value="${cfg.alerta_documento_dias}"></label>
          <label class="campo"><span>Avisar manutenção preventiva (dias antes)</span><input name="alerta_manutencao_dias" type="number" min="1" max="180" value="${cfg.alerta_manutencao_dias}"></label>
          <label class="campo"><span>Avisar manutenção preventiva (km antes)</span><input name="alerta_manutencao_km" type="number" min="0" max="100000" value="${cfg.alerta_manutencao_km}"></label>
          <label class="campo"><span>Fuso horário da empresa</span><select name="fuso_horario">${opcoes([['America/Manaus', 'Manaus (UTC−4)'], ['America/Sao_Paulo', 'Brasília (UTC−3)'],
            ['America/Belem', 'Belém (UTC−3)'], ['America/Cuiaba', 'Cuiabá (UTC−4)'], ['America/Porto_Velho', 'Porto Velho (UTC−4)'], ['America/Rio_Branco', 'Rio Branco (UTC−5)']], cfg.fuso_horario)}</select></label>
        </div>
        <button class="btn btn-pri" type="submit">Salvar configurações</button></form>
      <section class="cartao"><div class="cabecalho"><h2>Categorias de solicitação</h2><button class="btn btn-pri btn-sm" id="nova-cat">+ Nova categoria</button></div>
        <p class="muted">Solicitações antigas mantêm o nome original da categoria, mesmo que ela seja renomeada ou desativada. "Outros" fica sempre disponível.</p>
        <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Ordem</th><th>Categoria</th><th>Situação</th><th></th></tr></thead><tbody>
        ${cats.map((c, i) => `<tr><td>${i + 1} <button class="btn btn-sm btn-sec" data-subir="${c.id}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button>
          <button class="btn btn-sm btn-sec" data-descer="${c.id}" ${i < cats.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button></td>
          <td>${esc(c.nome)}${c.protegida ? ' <small>(fixa)</small>' : ''}</td><td><span class="badge ${c.ativa ? 'badge-ok' : 'st-concluida'}">${c.ativa ? 'Ativa' : 'Desativada'}</span></td>
          <td>${c.protegida ? '' : `<button class="btn btn-sm btn-sec" data-renomear="${c.id}">Renomear</button> <button class="btn btn-sm btn-sec" data-alternar="${c.id}">${c.ativa ? 'Desativar' : 'Reativar'}</button>`}</td></tr>`).join('')}
        </tbody></table></div></section>`;
    const f = el.querySelector('#f-cfg');
    el.querySelector('#modo').onchange = (e) => { el.querySelector('#c-horas').hidden = e.target.value !== 'personalizado'; };
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = lerForm(f);
      ocupado(f.querySelector('[type=submit]'), async () => {
        try {
          await q(sb.from('configuracoes').update({ antecedencia_modo: d.antecedencia_modo, antecedencia_horas: Number(d.antecedencia_horas || 24),
            materiais_obrigatorios: d.materiais_obrigatorios, alerta_documento_dias: Number(d.alerta_documento_dias), alerta_manutencao_dias: Number(d.alerta_manutencao_dias),
            alerta_manutencao_km: Number(d.alerta_manutencao_km), fuso_horario: d.fuso_horario, atualizado_em: new Date().toISOString(), atualizado_por: estado.usuario.id }).eq('id', 1));
          await carregarSessao();
          aviso('Configurações salvas.'); desenhar();
        } catch (ex) { aviso(msgErro(ex), 'erro'); }
      });
    };
    el.onclick = async (e) => {
      const t = e.target;
      try {
        if (t.id === 'nova-cat' || t.dataset.renomear) {
          const c = cats.find((x) => x.id === t.dataset.renomear) || {};
          const r = await janela({ titulo: c.id ? 'Renomear categoria' : 'Nova categoria', corpo: `<form>${camposHTML([{ n: 'nome', t: 'Nome', obr: true, max: 80 }], c)}</form>`,
            botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }] });
          if (!r) return;
          await q(c.id ? sb.from('categorias').update({ nome: r.dados.nome }).eq('id', c.id)
            : sb.from('categorias').insert({ nome: r.dados.nome, ordem: Math.max(0, ...cats.filter((x) => !x.protegida).map((x) => x.ordem)) + 10 }));
          aviso('Categoria salva.'); desenhar();
        }
        if (t.dataset.alternar) {
          const c = cats.find((x) => x.id === t.dataset.alternar);
          if (c.ativa && !(await confirmar(`Desativar "${c.nome}"? Ela deixa de aparecer em novas solicitações; as antigas são preservadas.`))) return;
          await q(sb.from('categorias').update({ ativa: !c.ativa }).eq('id', c.id)); desenhar();
        }
        if (t.dataset.subir || t.dataset.descer) {
          const i = cats.findIndex((x) => x.id === (t.dataset.subir || t.dataset.descer));
          const j = t.dataset.subir ? i - 1 : i + 1;
          const nova = [...cats]; [nova[i], nova[j]] = [nova[j], nova[i]];
          await Promise.all(nova.map((c, k) => (c.ordem !== (k + 1) * 10 ? sb.from('categorias').update({ ordem: (k + 1) * 10 }).eq('id', c.id) : null)).filter(Boolean));
          desenhar();
        }
      } catch (ex) { aviso(/duplicate/i.test(ex.message) ? 'Já existe categoria com este nome.' : msgErro(ex), 'erro'); }
    };
  }
  await desenhar();
}
