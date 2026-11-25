// repositorio.js — único módulo que lê e escreve o arquivo JSON de dados.
// Não importa electron; recebe o caminho via inicializar(pastaUserData).
const fs = require('node:fs/promises');
const path = require('node:path');

const VERSAO = 1;
let caminhoArquivo = null;
let fila = Promise.resolve();

function inicializar(pastaUserData) {
  caminhoArquivo = path.join(pastaUserData, 'dados.json');
  fila = Promise.resolve();
}

async function lerArquivo() {
  try {
    const conteudo = await fs.readFile(caminhoArquivo, 'utf-8');
    const dados = JSON.parse(conteudo);
    // Migração: formato antigo era um array simples de bebidas.
    if (Array.isArray(dados)) {
      return { versao: VERSAO, bebidas: dados, vendas: [] };
    }
    return { versao: VERSAO, bebidas: dados.bebidas || [], vendas: dados.vendas || [] };
  } catch (erro) {
    if (erro.code === 'ENOENT') return { versao: VERSAO, bebidas: [], vendas: [] };
    // JSON inválido: faz backup e devolve estado vazio.
    const backup = caminhoArquivo + `.corrompido-${Date.now()}.json`;
    try { await fs.rename(caminhoArquivo, backup); } catch (_) {}
    return { versao: VERSAO, bebidas: [], vendas: [] };
  }
}

async function gravarArquivo(dados) {
  const tmp = caminhoArquivo + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(dados, null, 2), 'utf-8');
  await fs.rename(tmp, caminhoArquivo);
}

function enfileirar(operacao) {
  fila = fila.then(() => operacao());
  return fila;
}

async function listar() {
  const dados = await lerArquivo();
  return dados.bebidas;
}

async function salvar(bebida) {
  if (!bebida || !String(bebida.nome || '').trim()) throw new Error('O nome da bebida é obrigatório.');
  return enfileirar(async () => {
    const dados = await lerArquivo();
    const bebidas = dados.bebidas;
    const id = Number(bebida.id);
    const existente = bebidas.findIndex((item) => item.id === id);
    const registro = {
      id: Number.isInteger(id) && id > 0 ? id : Math.max(0, ...bebidas.map((item) => Number(item.id) || 0)) + 1,
      nome: String(bebida.nome).trim(),
      marca: String(bebida.marca || '').trim(),
      categoria: String(bebida.categoria || 'Outros'),
      preco: Number(bebida.preco) || 0,
      estoque: Number(bebida.estoque) || 0,
      validade: bebida.validade || null
    };
    if (existente >= 0) bebidas[existente] = registro;
    else bebidas.push(registro);
    await gravarArquivo({ ...dados, versao: VERSAO, bebidas });
    return registro;
  });
}

async function excluir(id) {
  return enfileirar(async () => {
    const dados = await lerArquivo();
    const bebidas = dados.bebidas.filter((bebida) => bebida.id !== Number(id));
    await gravarArquivo({ ...dados, versao: VERSAO, bebidas });
  });
}

async function listarVendas() {
  const dados = await lerArquivo();
  return dados.vendas;
}

async function registrarVenda(dadosVenda) {
  if (!dadosVenda?.itens?.length) throw new Error('A venda precisa ter pelo menos um item.');
  return enfileirar(async () => {
    const dados = await lerArquivo();
    const bebidas = dados.bebidas;
    for (const item of dadosVenda.itens) {
      const bebida = bebidas.find((b) => b.id === Number(item.bebidaId));
      if (!bebida) throw new Error(`Produto ${item.bebidaId} não encontrado.`);
      if ((bebida.estoque || 0) < item.quantidade) throw new Error(`Estoque insuficiente para "${bebida.nome}".`);
    }
    for (const item of dadosVenda.itens) {
      const bebida = bebidas.find((b) => b.id === Number(item.bebidaId));
      bebida.estoque = (bebida.estoque || 0) - item.quantidade;
    }
    const vendas = dados.vendas || [];
    const numeros = vendas.map((v) => parseInt(String(v.pedido).replace(/\D/g, ''), 10) || 0);
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const total = dadosVenda.itens.reduce((soma, item) => soma + (Number(item.precoUnitario) || 0) * item.quantidade, 0);
    const desconto = Math.min(100, Math.max(0, Number(dadosVenda.descontoPercentual) || 0));
    const venda = {
      id: Date.now(),
      pedido: `#${Math.max(1048, ...numeros) + 1}`,
      horario: `Hoje, ${hora}`,
      itens: `${dadosVenda.itens.length} ${dadosVenda.itens.length === 1 ? 'item' : 'itens'}`,
      pagamento: dadosVenda.formaPagamento || 'Dinheiro',
      valor: total * (1 - desconto / 100),
      status: 'Concluída',
      linhas: dadosVenda.itens
    };
    vendas.unshift(venda);
    await gravarArquivo({ ...dados, versao: VERSAO, bebidas, vendas });
    return venda;
  });
}

module.exports = { inicializar, listar, salvar, excluir, listarVendas, registrarVenda };
