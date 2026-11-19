// DOCUMENTOS DO CAMINHÃO (CRLV, licenciamento, seguro...) — validade, alertas e histórico
import { sb, q, estado, caminhaoAtual, msgErro, ehAdmin, offsetFuso, urlArquivo } from '../api.js';
import { esc, fmtData, vazio, carregando, janela, aviso, camposHTML } from '../ui.js';
import { situacaoDocumento, hojeNoFuso } from '../lib/regras.js';

const TIPOS = [['crlv', 'CRLV'], ['licenciamento', 'Licenciamento'], ['seguro', 'Seguro'], ['comprovante', 'Comprovante'], ['outro', 'Outro documento']];
const nomeTipo = (t) => TIPOS.find((x) => x[0] === t)?.[1] || t;

export async function render(el) {
  const cam = caminhaoAtual();
  const admin = ehAdmin();
  if (!cam) { el.innerHTML = `<h1>Documentos</h1>${vazio('Nenhum caminhão cadastrado.')}`; return; }
  const hoje = hojeNoFuso(Date.now(), offsetFuso());
  let mostrarHist = false;
  el.innerHTML = `<div class="cabecalho"><h1>Documentos — ${esc(cam.nome)}</h1>${admin ? '<div class="acoes"><button class="btn btn-pri" id="novo">+ Adicionar documento</button></div>' : ''}</div>
    ${admin ? '<label class="check"><input type="checkbox" id="hist"> Mostrar histórico (documentos substituídos)</label>' : '<p class="muted">Documentos liberados pelo administrador para consulta do motorista.</p>'}
    <div id="lista">${carregando()}</div>`;
  let dados = [];
  async function carregar() {
    let c = sb.from('documentos').select('*').eq('caminhao_id', cam.id).order('tipo').order('criado_em', { ascending: false });
    if (!mostrarHist) c = c.eq('ativo', true);
    dados = await q(c);
    const anexos = dados.length ? await q(sb.from('anexos').select('*').eq('entidade', 'documento').in('entidade_id', dados.map((d) => d.id))) : [];
    dados.forEach((d) => { d.arquivos = anexos.filter((a) => a.entidade_id === d.id); });
    el.querySelector('#lista').innerHTML = dados.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Tipo</th><th>Descrição</th><th>Emissão</th><th>Validade</th><th>Situação</th><th></th></tr></thead><tbody>
      ${dados.map((d, i) => { const s = situacaoDocumento(d.validade, hoje, estado.config?.alerta_documento_dias || 30);
        return `<tr><td data-r="Tipo">${esc(nomeTipo(d.tipo))}</td><td data-r="Descrição">${esc(d.descricao)}${admin && d.visivel_motorista ? '<br><small>Visível ao motorista</small>' : ''}</td>
        <td data-r="Emissão">${fmtData(d.data_emissao)}</td><td data-r="Validade">${fmtData(d.validade)}</td>
        <td data-r="Situação">${d.ativo ? `<span class="badge ${s.codigo === 'vencido' ? 'badge-erro' : s.codigo === 'a_vencer' ? 'badge-aviso' : 'badge-ok'}">${esc(s.rotulo)}</span>` : '<span class="badge st-concluida">Substituído</span>'}</td>
        <td>${d.arquivos.map((a) => `<button class="btn btn-sm btn-sec" data-abrir="${a.id}">Abrir</button>`).join(' ')}
          ${admin && d.ativo ? `<button class="btn btn-sm btn-sec" data-substituir="${i}">Substituir/renovar</button> <button class="btn btn-sm btn-sec" data-editar="${i}">Editar</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : vazio('Nenhum documento.');
  }
  async function formulario(base = {}, substituir = null) {
    const r = await janela({
      titulo: substituir ? `Renovar: ${substituir.descricao}` : base.id ? 'Editar documento' : 'Adicionar documento',
      corpo: `<form>${camposHTML([
        { n: 'tipo', t: 'Tipo', tipo: 'select', obr: true, opcoes: TIPOS },
        { n: 'descricao', t: 'Descrição', obr: true, ajuda: 'Ex.: CRLV 2026, Apólice Seguradora X' },
        { n: 'data_emissao', t: 'Data de emissão', tipo: 'date' }, { n: 'validade', t: 'Validade', tipo: 'date' },
        { n: 'visivel_motorista', t: 'Visível para o motorista (ex.: CRLV)', tipo: 'checkbox' },
        ...(base.id ? [] : [{ n: 'arquivo', t: 'Arquivo (PDF ou imagem, até 20 MB)', tipo: 'file', obr: true, accept: 'application/pdf,image/*' }]),
      ], substituir ? { tipo: substituir.tipo, descricao: substituir.descricao, visivel_motorista: substituir.visivel_motorista } : base)}</form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
      validar: (d) => (!base.id && !d.arquivo?.length ? 'Selecione o arquivo.' : d.arquivo?.[0]?.size > 20971520 ? 'Arquivo maior que 20 MB.' : null),
    });
    if (!r) return;
    const d = r.dados;
    const reg = { caminhao_id: cam.id, tipo: d.tipo, descricao: d.descricao, data_emissao: d.data_emissao || null, validade: d.validade || null, visivel_motorista: d.visivel_motorista };
    if (base.id) { await q(sb.from('documentos').update(reg).eq('id', base.id)); aviso('Documento atualizado.'); return carregar(); }
    const doc = await q(sb.from('documentos').insert({ ...reg, criado_por: estado.usuario.id }).select().single());
    const arq = d.arquivo[0];
    const caminho = `${cam.id}/${doc.id}/${arq.name.replace(/[^\w.-]/g, '_')}`;
    const up = await sb.storage.from('documentos').upload(caminho, arq, { contentType: arq.type });
    if (up.error) { await q(sb.from('documentos').update({ ativo: false }).eq('id', doc.id)); throw up.error; }
    await q(sb.from('anexos').insert({ entidade: 'documento', entidade_id: doc.id, bucket: 'documentos', caminho, nome_arquivo: arq.name, mime: arq.type, enviado_por: estado.usuario.id }));
    if (substituir) await q(sb.from('documentos').update({ ativo: false }).eq('id', substituir.id));
    aviso(substituir ? 'Documento renovado. A versão anterior foi para o histórico.' : 'Documento adicionado.');
    carregar();
  }
  el.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.id === 'novo') await formulario();
      if (t.dataset.editar) await formulario(dados[t.dataset.editar]);
      if (t.dataset.substituir) await formulario({}, dados[t.dataset.substituir]);
      if (t.dataset.abrir) {
        const a = dados.flatMap((d) => d.arquivos).find((x) => x.id === t.dataset.abrir);
        const janelaNova = window.open('about:blank', '_blank'); // aberta antes da espera para não ser bloqueada
        const url = await urlArquivo(a.bucket, a.caminho);
        if (janelaNova) { janelaNova.opener = null; janelaNova.location.href = url; } else location.href = url;
      }
    } catch (ex) { aviso(msgErro(ex), 'erro'); }
  });
  el.querySelector('#hist')?.addEventListener('change', (e) => { mostrarHist = e.target.checked; carregar(); });
  await carregar();
}
