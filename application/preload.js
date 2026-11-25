// Ponte segura: somente as operações necessárias chegam ao renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listarBebidas: () => ipcRenderer.invoke('bebidas:listar'),
  salvarBebida: (bebida) => ipcRenderer.invoke('bebidas:salvar', bebida),
  excluirBebida: (id) => ipcRenderer.invoke('bebidas:excluir', id),
  aoSolicitarNovoCadastro: (callback) => ipcRenderer.on('bebidas:nova', () => callback()),
  aoSolicitarBusca: (callback) => ipcRenderer.on('menu:buscar', () => callback())
});
