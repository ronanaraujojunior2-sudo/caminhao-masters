// =====================================================================
// LEITOR DE PLANILHAS (.xlsx e .csv) — sem biblioteca externa
// O .xlsx é um arquivo ZIP com XML dentro. Este leitor abre o ZIP com a
// descompressão nativa do navegador (DecompressionStream) e lê as células.
// Devolve [{ nome, linhas: [[valor, ...], ...] }] — uma entrada por aba.
// Valores: texto, número (datas do Excel vêm como número de série) ou booleano.
// =====================================================================

const LIMITE_ARQUIVO = 20 * 1024 * 1024;   // 20 MB
const LIMITE_XML = 80 * 1024 * 1024;        // 80 MB descompactados por parte

export async function lerPlanilha(arquivo) {
  const nome = (arquivo.name || '').toLowerCase();
  if (arquivo.size > LIMITE_ARQUIVO) throw new Error('O arquivo é grande demais (máximo 20 MB).');
  const buf = await arquivo.arrayBuffer();
  if (nome.endsWith('.csv')) return [{ nome: arquivo.name, linhas: lerCSV(decodificarTexto(buf)) }];
  if (nome.endsWith('.xlsx')) return lerXLSX(buf);
  if (nome.endsWith('.xls')) throw new Error('Este é o formato antigo do Excel (.xls). No Sienge, exporte em Excel (.xlsx) ou, no Excel, use “Salvar como” → “Pasta de Trabalho do Excel (.xlsx)”.');
  throw new Error('Use o arquivo exportado pelo Sienge em Excel (.xlsx) ou .csv.');
}

// ---------------------------------------------------------------- CSV
export function decodificarTexto(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}
export function lerCSV(texto) {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] || '';
  const sep = primeira.split(';').length >= primeira.split(',').length ? ';' : ',';
  const linhas = []; let linha = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const h = t[i];
    if (q) {
      if (h === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += h;
    } else if (h === '"') q = true;
    else if (h === sep) { linha.push(c); c = ''; }
    else if (h === '\n' || h === '\r') {
      if (h === '\r' && t[i + 1] === '\n') i++;
      linha.push(c); linhas.push(linha); linha = []; c = '';
    } else c += h;
  }
  if (c !== '' || linha.length) { linha.push(c); linhas.push(linha); }
  return linhas;
}

// ---------------------------------------------------------------- ZIP
function lerZip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let fim = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('O arquivo não é um Excel (.xlsx) válido ou está corrompido.');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const entradas = new Map();
  const dec = new TextDecoder('utf-8');
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.byteLength || v.getUint32(p, true) !== 0x02014b50) throw new Error('Estrutura do arquivo .xlsx inválida.');
    const metodo = v.getUint16(p + 10, true), tamC = v.getUint32(p + 20, true), tamU = v.getUint32(p + 24, true);
    const lNome = v.getUint16(p + 28, true), lExtra = v.getUint16(p + 30, true), lCom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + lNome));
    entradas.set(nome, { metodo, tamC, tamU, local });
    p += 46 + lNome + lExtra + lCom;
  }
  return {
    tem: (n) => entradas.has(n),
    async texto(n) {
      const e = entradas.get(n);
      if (!e) return null;
      if (e.tamU > LIMITE_XML || e.tamC === 0xffffffff) throw new Error('O arquivo .xlsx é grande demais para ser lido no navegador.');
      if (v.getUint32(e.local, true) !== 0x04034b50) throw new Error('Estrutura do arquivo .xlsx inválida.');
      const ini = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
      const dados = u8.slice(ini, ini + e.tamC);
      let bytes;
      if (e.metodo === 0) bytes = dados;
      else if (e.metodo === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador é antigo demais para ler .xlsx. Atualize o navegador ou use o arquivo .csv.');
        const s = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(s).arrayBuffer());
      } else throw new Error('Compressão do arquivo .xlsx não suportada.');
      return dec.decode(bytes);
    },
  };
}

// ---------------------------------------------------------------- XML
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function desescapar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, k) =>
    k[0] === '#' ? String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : ENT[k.toLowerCase()]);
}
const atributo = (attrs, nome) => { const m = attrs.match(new RegExp('(?:^|\\s)' + nome + '="([^"]*)"')); return m ? desescapar(m[1]) : null; };
const textos = (xml) => { let s = ''; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, t) => { s += desescapar(t); return ''; }); return s; };

function colunaIndice(ref) {
  const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function lerAba(xml, compartilhadas) {
  const linhas = [];
  let proxLinha = 0;
  const reLinha = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let mr;
  while ((mr = reLinha.exec(xml))) {
    const rAttr = atributo(mr[1], 'r');
    const iLinha = rAttr ? parseInt(rAttr, 10) - 1 : proxLinha;
    proxLinha = iLinha + 1;
    const corpo = mr[2] || '';
    const linha = [];
    let proxCol = 0, mc;
    const reCel = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    while ((mc = reCel.exec(corpo))) {
      const ref = atributo(mc[1], 'r');
      const col = ref ? colunaIndice(ref) : proxCol;
      proxCol = col + 1;
      const tipo = atributo(mc[1], 't');
      const dentro = mc[2] || '';
      const mv = /<v>([\s\S]*?)<\/v>/.exec(dentro);
      const bruto = mv ? desescapar(mv[1]) : null;
      let valor = '';
      if (tipo === 's') valor = bruto == null ? '' : (compartilhadas[parseInt(bruto, 10)] ?? '');
      else if (tipo === 'inlineStr') valor = textos(dentro);
      else if (tipo === 'b') valor = bruto === '1';
      else if (tipo === 'str' || tipo === 'e' || tipo === 'd') valor = bruto ?? '';
      else if (bruto != null && bruto !== '') { const n = Number(bruto); valor = Number.isFinite(n) ? n : bruto; }
      if (col >= 0 && col < 500) { while (linha.length < col) linha.push(''); linha[col] = valor; }
    }
    if (iLinha >= 0 && iLinha < 200000) { while (linhas.length < iLinha) linhas.push([]); linhas[iLinha] = linha; }
  }
  return linhas;
}

export async function lerXLSX(buf) {
  const zip = lerZip(buf);
  const wb = await zip.texto('xl/workbook.xml');
  if (!wb) throw new Error('O arquivo não é uma planilha do Excel (.xlsx).');
  const rels = (await zip.texto('xl/_rels/workbook.xml.rels')) || '';
  const alvo = {};
  rels.replace(/<Relationship\b([^>]*)\/?>/g, (_, a) => { alvo[atributo(a, 'Id')] = atributo(a, 'Target'); return ''; });
  const ssXml = (await zip.texto('xl/sharedStrings.xml')) || '';
  const compartilhadas = [];
  ssXml.replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => { compartilhadas.push(textos(si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''))); return ''; });
  const abas = [];
  const reAba = /<sheet\b([^>]*?)\/?>/g; let m;
  while ((m = reAba.exec(wb))) {
    const nome = atributo(m[1], 'name') || 'Planilha';
    const rid = atributo(m[1], 'r:id');
    let caminho = alvo[rid] || '';
    caminho = caminho.startsWith('/') ? caminho.slice(1) : 'xl/' + caminho.replace(/^\.\//, '');
    if (!zip.tem(caminho)) continue;
    abas.push({ nome, linhas: lerAba(await zip.texto(caminho), compartilhadas) });
  }
  if (!abas.length) throw new Error('Não encontrei nenhuma aba com dados no arquivo.');
  return abas;
}
