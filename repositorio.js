// Único módulo responsável pelo arquivo JSON da aplicação.
const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');

function caminhoDoArquivo() {
  return path.join(app.getPath('userData'), 'bebidas.json');
}

async function inicializar() {
  try {
    await fs.access(caminhoDoArquivo());
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
    // Primeira abertura: cria o arquivo com uma lista vazia, sem dados fictícios.
    await fs.mkdir(path.dirname(caminhoDoArquivo()), { recursive: true });
    await fs.writeFile(caminhoDoArquivo(), '[]', 'utf8');
  }
}

async function carregar() {
  try {
    return JSON.parse(await fs.readFile(caminhoDoArquivo(), 'utf8'));
  } catch (erro) {
    if (erro.code === 'ENOENT') return [];
    throw erro;
  }
}

async function salvarArquivo(bebidas) {
  await fs.mkdir(path.dirname(caminhoDoArquivo()), { recursive: true });
  await fs.writeFile(caminhoDoArquivo(), JSON.stringify(bebidas, null, 2), 'utf8');
}

async function listar() { return carregar(); }

async function salvar(bebida) {
  if (!bebida || !String(bebida.nome || '').trim()) throw new Error('O nome da bebida é obrigatório.');
  const bebidas = await carregar();
  const id = Number(bebida.id);
  const existente = bebidas.findIndex((item) => item.id === id);
  const registro = {
    id: Number.isInteger(id) && id > 0 ? id : Math.max(0, ...bebidas.map((item) => Number(item.id) || 0)) + 1,
    nome: String(bebida.nome).trim(), marca: String(bebida.marca || '').trim(),
    categoria: String(bebida.categoria || 'Outros'), preco: Number(bebida.preco) || 0,
    estoque: Number(bebida.estoque) || 0, validade: bebida.validade || null
  };
  if (existente >= 0) bebidas[existente] = registro;
  else bebidas.push(registro);
  await salvarArquivo(bebidas);
  return registro;
}

async function excluir(id) {
  const bebidas = await carregar();
  const atualizadas = bebidas.filter((bebida) => bebida.id !== Number(id));
  await salvarArquivo(atualizadas);
}

module.exports = { inicializar, listar, salvar, excluir };
