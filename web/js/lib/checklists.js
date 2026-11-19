// Modelos de checklist (os itens críticos também são conferidos no banco).
export const CHECKLISTS = {
  abertura: {
    titulo: 'Checklist de abertura',
    itens: ['Pneus', 'Freios', 'Luzes e sinalização', 'Óleo e fluidos', 'Combustível', 'Carroceria',
      'Equipamentos e acessórios do Munck', 'Avarias aparentes'],
  },
  encerramento: {
    titulo: 'Checklist de encerramento',
    itens: ['Limpeza', 'Estacionamento', 'Equipamentos guardados', 'Condições gerais', 'Avarias'],
  },
  munck: {
    titulo: 'Checklist específico do Munck (opcional)',
    itens: ['Cabos e cintas', 'Gancho e dispositivos de segurança', 'Comandos hidráulicos', 'Mangueiras e conexões',
      'Estabilizadores/patolas', 'Estrutura da lança', 'Controles', 'Vazamentos, desgaste ou avarias'],
  },
};

// Irregularidade nestes itens é SEMPRE crítica (alerta o administrador)
export const ITENS_CRITICOS = ['pneus', 'freios', 'luzes e sinalização', 'gancho e dispositivos de segurança',
  'cabos e cintas', 'comandos hidráulicos', 'estabilizadores/patolas', 'estrutura da lança', 'vazamentos, desgaste ou avarias'];

export const ehCritico = (item) => ITENS_CRITICOS.includes(String(item).toLowerCase());

export const RESULTADOS = { conforme: 'Conforme', irregular: 'Com irregularidade', na: 'Não se aplica' };

/** Converte os campos do formulário em lista de itens para o banco. */
export function lerChecklist(tipo, dados) {
  return CHECKLISTS[tipo].itens.map((item, i) => ({
    item,
    resultado: dados[`${tipo}_r${i}`] || null,
    critico: dados[`${tipo}_r${i}`] === 'irregular' && (ehCritico(item) || dados[`${tipo}_c${i}`] === true),
    obs: dados[`${tipo}_o${i}`] || null,
  }));
}

export function faltando(itens) { return itens.filter((x) => !x.resultado).map((x) => x.item); }
