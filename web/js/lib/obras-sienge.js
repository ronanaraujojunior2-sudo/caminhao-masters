// =====================================================================
// RELAÇÃO DE OBRAS DO SIENGE — leitura e comparação com o cadastro
// Mesmo formato já usado no Controle de Ferramentas e Materiais:
// coluna “Obra/Centro de custo” no formato “55 - NOME DA OBRA”, mais
// Projeto (cliente), Situação da obra, Empresa, Categoria etc.
// O arquivo do Sienge NÃO traz responsável, endereço nem telefones:
// esses campos nunca são inventados nem alterados.
// Módulo puro (sem tela), testado em tests/unit/obras-sienge.test.mjs.
// =====================================================================

export const nz = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9 ]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
const tx = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

export const ROTULOS = {
  cliente: 'Cliente (projeto)', situacao: 'Situação no Sienge', empresa: 'Empresa', categoria: 'Categoria',
  tipo_negocio: 'Tipo de negócio', area_negocio: 'Área de negócio', situacao_orcamento: 'Situação do orçamento',
  nivel_apropriacao: 'Nível de apropriação', data_cadastro: 'Data de cadastro no Sienge',
  area_terreno: 'Área do terreno', area_total: 'Área total',
};

export function dataISO(v) {
  let y, m, d;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const t = new Date(Math.round((v - 25569) * 86400000)); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
  } else {
    const s = tx(v); let k = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (k) { d = +k[1]; m = +k[2]; y = +k[3]; } else { k = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!k) return null; y = +k[1]; m = +k[2]; d = +k[3]; }
  }
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const concluida = (situacao) => /conclu|encerr|finaliz|cancel|entregue|inativ/.test(nz(situacao));

// Lê uma aba (matriz de linhas). Lança erro se não for a relação de obras do Sienge.
export function lerRelacaoObras(linhas) {
  let hi = -1, jo = 0;
  for (let i = 0; i < Math.min(linhas.length, 60); i++) {
    const j = (linhas[i] || []).findIndex((c) => nz(c) === 'obra centro de custo');
    if (j >= 0) { hi = i; jo = j; break; }
  }
  if (hi < 0) throw new Error('Não reconheci este arquivo como a relação de obras do Sienge (não encontrei a coluna “Obra/Centro de custo”).');
  const H = linhas[hi].map(nz);
  const col = (...n) => H.findIndex((h) => n.includes(h));
  const P = {
    data_cadastro: col('data de cadastro'), categoria: col('categoria'), empresa: col('empresa'), cliente: col('projeto'),
    tipo_negocio: col('tipo de negocio'), area_negocio: col('area de negocio'),
    situacao: H.findIndex((h) => h.startsWith('situacao da obra')),
    situacao_orcamento: col('situacao do orcamento'), nivel_apropriacao: col('nivel de apropriacao'),
    area_terreno: col('area do terreno'), area_total: col('area total'),
  };
  // linha “Período” do cabeçalho do relatório (informativa)
  let periodo = '';
  for (let i = 0; i < hi; i++) { const r = linhas[i] || []; const j = r.findIndex((c) => nz(c) === 'periodo'); if (j >= 0) { periodo = tx(r.slice(j + 1).find((c) => tx(c)) || ''); break; } }
  const lidas = [], rejeitadas = [], vistos = new Map();
  for (let i = hi + 1; i < linhas.length; i++) {
    const r = linhas[i] || [];
    const a = tx(r[jo]);
    if (!a) { if ((r || []).every((c) => tx(c) === '')) continue; break; }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d/.test(a)) break;           // rodapé do relatório (data - hora)
    const m = a.match(/^(\d{1,10})\s*-\s*([\s\S]+)$/);
    if (!m) { rejeitadas.push({ linha: i + 1, motivo: `A obra “${a}” não começa com o código do Sienge (código - nome).` }); continue; }
    const codigo = String(Number(m[1])), nome = tx(m[2]);
    if (vistos.has(codigo)) { rejeitadas.push({ linha: i + 1, codigo, nome, motivo: `Código ${codigo} repetido no arquivo (já aparece na linha ${vistos.get(codigo)}).` }); continue; }
    vistos.set(codigo, i + 1);
    if (nome.length < 2 || nome.length > 200) { rejeitadas.push({ linha: i + 1, codigo, nome, motivo: 'Nome da obra vazio ou com mais de 200 caracteres.' }); continue; }
    const g = (k) => (P[k] < 0 ? '' : tx(r[P[k]]));
    const dados = {};
    ['empresa', 'categoria', 'tipo_negocio', 'area_negocio', 'situacao_orcamento', 'nivel_apropriacao'].forEach((k) => { const v = g(k); if (v) dados[k] = v; });
    if (P.data_cadastro >= 0) { const d = dataISO(r[P.data_cadastro]); if (d) dados.data_cadastro = d; }
    ['area_terreno', 'area_total'].forEach((k) => {           // áreas zeradas no Sienge não são guardadas
      if (P[k] < 0) return; const v = r[P[k]];
      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(n) && n > 0) dados[k] = String(n);
    });
    lidas.push({ linha: i + 1, codigo, nome, cliente: g('cliente'), situacao: g('situacao'), dados });
  }
  if (!lidas.length && !rejeitadas.length) throw new Error('Não encontrei obras abaixo dos títulos do arquivo.');
  return { linhaCabecalho: hi + 1, periodo, colunas: linhas[hi].map(tx).filter(Boolean), lidas, rejeitadas };
}

