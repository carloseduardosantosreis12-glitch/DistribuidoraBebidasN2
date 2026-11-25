// Processo principal: cria a janela, instala o menu nativo e encaminha pedidos IPC.
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
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
      nodeIntegration: false,
      sandbox: true,
    }
  });
  janela.loadFile(path.join(__dirname, 'src', 'index.html'));
  janela.on('closed', () => { janela = null; });
  janela.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function criarMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Arquivo', submenu: [
      { label: 'Novo produto', accelerator: 'CmdOrCtrl+N', click: () => janela?.webContents.send('menu:novo-produto') },
      { label: 'Abrir pasta de dados', click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: 'Sair', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
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
      { role: 'zoomIn', label: 'Aumentar zoom' },
      { role: 'zoomOut', label: 'Diminuir zoom' },
      { role: 'resetZoom', label: 'Restaurar zoom' },
      { role: 'togglefullscreen', label: 'Tela cheia' },
      ...(!app.isPackaged ? [{ role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }] : [])
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Sobre', click: () => dialog.showMessageBox(janela, {
        type: 'info', title: 'Sobre',
        message: 'Distribuidora — Controle de Estoque',
        detail: 'Versão 1.0.0\nProgramação Desktop N2',
        buttons: ['OK']
      }) }
    ] }
  ]);
  Menu.setApplicationMenu(menu);
}

// IPC: o processo principal recebe a solicitação e delega a leitura/escrita ao repositório.
ipcMain.handle('produtos:carregar', async () => ({ ok: true, dados: await repositorio.listar() }));
ipcMain.handle('produtos:salvar', async (_evento, bebida) => ({ ok: true, dados: await repositorio.salvar(bebida) }));
ipcMain.handle('produtos:excluir', async (_evento, id) => {
  const resposta = await dialog.showMessageBox(janela, {
    type: 'warning', title: 'Excluir produto',
    message: 'Deseja realmente excluir este produto?', detail: 'Esta ação não pode ser desfeita.',
    buttons: ['Cancelar', 'Excluir'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (resposta.response !== 1) return { ok: true, dados: false };
  await repositorio.excluir(id);
  return { ok: true, dados: true };
});
ipcMain.handle('vendas:listar', async () => ({ ok: true, dados: await repositorio.listarVendas() }));
ipcMain.handle('vendas:registrar', async (_evento, dadosVenda) => ({ ok: true, dados: await repositorio.registrarVenda(dadosVenda) }));

app.whenReady().then(async () => {
  repositorio.inicializar(app.getPath('userData'));
  criarJanela();
  criarMenu();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
