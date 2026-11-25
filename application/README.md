# Distribuidora de Bebidas — Controle de Estoque

Aplicação desktop desenvolvida com Electron, HTML, CSS e JavaScript puro, sem frameworks de front-end.

O sistema permite que operadores de balcão cadastrem bebidas, registrem vendas, acompanhem o estoque em tempo real e consultem relatórios de faturamento. Todos os dados são armazenados localmente em um arquivo JSON, sem necessidade de servidor ou conexão com a internet.

## Integrantes

- João Gabriel Castro Silva
- Carlos Eduardo Santos Reis
- Kauã de Oliveira Sousa

## Funcionalidades

- **Dashboard** — visão geral do dia: faturamento, número de pedidos, produtos com estoque baixo e gráfico dos últimos 7 dias.
- **Nova Venda** — catálogo de produtos com busca e filtro por categoria; montagem do pedido com controle de quantidade, desconto percentual e escolha da forma de pagamento; finalização com baixa automática de estoque.
- **Vendas** — histórico completo de pedidos com filtro por pagamento e busca por número; KPIs do dia; modal de detalhes com a lista de itens de cada venda.
- **Estoque** — tabela de produtos com SKU gerado automaticamente, status de estoque (em estoque, estoque baixo, sem estoque) e formulário de cadastro e edição.
- **Relatórios** — faturamento total, ticket médio, valor em estoque, ranking de produtos mais vendidos e distribuição por forma de pagamento e categoria.

## Instalação e execução

```
npm install
npm start
```

## Testes

```
npm test
```

Executa 19 testes unitários do `repositorio.js` com `node:test` (sem dependências externas). Cobrem criação, edição, exclusão, persistência, migração de formato legado, validações, registro de vendas e baixa de estoque.

## Estrutura

```
application/
├── main.js          Janela, menu nativo e handlers IPC
├── preload.js       Ponte segura (contextBridge) entre renderer e processo principal
├── repositorio.js   Leitura e gravação do arquivo JSON (dados.json)
├── src/
│   ├── index.html   Interface única com as cinco telas e dois modais
│   ├── style.css    Estilos da aplicação
│   ├── datas.js     Lógica de data pura, compartilhada entre renderer e testes
│   └── renderer.js  Lógica da interface (sem require, fs ou process)
└── test/
    └── repositorio.test.js  Testes do repositório
```

## Dados

O arquivo `dados.json` fica na pasta de dados do Electron:

- Windows: `%APPDATA%\distribuidora-bebidas-electron\dados.json`
- macOS: `~/Library/Application Support/distribuidora-bebidas-electron/dados.json`
- Linux: `~/.config/distribuidora-bebidas-electron/dados.json`

O menu **Arquivo > Abrir pasta de dados** abre essa pasta diretamente no explorador.

## Segurança

A janela roda com `sandbox: true`, `contextIsolation: true` e `nodeIntegration: false`. A Content Security Policy bloqueia scripts e estilos externos ou inline. Navegação e abertura de janelas filhas são bloqueadas pelo processo principal.

## Canais IPC

| Canal | Direção | Descrição |
|---|---|---|
| `produtos:carregar` | renderer → main | Lista todos os produtos |
| `produtos:salvar` | renderer → main | Cria ou atualiza um produto |
| `produtos:excluir` | renderer → main | Exclui um produto (confirma via diálogo nativo) |
| `vendas:listar` | renderer → main | Lista todas as vendas registradas |
| `vendas:registrar` | renderer → main | Registra uma venda e baixa o estoque |
| `menu:novo-produto` | main → renderer | Abre o formulário de novo produto (Ctrl+N) |
| `menu:buscar` | main → renderer | Foca a busca de produtos (Ctrl+F) |

## Atalhos

| Atalho | Ação |
|---|---|
| Ctrl+N | Novo produto |
| Ctrl+F | Pesquisar bebidas |
| Ctrl+Q | Sair |
| F2 | Ir para Nova Venda |
