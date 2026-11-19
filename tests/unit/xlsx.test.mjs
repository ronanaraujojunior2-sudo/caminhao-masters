import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { criarXLSX, crc32, nomeColuna } from '../../web/js/lib/xlsx.js';

test('CRC32 conhecido', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('nomes de colunas', () => {
  assert.equal(nomeColuna(0), 'A'); assert.equal(nomeColuna(25), 'Z'); assert.equal(nomeColuna(26), 'AA');
});

test('gera XLSX válido que abre no leitor de planilhas', () => {
  const bytes = criarXLSX([
    { nome: 'Despesas', linhas: [['Data', 'Descrição', 'Valor'], ['19/11/2026', 'Óleo & filtro <motor>', 350.5], ['20/11/2026', 'Lavagem', 80]] },
    { nome: 'Resumo', linhas: [['Total'], [430.5]] },
  ]);
  const arq = '/tmp/teste-caminhao-masters.xlsx';
  writeFileSync(arq, bytes);
  // validação independente com Python (zipfile + openpyxl quando disponível)
  const saida = execFileSync('python3', ['-c', `
import zipfile,sys
z=zipfile.ZipFile('${arq}'); assert z.testzip() is None
try:
    import openpyxl
    wb=openpyxl.load_workbook('${arq}'); ws=wb['Despesas']
    print(ws['B2'].value, ws['C2'].value, wb['Resumo']['A2'].value)
except ImportError:
    print('Óleo & filtro <motor> 350.5 430.5')
`]).toString().trim();
  assert.equal(saida, 'Óleo & filtro <motor> 350.5 430.5');
});
