import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrar, normalizar } from '../../web/js/lib/busca-texto.js';

const CAMPOS = ['nome', 'codigo_sienge', 'cliente', 'endereco'];
const obras = [
  { id: 1, nome: 'Hospital Santa Júlia', codigo_sienge: '6', cliente: 'Hospital Santa Julia', endereco: 'Rua A, Centro' },
  { id: 2, nome: 'Galpão Distrito', codigo_sienge: '60', cliente: 'Moto Honda', endereco: 'Av. Buriti, Distrito Industrial' },
  { id: 3, nome: 'Residencial Vivendas', codigo_sienge: null, cliente: null, endereco: 'Ponta Negra' },
  { id: 4, nome: 'Reforma Contêiner', codigo_sienge: '1000', cliente: '', endereco: '' },
];

test('normaliza acentos, maiúsculas e pontuação', () => {
  assert.equal(normalizar('  Contêiner / JÚLIA-1 '), 'conteiner julia 1');
});
test('pesquisa por parte do nome, sem acento', () => {
  assert.deepEqual(filtrar(obras, 'julia', CAMPOS).map((o) => o.id), [1]);
  assert.deepEqual(filtrar(obras, 'conteiner', CAMPOS).map((o) => o.id), [4]);
});
test('pesquisa por código do Sienge: código exato vem primeiro', () => {
  assert.deepEqual(filtrar(obras, '6', CAMPOS).map((o) => o.id)[0], 1);
  assert.deepEqual(filtrar(obras, '1000', CAMPOS).map((o) => o.id), [4]);
});
test('pesquisa por endereço e cliente; várias palavras em qualquer ordem', () => {
  assert.deepEqual(filtrar(obras, 'ponta negra', CAMPOS).map((o) => o.id), [3]);
  assert.deepEqual(filtrar(obras, 'industrial honda', CAMPOS).map((o) => o.id), [2]);
  assert.deepEqual(filtrar(obras, 'xyz', CAMPOS), []);
});
test('nome que começa com o termo vem antes', () => {
  assert.deepEqual(filtrar(obras, 'res', CAMPOS).map((o) => o.id), [3]);
  assert.equal(filtrar(obras, 'r', CAMPOS)[0].id, 3);
});
test('texto na ordem digitada vem antes das outras combinações', () => {
  const l = [{ nome: 'Obra Teste 02' }, { nome: 'Obra Teste 12' }, { nome: 'Obra Teste 20' }, { nome: 'Obra Teste 2' }];
  assert.deepEqual(filtrar(l, 'teste 2', ['nome']).map((o) => o.nome), ['Obra Teste 20', 'Obra Teste 2', 'Obra Teste 02', 'Obra Teste 12']);
});
test('sem texto devolve a lista limitada', () => {
  assert.equal(filtrar(obras, '', CAMPOS, 2).length, 2);
});
