// Lógica de data pura — sem DOM, sem require('electron').
// Carregável pelo renderer via <script src="datas.js"> e pelo node:test via require('../src/datas').

function dataVenda(venda) {
  if (venda.criadoEm) return new Date(venda.criadoEm);
  if (typeof venda.id === 'number' && venda.id > 1e12 && venda.id <= Date.now() + 86_400_000) {
    return new Date(venda.id);
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { dataVenda };
