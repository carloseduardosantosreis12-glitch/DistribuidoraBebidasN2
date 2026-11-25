# Distribuidora de Bebidas — Controle de Estoque

Aplicação desktop feita com Electron, HTML, CSS e JavaScript puro. Sem frameworks de front-end.

## Instalação e execução

```
npm install
npm start
```

## Testes

```
npm test
```

Executa 13 testes do `repositorio.js` usando `node:test` (sem dependências externas).

## Estrutura

```
application/
├── main.js          Janela, menu nativo e handlers IPC
├── preload.js       Ponte segura (contextBridge) entre renderer e processo principal
├── repositorio.js   Leitura e gravação do arquivo JSON (dados.json)
├── src/
│   ├── index.html   Interface única com Dashboard, Nova Venda, Estoque, Vendas e Relatórios
│   ├── style.css    Estilos da aplicação
│   └── renderer.js  Lógica da interface (sem require, fs ou process)
├── test/
│   └── repositorio.test.js  Testes do repositório
└── docs/
    └── IMPLEMENTACAO.md     Decisões de implementação
```

## Dados

O arquivo `dados.json` fica na pasta de dados do Electron:

- Windows: `%APPDATA%\distribuidora-bebidas-electron\dados.json`
- macOS: `~/Library/Application Support/distribuidora-bebidas-electron/dados.json`
- Linux: `~/.config/distribuidora-bebidas-electron/dados.json`

O menu **Arquivo > Abrir pasta de dados** abre essa pasta diretamente no explorador.

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
