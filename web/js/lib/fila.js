// =====================================================================
// Fila de sincronização offline (Diário de Bordo do motorista).
// Cada registro feito sem internet fica guardado no aparelho como
// "pendente de sincronização" e é enviado, NA ORDEM, quando a conexão volta.
// Os registros têm ID gerado no aparelho, então reenviar nunca duplica.
// Módulo puro: armazenamento e executor são injetados (testado em Node).
// =====================================================================

export function ehErroDeRede(e) {
  if (!e) return false;
  if (e.rede === true) return true;
  const msg = String(e.message || e).toLowerCase();
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|offline/.test(msg)) return true;
  if (e.status === 0) return true;
  const st = Number(e.status ?? e.statusCode ?? 0);
  return st >= 500 || st === 408 || st === 429;
}

export function novoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Armazenamento em memória (testes) — mesma interface do IndexedDB. */
export function armazenamentoMemoria() {
  const m = new Map();
  return {
    async salvar(op) { m.set(op.id, structuredClone(op)); },
    async remover(id) { m.delete(id); },
    async listar() { return [...m.values()].map((x) => structuredClone(x)); },
  };
}

export class Fila {
  constructor({ armazenamento, executor, aoMudar = () => {} }) {
    this.arm = armazenamento;
    this.exec = executor;
    this.aoMudar = aoMudar;
    this.processando = null;
    this.seq = 0;
  }

  async adicionar(op) {
    const item = {
      ...op,
      id: op.id || novoId(),
      criado_em: Date.now(),
      seq: ++this.seq,
      estado: 'pendente',
      tentativas: 0,
      erro: null,
    };
    await this.arm.salvar(item);
    this.aoMudar();
    return item;
  }

  async listar() {
    const ops = await this.arm.listar();
    return ops.sort((a, b) => a.criado_em - b.criado_em || a.seq - b.seq);
  }

  async contar() {
    const ops = await this.arm.listar();
    return { pendentes: ops.filter((o) => o.estado === 'pendente').length, erros: ops.filter((o) => o.estado === 'erro').length };
  }

  /** Envia tudo o que estiver pendente. Para no primeiro erro de rede (tenta de novo depois). */
  processar() {
    if (this.processando) return this.processando;
    this.processando = (async () => {
      const resultado = { enviados: 0, erros: 0, semRede: false };
      try {
        for (const op of await this.listar()) {
          if (op.estado !== 'pendente') continue;
          try {
            await this.exec(op);
            await this.arm.remover(op.id);
            resultado.enviados++;
          } catch (e) {
            if (ehErroDeRede(e)) { resultado.semRede = true; break; }
            op.estado = 'erro';
            op.erro = e?.message || String(e);
            op.tentativas++;
            await this.arm.salvar(op);
            resultado.erros++;
          }
        }
      } finally {
        this.processando = null;
        this.aoMudar();
      }
      return resultado;
    })();
    return this.processando;
  }

  async tentarNovamente(id) {
    const op = (await this.arm.listar()).find((o) => o.id === id);
    if (!op) return;
    op.estado = 'pendente'; op.erro = null;
    await this.arm.salvar(op);
    this.aoMudar();
    return this.processar();
  }

  async descartar(id) { await this.arm.remover(id); this.aoMudar(); }
}

/** Armazenamento no IndexedDB do navegador (suporta fotos/Blob). */
export function armazenamentoIndexedDB(nomeBanco = 'caminhao-masters', loja = 'fila') {
  const abrir = () => new Promise((res, rej) => {
    const r = indexedDB.open(nomeBanco, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(loja, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (modo, fn) => {
    const db = await abrir();
    return new Promise((res, rej) => {
      const t = db.transaction(loja, modo);
      const req = fn(t.objectStore(loja));
      t.oncomplete = () => { db.close(); res(req?.result); };
      t.onerror = () => { db.close(); rej(t.error); };
    });
  };
  return {
    salvar: (op) => tx('readwrite', (s) => s.put(op)),
    remover: (id) => tx('readwrite', (s) => s.delete(id)),
    listar: () => tx('readonly', (s) => s.getAll()),
  };
}
