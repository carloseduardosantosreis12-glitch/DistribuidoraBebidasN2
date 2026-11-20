// Processo principal: cria a janela, instala o menu nativo e encaminha pedidos IPC.
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('node:path');
const repositorio = require('./repositorio');

let janela;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Distribuidora — Controle de Estoque',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  janela.loadFile(path.join(__dirname, 'src', 'index.html'));
  janela.on('closed', () => { janela = null; });
}

function criarMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Arquivo', submenu: [
      { label: 'Novo cadastro de bebida', accelerator: 'CmdOrCtrl+N', click: () => janela?.webContents.send('bebidas:nova') },
      { type: 'separator' }, { role: 'quit', label: 'Sair' }
    ] },
    { label: 'Editar', submenu: [
      { role: 'undo', label: 'Desfazer' },
      { role: 'redo', label: 'Refazer' },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Colar' },
      { role: 'selectAll', label: 'Selecionar tudo' },
      { type: 'separator' },
      { label: 'Pesquisar bebidas', accelerator: 'CmdOrCtrl+F', click: () => janela?.webContents.send('menu:buscar') }
    ] },
    { label: 'Exibir', submenu: [
      { role: 'reload', label: 'Recarregar' },
      { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }
    ] },
    { label: 'Ajuda', submenu: [{ role: 'about', label: 'Sobre' }] }
  ]);
  Menu.setApplicationMenu(menu);
}

// IPC: o processo principal recebe a solicitação e delega a leitura/escrita ao repositório.
ipcMain.handle('bebidas:listar', async () => ({ ok: true, dados: await repositorio.listar() }));
ipcMain.handle('bebidas:salvar', async (_evento, bebida) => ({ ok: true, dados: await repositorio.salvar(bebida) }));
ipcMain.handle('bebidas:excluir', async (_evento, id) => {
  const resposta = await dialog.showMessageBox(janela, {
    type: 'warning', title: 'Excluir bebida',
    message: 'Deseja realmente excluir esta bebida?', detail: 'Esta ação não pode ser desfeita.',
    buttons: ['Cancelar', 'Excluir'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (resposta.response !== 1) return { ok: true, dados: false };
  await repositorio.excluir(id);
  return { ok: true, dados: true };
});

app.whenReady().then(async () => {
  await repositorio.inicializar();
  criarJanela();
  criarMenu();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
