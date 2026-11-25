// Ponte segura: somente as operações necessárias chegam ao renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  carregarProdutos: () => ipcRenderer.invoke('produtos:carregar'),
  salvarProduto: (bebida) => ipcRenderer.invoke('produtos:salvar', bebida),
  excluirProduto: (id) => ipcRenderer.invoke('produtos:excluir', id),
  listarVendas: () => ipcRenderer.invoke('vendas:listar'),
  registrarVenda: (dados) => ipcRenderer.invoke('vendas:registrar', dados),
  aoNovoProduto: (callback) => ipcRenderer.on('menu:novo-produto', () => callback()),
  aoSolicitarBusca: (callback) => ipcRenderer.on('menu:buscar', () => callback())
});