// Procura a relação de obras em todas as abas.
export function lerRelacaoDasAbas(abas) {
  let ult;
  for (const a of abas) { try { return lerRelacaoObras(a.linhas); } catch (e) { ult = e; } }
  throw ult || new Error('Arquivo vazio.');
}

function diferencas(o, l) {
  const out = [];
  const ant = { cliente: o.cliente, situacao: o.situacao_sienge };
  if (l.cliente && nz(l.cliente) !== nz(ant.cliente)) out.push({ k: 'cliente', antes: ant.cliente || '', depois: l.cliente });
  if (l.situacao && nz(l.situacao) !== nz(ant.situacao)) out.push({ k: 'situacao', antes: ant.situacao || '', depois: l.situacao });
  const ds = o.dados_sienge || {};
  Object.keys(l.dados).forEach((k) => { if (nz(l.dados[k]) !== nz(ds[k])) out.push({ k, antes: ds[k] == null ? '' : String(ds[k]), depois: l.dados[k] }); });
  return out;
}

// Compara as obras do arquivo com o cadastro e decide o que propor.
// estados: nova | vincular | atualizar | igual
export function planejar(lidas, existentes) {
  const porCodigo = new Map(existentes.filter((o) => o.codigo_sienge).map((o) => [String(o.codigo_sienge), o]));
  const semCodigoPorNome = new Map(existentes.filter((o) => !o.codigo_sienge).map((o) => [nz(o.nome), o]));
  const comCodigoPorNome = new Map(); existentes.filter((o) => o.codigo_sienge).forEach((o) => comCodigoPorNome.set(nz(o.nome), o));
  const nomesArquivo = new Map();
  lidas.forEach((l) => { const k = nz(l.nome); nomesArquivo.set(k, [...(nomesArquivo.get(k) || []), l.codigo]); });
  return lidas.map((l) => {
    const avisos = [];
    const iguais = nomesArquivo.get(nz(l.nome)).filter((c) => c !== l.codigo);
    if (iguais.length) avisos.push(`No próprio Sienge há outra obra com este nome (código ${iguais.join(', ')}). Serão obras diferentes, identificadas pelo código.`);
    const ex = porCodigo.get(l.codigo);
    if (ex) {
      if (nz(ex.nome) !== nz(l.nome)) avisos.push(`No sistema esta obra se chama “${ex.nome}”. O nome não é alterado pela importação.`);
      if (concluida(l.situacao) && ex.ativa) avisos.push('No Sienge ela está encerrada, mas no sistema continua ativa. Se não for mais receber o caminhão, inative-a na lista de obras.');
      const dif = diferencas(ex, l);
      return { ...l, estado: dif.length ? 'atualizar' : 'igual', obra: ex, dif, avisos, marcada: dif.length > 0 };
    }
    const manual = semCodigoPorNome.get(nz(l.nome));
    if (manual) {
      avisos.push('Já existe obra cadastrada à mão com este nome. O código do Sienge será ligado a ela; responsável, telefones e solicitações continuam iguais.');
      return { ...l, estado: 'vincular', obra: manual, dif: diferencas(manual, l), avisos, marcada: true };
    }
    const homonima = comCodigoPorNome.get(nz(l.nome));
    if (homonima) avisos.push(`Já existe outra obra do Sienge com este nome (código ${homonima.codigo_sienge}). Serão obras diferentes.`);
    const enc = concluida(l.situacao);
    if (enc) avisos.push('Encerrada no Sienge: fica desmarcada. Se marcar, entra como inativa (não recebe solicitações).');
    return { ...l, estado: 'nova', obra: null, dif: [], avisos, marcada: !enc, ativa: !enc };
  });
}

// Monta o que vai para o banco (somente itens marcados).
export function montarEnvio(plano) {
  return plano.filter((p) => p.marcada && p.estado !== 'igual').map((p) => {
    const base = { codigo: p.codigo, nome: p.nome, cliente: p.cliente || null, situacao: p.situacao || null, dados: p.dados };
    if (p.estado === 'nova') return { ...base, acao: 'cadastrar', ativa: p.ativa !== false };
    if (p.estado === 'vincular') return { ...base, acao: 'vincular', obra_id: p.obra.id };
    return { ...base, acao: 'atualizar' };
  });
}
