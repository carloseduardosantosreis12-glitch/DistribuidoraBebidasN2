// Testes do repositorio.js usando node:test (sem dependências externas).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const repositorio = require('../repositorio');

async function criarPasta() {
  const pasta = path.join(os.tmpdir(), `bebmais-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(pasta, { recursive: true });
  return pasta;
}

test('primeira execução: lista de produtos vazia sem erro', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebidas = await repositorio.listar();
  assert.deepStrictEqual(bebidas, []);
});

test('criar produto retorna o registro com id gerado', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const criado = await repositorio.salvar({ nome: 'Coca-Cola', categoria: 'Refrigerantes', preco: 5.5, estoque: 10 });
  assert.strictEqual(criado.nome, 'Coca-Cola');
  assert.strictEqual(typeof criado.id, 'number');
  assert.ok(criado.id > 0);
});

test('listar após criar retorna o produto salvo', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  await repositorio.salvar({ nome: 'Agua Mineral', categoria: 'Águas', preco: 2, estoque: 20 });
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas.length, 1);
  assert.strictEqual(bebidas[0].nome, 'Agua Mineral');
});

test('editar produto substitui os dados sem criar duplicata', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const criado = await repositorio.salvar({ nome: 'Suco de Laranja', categoria: 'Sucos', preco: 4, estoque: 5 });
  const editado = await repositorio.salvar({ id: criado.id, nome: 'Suco de Uva', categoria: 'Sucos', preco: 4.5, estoque: 8 });
  assert.strictEqual(editado.nome, 'Suco de Uva');
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas.length, 1);
  assert.strictEqual(bebidas[0].nome, 'Suco de Uva');
});

test('excluir produto remove da lista', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const criado = await repositorio.salvar({ nome: 'Cerveja Brahma', categoria: 'Cervejas', preco: 6, estoque: 24 });
  await repositorio.excluir(criado.id);
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas.length, 0);
});

test('persistência: dados sobrevivem ao reinicializar com a mesma pasta', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  await repositorio.salvar({ nome: 'Vinho Tinto', categoria: 'Vinhos', preco: 35, estoque: 6 });
  repositorio.inicializar(pasta);
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas.length, 1);
  assert.strictEqual(bebidas[0].nome, 'Vinho Tinto');
});

test('validação: nome vazio lança erro', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  await assert.rejects(
    () => repositorio.salvar({ nome: '', categoria: 'Outros', preco: 1, estoque: 1 }),
    /obrigatório/
  );
});

test('JSON corrompido: faz backup e devolve lista vazia', async () => {
  const pasta = await criarPasta();
  await fs.writeFile(path.join(pasta, 'dados.json'), '{invalido:', 'utf-8');
  repositorio.inicializar(pasta);
  const bebidas = await repositorio.listar();
  assert.deepStrictEqual(bebidas, []);
  const arquivos = await fs.readdir(pasta);
  assert.ok(arquivos.some((f) => f.includes('corrompido')));
});

test('migração: formato antigo (array puro) é lido sem perda de dados', async () => {
  const pasta = await criarPasta();
  await fs.writeFile(
    path.join(pasta, 'dados.json'),
    JSON.stringify([{ id: 1, nome: 'Legado', categoria: 'Outros', preco: 1, estoque: 1, validade: null }]),
    'utf-8'
  );
  repositorio.inicializar(pasta);
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas.length, 1);
  assert.strictEqual(bebidas[0].nome, 'Legado');
});

test('listarVendas: lista vazia na primeira execução', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const vendas = await repositorio.listarVendas();
  assert.deepStrictEqual(vendas, []);
});

test('registrarVenda: registra a venda e baixa o estoque', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Energético', categoria: 'Energéticos', preco: 8, estoque: 10 });
  const venda = await repositorio.registrarVenda({
    itens: [{ bebidaId: bebida.id, nomeBebida: 'Energético', quantidade: 3, precoUnitario: 8 }],
    formaPagamento: 'Pix',
    descontoPercentual: 0
  });
  assert.strictEqual(typeof venda.pedido, 'string');
  assert.strictEqual(venda.pagamento, 'Pix');
  assert.ok(venda.valor > 0);
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas[0].estoque, 7);
});

test('registrarVenda: recusa quando estoque é insuficiente', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Destilado', categoria: 'Destilados', preco: 50, estoque: 2 });
  await assert.rejects(
    () => repositorio.registrarVenda({
      itens: [{ bebidaId: bebida.id, nomeBebida: 'Destilado', quantidade: 5, precoUnitario: 50 }],
      formaPagamento: 'Dinheiro',
      descontoPercentual: 0
    }),
    /insuficiente/
  );
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas[0].estoque, 2);
});

test('registrarVenda: venda persiste após reinicializar', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Suco', categoria: 'Sucos', preco: 4, estoque: 15 });
  await repositorio.registrarVenda({
    itens: [{ bebidaId: bebida.id, nomeBebida: 'Suco', quantidade: 2, precoUnitario: 4 }],
    formaPagamento: 'Cartão',
    descontoPercentual: 10
  });
  repositorio.inicializar(pasta);
  const vendas = await repositorio.listarVendas();
  assert.strictEqual(vendas.length, 1);
  assert.ok(vendas[0].valor > 0);
});

test('registrarVenda: listarVendas na mesma sessão retorna a venda com estoque decrementado', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Refrigerante', categoria: 'Refrigerantes', preco: 5, estoque: 20 });
  await repositorio.registrarVenda({
    itens: [{ bebidaId: bebida.id, nomeBebida: 'Refrigerante', quantidade: 4, precoUnitario: 5 }],
    formaPagamento: 'Pix',
    descontoPercentual: 0
  });
  // Sem reinicializar: listarVendas deve refletir o registro imediato.
  const vendas = await repositorio.listarVendas();
  assert.strictEqual(vendas.length, 1);
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas[0].estoque, 16);
});

test('registrarVenda: criadoEm é um ISO 8601 válido', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Cerveja', categoria: 'Cervejas', preco: 7, estoque: 12 });
  const venda = await repositorio.registrarVenda({
    itens: [{ bebidaId: bebida.id, nomeBebida: 'Cerveja', quantidade: 1, precoUnitario: 7 }],
    formaPagamento: 'Dinheiro',
    descontoPercentual: 0
  });
  assert.ok(typeof venda.criadoEm === 'string', 'criadoEm deve ser string');
  assert.ok(!isNaN(Date.parse(venda.criadoEm)), 'criadoEm deve ser ISO válido');
  // Não deve conter o campo legado "horario".
  assert.strictEqual(venda.horario, undefined);
});

test('registrarVenda: estoque insuficiente não grava nenhuma venda', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Vinho', categoria: 'Vinhos', preco: 40, estoque: 1 });
  await assert.rejects(
    () => repositorio.registrarVenda({
      itens: [{ bebidaId: bebida.id, nomeBebida: 'Vinho', quantidade: 3, precoUnitario: 40 }],
      formaPagamento: 'Cartão',
      descontoPercentual: 0
    }),
    /insuficiente/
  );
  const vendas = await repositorio.listarVendas();
  assert.strictEqual(vendas.length, 0, 'nenhuma venda deve ter sido gravada');
  const bebidas = await repositorio.listar();
  assert.strictEqual(bebidas[0].estoque, 1, 'estoque não deve ter sido alterado');
});

test('registrarVenda: linhas persistem com nomeBebida, quantidade e precoUnitario', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const bebida = await repositorio.salvar({ nome: 'Agua Mineral', categoria: 'Águas', preco: 3, estoque: 10 });
  const venda = await repositorio.registrarVenda({
    itens: [{ bebidaId: bebida.id, nomeBebida: 'Agua Mineral', quantidade: 2, precoUnitario: 3 }],
    formaPagamento: 'Dinheiro',
    descontoPercentual: 0
  });
  assert.ok(Array.isArray(venda.linhas) && venda.linhas.length === 1, 'linhas deve ter 1 entrada');
  assert.strictEqual(venda.linhas[0].nomeBebida, 'Agua Mineral');
  assert.strictEqual(venda.linhas[0].quantidade, 2);
  assert.strictEqual(venda.linhas[0].precoUnitario, 3);
  // Persiste após reinicialização.
  repositorio.inicializar(pasta);
  const [vendaPersistida] = await repositorio.listarVendas();
  assert.strictEqual(vendaPersistida.linhas[0].nomeBebida, 'Agua Mineral');
});

test('registrarVenda: itens reflete a soma das quantidades, não o número de linhas', async () => {
  const pasta = await criarPasta();
  repositorio.inicializar(pasta);
  const b1 = await repositorio.salvar({ nome: 'Cerveja A', categoria: 'Cervejas', preco: 6, estoque: 20 });
  const b2 = await repositorio.salvar({ nome: 'Cerveja B', categoria: 'Cervejas', preco: 7, estoque: 20 });
  const venda = await repositorio.registrarVenda({
    itens: [
      { bebidaId: b1.id, nomeBebida: 'Cerveja A', quantidade: 3, precoUnitario: 6 },
      { bebidaId: b2.id, nomeBebida: 'Cerveja B', quantidade: 2, precoUnitario: 7 }
    ],
    formaPagamento: 'Pix',
    descontoPercentual: 0
  });
  // 2 linhas, mas soma de quantidades = 5.
  assert.strictEqual(venda.itens, '5 itens', 'itens deve somar quantidades, não contar linhas');
});

test('dataVenda: criadoEm → Date; id legado de hoje e de ontem → Date; id inválido → null', () => {
  const { dataVenda } = require('../src/datas');

  // criadoEm sempre tem prioridade.
  const agora = new Date();
  const d1 = dataVenda({ id: 1, criadoEm: agora.toISOString() });
  assert.ok(d1 instanceof Date, 'criadoEm deve retornar Date');
  assert.strictEqual(d1.toDateString(), agora.toDateString());

  // id legado de hoje (timestamp de milissegundos).
  const tsHoje = Date.now();
  const d2 = dataVenda({ id: tsHoje });
  assert.ok(d2 instanceof Date, 'id timestamp de hoje deve retornar Date');
  assert.strictEqual(d2.toDateString(), new Date().toDateString());

  // id legado de ontem.
  const tsOntem = Date.now() - 86_400_000;
  const d3 = dataVenda({ id: tsOntem });
  assert.ok(d3 instanceof Date, 'id timestamp de ontem deve retornar Date');
  const ontem = new Date(tsOntem);
  assert.strictEqual(d3.toDateString(), ontem.toDateString());

  // id pequeno (número de pedido, não timestamp) → null.
  assert.strictEqual(dataVenda({ id: 1049 }), null, 'id de pedido deve retornar null');

  // id string → null.
  assert.strictEqual(dataVenda({ id: '#1050' }), null, 'id string deve retornar null');
});
