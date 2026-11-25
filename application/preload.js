// Ponte segura: somente as operações necessárias chegam ao renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listarBebidas: () => ipcRenderer.invoke('bebidas:listar'),
  salvarBebida: (bebida) => ipcRenderer.invoke('bebidas:salvar', bebida),
  excluirBebida: (id) => ipcRenderer.invoke('bebidas:excluir', id),
  // Renomeado de aoSolicitarNovoCadastro; canal atualizado para menu:novo-produto.
  aoNovoProduto: (callback) => ipcRenderer.on('menu:novo-produto', () => callback()),
  aoSolicitarBusca: (callback) => ipcRenderer.on('menu:buscar', () => callback())
});
