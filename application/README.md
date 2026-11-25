# Distribuidora de Bebidas

Aplicação desktop feita com Electron, HTML, CSS e JavaScript.

## Executar

Abra o terminal nesta pasta e rode:

```powershell
npm.cmd install
npm.cmd start
```

## Estrutura

- `main.js`: janela, menu nativo e comunicação IPC.
- `preload.js`: ponte segura entre a tela e o processo principal.
- `repositorio.js`: leitura e gravação do arquivo JSON de bebidas.
- `src/index.html`, `src/style.css`, `src/renderer.js`: interface da aplicação.

Os dados são guardados em `bebidas.json` dentro da pasta de dados do Electron. Na primeira abertura, o sistema cria uma lista vazia.
