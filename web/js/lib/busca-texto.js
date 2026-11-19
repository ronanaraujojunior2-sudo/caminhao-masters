// Busca tolerante: ignora acentos, maiúsculas e pontuação; todas as palavras
// digitadas precisam aparecer (em qualquer ordem). Módulo puro, testado.
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function filtrar(itens, consulta, campos, limite = 50) {
  const termos = normalizar(consulta).split(' ').filter(Boolean);
  if (!termos.length) return itens.slice(0, limite);
  const res = [];
  for (const it of itens) {
    const nome = normalizar(it[campos[0]]);
    const tudo = campos.map((c) => normalizar(it[c])).join(' ');
    if (!termos.every((t) => tudo.includes(t))) continue;
    // ordem: código exato, nome começando pelo texto, texto inteiro na ordem digitada,
    // nome começando pela 1ª palavra, palavra no início de outra palavra, demais
    const cod = normalizar(it.codigo_sienge), frase = termos.join(' ');
    const peso = cod && termos.length === 1 && cod === termos[0] ? 0 : nome.startsWith(frase) ? 1
      : (' ' + nome).includes(' ' + frase) ? 2 : nome.startsWith(termos[0]) ? 3 : (' ' + nome).includes(' ' + termos[0]) ? 4 : 5;
    res.push([peso, it]);
  }
  res.sort((a, b) => a[0] - b[0]);
  return res.slice(0, limite).map((x) => x[1]);
}
