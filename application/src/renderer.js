// renderer.js — Dashboard, Nova Venda, Estoque, Vendas e Relatórios.

const rotuloCategoria = {
  REFRIGERANTE: "Refrigerantes", AGUA: "Águas", SUCO: "Sucos", CERVEJA: "Cervejas",
  ENERGETICO: "Energéticos", VINHO: "Vinhos", DESTILADO: "Destilados", OUTRO: "Outros"
};

let bebidas = [];
let carrinho = [];
let categoriaAtiva = "Todos";
let categoriaEstoqueAtiva = "Todas";
let vendas = [];

// Fragmentos SVG reutilizados em templates gerados dinamicamente.
const SVG_PLUS_SM  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const SVG_MINUS_SM = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const SVG_X_SM     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const SVG_PLUS_MD  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

// Texto "N item(ns)" para a coluna Itens e o rodapé do modal de detalhes.
// Se a venda tem linhas, soma as quantidades; caso contrário usa o texto gravado em venda.itens.
function quantidadeItens(venda) {
  if (Array.isArray(venda.linhas) && venda.linhas.length > 0) {
    const total = venda.linhas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
    return `${total} ${total === 1 ? 'item' : 'itens'}`;
  }
  return venda.itens || '—';
}

const nomesDeTela = { dashboard: "Dashboard", venda: "Nova Venda", estoque: "Estoque", vendas: "Vendas", relatorios: "Relatórios" };

const porId = (id) => bebidas.find((bebida) => bebida.id === Number(id));
const formatoMoeda = (valor) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor) || 0);
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Formata a data/hora da venda usando dataVenda(); retorna venda.horario se a data for null.
function horarioVenda(venda) {
  const d = dataVenda(venda);
  if (d !== null) {
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (eHoje(d)) return `Hoje, ${hora}`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
  }
  return venda.horario || "—";
}

// Retorna true se o Date passado pertence ao dia local atual. Null/undefined retorna false.
function eHoje(data) {
  return data !== null && data !== undefined && data.toDateString() === new Date().toDateString();
}

// Soma de valor por dia nos últimos 7 dias (índice 6 = hoje) usando criadoEm.
function vendasPorDia7(lista) {
  const hoje = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() - (6 - i));
    const diaStr = dia.toDateString();
    return lista.reduce((soma, venda) => {
      const d = dataVenda(venda);
      if (!d) return soma;
      return d.toDateString() === diaStr ? soma + (Number(venda.valor) || 0) : soma;
    }, 0);
  });
}

// Trata o envelope { ok, dados } e relança como Error se ok === false.
function conferirResposta(resposta) {
  if (resposta && resposta.ok === false) throw new Error(resposta.erro || resposta.mensagem || "A solicitação não pôde ser concluída.");
  if (resposta && resposta.ok === true) return resposta.dados ?? resposta.data ?? resposta.valor ?? resposta;
  return resposta;
}

// Monta o gráfico de colunas usando createElement + CSSOM (style inline bloqueado pela CSP).
function desenharGrafico(valores7) {
  const valores = Array.isArray(valores7) && valores7.length === 7 ? valores7 : [0, 0, 0, 0, 0, 0, 0];
  const dias = ["Qui", "Sex", "Sáb", "Dom", "Seg", "Ter", "Hoje"];
  const maior = Math.max(...valores, 1);
  const container = document.querySelector("#sales-chart");
  container.innerHTML = "";
  valores.forEach((valor, i) => {
    const altura = valor === 0 ? 4 : Math.max(8, Math.round((valor / maior) * 120));
    const col = document.createElement("div");
    col.className = `chart-column${i === 6 ? " today" : ""}`;
    const valEl = document.createElement("span"); valEl.className = "chart-value";
    valEl.textContent = valor ? `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : "";
    const bar = document.createElement("div"); bar.className = "chart-bar"; bar.style.height = `${altura}px`;
    const dayEl = document.createElement("span"); dayEl.className = "chart-day"; dayEl.textContent = dias[i];
    col.appendChild(valEl); col.appendChild(bar); col.appendChild(dayEl);
    container.appendChild(col);
  });
}

// Preenche os KPIs do dashboard com vendas do dia atual, ranking de mais vendidos e tabela recente.
function atualizarDashboard() {
  const vendasHoje = vendas.filter((v) => eHoje(dataVenda(v)));
  const totalHoje = vendasHoje.reduce((soma, v) => soma + (Number(v.valor) || 0), 0);
  document.querySelector("#stat-today").textContent = formatoMoeda(totalHoje);
  document.querySelector("#stat-orders").textContent = vendasHoje.length;
  document.querySelector("#stat-products").textContent = bebidas.length;
  document.querySelector("#stat-low").textContent = bebidas.filter((b) => b.estoque <= 10).length;
  document.querySelector("#stat-trend").textContent = "—";
  document.querySelector("#stat-orders-trend").textContent = "—";

  const vendidos = {};
  vendas.forEach((v) => (v.linhas || []).forEach((l) => {
    vendidos[l.bebidaId] = (vendidos[l.bebidaId] || 0) + (Number(l.quantidade) || 0);
  }));
  const maisVendidos = [...bebidas].sort((a, b) => (vendidos[b.id] || 0) - (vendidos[a.id] || 0)).slice(0, 4);
  document.querySelector("#best-sellers").innerHTML = maisVendidos.map((b, i) =>
    `<div class="rank-row"><span class="rank-number">${i + 1}</span><span class="rank-name">${escapar(b.nome)}</span><span class="rank-qty">${(vendidos[b.id] || 0).toLocaleString("pt-BR")} un.</span></div>`
  ).join("");

  document.querySelector("#recent-sales").innerHTML = vendas.slice(0, 5).map((v) =>
    `<tr><td>${escapar(v.pedido)}</td><td>${escapar(horarioVenda(v))}</td><td>${escapar(quantidadeItens(v))}</td><td>${escapar(v.pagamento)}</td><td>${formatoMoeda(v.valor)}</td></tr>`
  ).join("");

  desenharGrafico(vendasPorDia7(vendas));
}

// Chips de categoria e cartões de produto com SVG no botão "+".
function desenharCatalogo() {
  const busca = document.querySelector("#product-search").value.trim().toLocaleLowerCase("pt-BR");
  const categorias = ["Todos", ...new Set(bebidas.map((b) => b.categoria))];
  document.querySelector("#category-tabs").innerHTML = categorias.map((cat) =>
    `<button class="category-tab ${cat === categoriaAtiva ? "active" : ""}" data-category="${escapar(cat)}" type="button">${escapar(cat)}</button>`
  ).join("");

  const produtos = bebidas.filter((b) => {
    const sku = String(b.id).padStart(3, "0");
    return (categoriaAtiva === "Todos" || b.categoria === categoriaAtiva) &&
      `${b.nome} ${b.marca || ""} ${sku}`.toLocaleLowerCase("pt-BR").includes(busca);
  });

  const grid = document.querySelector("#product-grid");
  if (!produtos.length) {
    grid.innerHTML = '<div class="empty-products">Nenhum produto encontrado para esta busca.</div>';
    return;
  }
  grid.innerHTML = produtos.map((b) => {
    const noPedido = carrinho.find((item) => item.id === b.id)?.quantidade || 0;
    return `<button class="product-card" data-product="${b.id}" type="button" ${b.estoque <= 0 ? "disabled" : ""}>
      ${noPedido ? `<span class="in-cart">${noPedido} no pedido</span>` : ""}
      <span class="product-category">${escapar(b.categoria)}</span>
      <span class="product-name">${escapar(b.nome)}</span>
      <span class="product-meta">${escapar(b.marca || b.categoria)} · estoque ${b.estoque}</span>
      <div class="product-footer"><strong class="product-price">${formatoMoeda(b.preco)}</strong><span class="product-add" aria-hidden="true">${SVG_PLUS_MD}</span></div>
    </button>`;
  }).join("");
}

// Itens do pedido com SVG nos controles de quantidade e remoção.
function desenharPedido() {
  const totalItens = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
  document.querySelector("#empty-order").classList.toggle("hidden", carrinho.length > 0);
  document.querySelector("#order-items").innerHTML = carrinho.map((item) =>
    `<article class="order-item">
      <div class="order-item-top"><span class="order-item-name">${escapar(item.nome)}</span><strong class="order-item-subtotal">${formatoMoeda(item.preco * item.quantidade)}</strong></div>
      <div class="order-item-meta"><span>${formatoMoeda(item.preco)} cada</span>
      <span class="qty-controls">
        <button type="button" class="qty-btn" data-qty="-1" data-id="${item.id}" aria-label="Diminuir quantidade">${SVG_MINUS_SM}</button>
        <b>${item.quantidade}</b>
        <button type="button" class="qty-btn" data-qty="1" data-id="${item.id}" aria-label="Aumentar quantidade">${SVG_PLUS_SM}</button>
        <button class="remove-item" type="button" data-remove="${item.id}" aria-label="Remover ${escapar(item.nome)}">${SVG_X_SM}</button>
      </span></div>
    </article>`
  ).join("");
  document.querySelector("#order-number").textContent = `#1049 · Balcão 01 · ${totalItens} ${totalItens === 1 ? "item" : "itens"}`;

  const subtotal = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const descontoPercentual = Math.min(100, Math.max(0, Number(document.querySelector("#discount-input").value) || 0));
  const desconto = subtotal * descontoPercentual / 100;
  document.querySelector("#subtotal-value").textContent = formatoMoeda(subtotal);
  document.querySelector("#discount-value").textContent = `${formatoMoeda(desconto)}`;
  document.querySelector("#total-value").textContent = formatoMoeda(subtotal - desconto);
  document.querySelector("#finish-sale").disabled = carrinho.length === 0;
  const btnLimpar = document.querySelector("#clear-cart");
  btnLimpar.disabled = carrinho.length === 0;
  desenharCatalogo();
}

function skuDaBebida(bebida) {
  const prefixos = { Cervejas: "BEB", Refrigerantes: "REF", Águas: "AGU", Sucos: "SUC", Energéticos: "ENE", Vinhos: "VIN", Destilados: "DES", Outros: "OUT" };
  return `${prefixos[bebida.categoria] || "OUT"}-${String(bebida.id).padStart(3, "0")}`;
}

function desenharEstoque() {
  const busca = document.querySelector("#stock-search").value.trim().toLocaleLowerCase("pt-BR");
  const seletor = document.querySelector("#stock-category");
  const categorias = [...new Set(bebidas.map((b) => b.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (categoriaEstoqueAtiva !== "Todas" && !categorias.includes(categoriaEstoqueAtiva)) categoriaEstoqueAtiva = "Todas";
  seletor.innerHTML = ['<option value="Todas">Todas as categorias</option>', ...categorias.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`)].join("");
  seletor.value = categoriaEstoqueAtiva;

  const totalUnidades = bebidas.reduce((s, b) => s + (Number(b.estoque) || 0), 0);
  document.querySelector("#stock-summary").textContent = `${bebidas.length} ${bebidas.length === 1 ? "produto cadastrado" : "produtos cadastrados"} · ${totalUnidades.toLocaleString("pt-BR")} ${totalUnidades === 1 ? "unidade" : "unidades"} em estoque`;

  const produtos = bebidas.filter((b) => {
    const sku = skuDaBebida(b);
    return `${b.nome} ${sku} ${b.marca || ""}`.toLocaleLowerCase("pt-BR").includes(busca) &&
      (categoriaEstoqueAtiva === "Todas" || b.categoria === categoriaEstoqueAtiva);
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const tabela = document.querySelector("#stock-table-body");
  const vazio = document.querySelector("#stock-empty");
  if (!produtos.length) {
    tabela.innerHTML = "";
    vazio.classList.remove("hidden");
    const nenhumCadastrado = bebidas.length === 0 && !busca && categoriaEstoqueAtiva === "Todas";
    document.querySelector("#stock-empty-title").textContent = nenhumCadastrado ? "Nenhum produto cadastrado" : "Nenhum resultado encontrado";
    document.querySelector("#stock-empty-description").textContent = nenhumCadastrado ? "Cadastre uma bebida para começar a controlar o estoque." : "Tente mudar a busca ou escolher outra categoria.";
    return;
  }
  vazio.classList.add("hidden");
  tabela.innerHTML = produtos.map((b) => {
    const u = Number(b.estoque) || 0;
    const cls = u === 0 ? "out" : u <= 10 ? "low" : "";
    const txt = u === 0 ? "Sem estoque" : u <= 10 ? "Estoque baixo" : "Em estoque";
    return `<tr>
      <td>${skuDaBebida(b)}</td><td>${escapar(b.nome)}</td><td>${escapar(b.categoria || "Outros")}</td>
      <td>${u.toLocaleString("pt-BR")} un.</td><td>${formatoMoeda(b.preco)}</td>
      <td><span class="stock-status ${cls}">${txt}</span></td>
      <td><div class="stock-actions"><button class="stock-action" type="button" data-edit-product="${b.id}">Editar</button><button class="stock-action delete" type="button" data-delete-product="${b.id}">Excluir</button></div></td>
    </tr>`;
  }).join("");
}

function abrirFormularioProduto(bebida = null) {
  const formulario = document.querySelector("#product-form");
  formulario.reset();
  document.querySelector("#product-id").value = bebida?.id ?? "";
  document.querySelector("#product-name").value = bebida?.nome ?? "";
  document.querySelector("#product-brand").value = bebida?.marca ?? "";
  document.querySelector("#product-category").value = bebida?.categoria ?? "";
  document.querySelector("#product-price").value = bebida?.preco ?? "";
  document.querySelector("#product-stock").value = bebida?.estoque ?? "";
  document.querySelector("#product-expiry").value = bebida?.validade ?? "";
  document.querySelector("#product-dialog-title").textContent = bebida ? "Editar produto" : "Novo produto";
  document.querySelector("#save-product-button").textContent = bebida ? "Salvar alterações" : "Salvar produto";
  document.querySelector("#product-form-message").textContent = "";
  document.querySelector("#product-dialog").showModal();
  document.querySelector("#product-name").focus();
}

// Recarrega bebidas E vendas do IPC; fonte única para ambas as telas.
async function recarregarDados() {
  if (window.api?.carregarProdutos) {
    const r = conferirResposta(await window.api.carregarProdutos());
    bebidas = Array.isArray(r) ? r.map((b) => ({ ...b, categoria: b.categoria?.label || rotuloCategoria[b.categoria] || b.categoria || "Outros" })) : [];
  }
  if (window.api?.listarVendas) {
    const r = conferirResposta(await window.api.listarVendas());
    if (Array.isArray(r)) vendas = r;
  }
  desenharEstoque();
  desenharCatalogo();
  desenharPedido();
  atualizarDashboard();
}

// Tela Vendas: KPIs filtrados para o dia atual; tabela com todos os pedidos.
let pagamentoVendasAtivo = "Todos";

function desenharVendas() {
  const busca = document.querySelector("#sales-search").value.trim().toLocaleLowerCase("pt-BR");
  const seletor = document.querySelector("#sales-payment");
  const formas = [...new Set(vendas.map((v) => v.pagamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (pagamentoVendasAtivo !== "Todos" && !formas.includes(pagamentoVendasAtivo)) pagamentoVendasAtivo = "Todos";
  seletor.innerHTML = ['<option value="Todos">Todas as formas de pagamento</option>', ...formas.map((f) => `<option value="${escapar(f)}">${escapar(f)}</option>`)].join("");
  seletor.value = pagamentoVendasAtivo;

  // KPIs sempre do dia atual, independente do filtro da tabela.
  const vendasHoje = vendas.filter((v) => eHoje(dataVenda(v)));
  const fatHoje = vendasHoje.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  document.querySelector("#sales-count").textContent = vendasHoje.length;
  document.querySelector("#sales-revenue").textContent = formatoMoeda(fatHoje);
  document.querySelector("#sales-average").textContent = formatoMoeda(vendasHoje.length ? fatHoje / vendasHoje.length : 0);

  const vendasFiltradas = vendas.filter((v) =>
    String(v.pedido).toLocaleLowerCase("pt-BR").includes(busca) &&
    (pagamentoVendasAtivo === "Todos" || v.pagamento === pagamentoVendasAtivo)
  );
  document.querySelector("#sales-summary").textContent = `${vendasFiltradas.length} ${vendasFiltradas.length === 1 ? "venda registrada" : "vendas registradas"}`;

  const vazio = document.querySelector("#sales-empty");
  const tabela = document.querySelector("#sales-table-body");
  if (!vendasFiltradas.length) {
    tabela.innerHTML = "";
    vazio.classList.remove("hidden");
    document.querySelector("#sales-empty-title").textContent = vendas.length === 0 ? "Nenhuma venda registrada" : "Nenhum resultado encontrado";
    document.querySelector("#sales-empty-description").textContent = vendas.length === 0 ? "As vendas concluídas em Nova Venda aparecem aqui." : "Tente mudar a busca ou escolher outra forma de pagamento.";
    return;
  }
  vazio.classList.add("hidden");
  tabela.innerHTML = vendasFiltradas.map((v) =>
    `<tr><td>${escapar(v.pedido)}</td><td>${escapar(horarioVenda(v))}</td><td>${escapar(quantidadeItens(v))}</td><td>${escapar(v.pagamento)}</td><td>${formatoMoeda(v.valor)}</td><td><span class="status-pill">${escapar(v.status || "Concluída")}</span></td><td><div class="stock-actions"><button class="stock-action" type="button" data-sale-id="${Number(v.id) || 0}">Ver</button></div></td></tr>`
  ).join("");
}

let _ultimoFocusDetalhe = null;

function abrirDetalheVenda(venda) {
  document.querySelector("#sale-detail-title").textContent = venda.pedido || "Pedido";
  document.querySelector("#sale-detail-subtitle").textContent =
    `${horarioVenda(venda)} · ${escapar(venda.pagamento || "—")} · ${escapar(venda.status || "Concluída")}`;

  const linhas = Array.isArray(venda.linhas) && venda.linhas.length > 0 ? venda.linhas : null;
  const legacy = document.querySelector("#sale-detail-legacy");
  const tbody = document.querySelector("#sale-detail-items");

  if (linhas) {
    legacy.classList.add("hidden");
    tbody.innerHTML = linhas.map((l) => {
      const subtotal = (Number(l.precoUnitario) || 0) * (Number(l.quantidade) || 0);
      return `<tr><td>${escapar(l.nomeBebida || "—")}</td><td class="num">${Number(l.quantidade).toLocaleString("pt-BR")}</td><td class="num">${formatoMoeda(l.precoUnitario)}</td><td class="num">${formatoMoeda(subtotal)}</td></tr>`;
    }).join("");
    const totalQtd = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
    document.querySelector("#sale-detail-count").textContent = `Total (${totalQtd} ${totalQtd === 1 ? "item" : "itens"})`;
  } else {
    tbody.innerHTML = "";
    legacy.classList.remove("hidden");
    document.querySelector("#sale-detail-count").textContent = `Total (${quantidadeItens(venda)})`;
  }

  document.querySelector("#sale-detail-total").textContent = formatoMoeda(venda.valor);
  const dialog = document.querySelector("#sale-detail-dialog");
  dialog.showModal();
  document.querySelector("#close-sale-detail").focus();
}

function desenharBarras(destino, itens, formatar) {
  const maior = Math.max(...itens.map((item) => item.valor), 1);
  destino.innerHTML = itens.length
    ? itens.map((item) => `<div class="bar-row"><span>${escapar(item.nome)}</span><span class="bar-track"><span class="bar-fill" data-largura="${Math.round((item.valor / maior) * 100)}"></span></span><span class="bar-value">${formatar(item.valor)}</span></div>`).join("")
    : '<div class="bar-empty">Sem dados para mostrar.</div>';
  destino.querySelectorAll("[data-largura]").forEach((el) => { el.style.width = `${el.dataset.largura}%`; });
}

function desenharRelatorios() {
  const faturamento = vendas.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const unidades = bebidas.reduce((s, b) => s + (Number(b.estoque) || 0), 0);
  const valorEstoque = bebidas.reduce((s, b) => s + (Number(b.preco) || 0) * (Number(b.estoque) || 0), 0);
  document.querySelector("#report-revenue").textContent = formatoMoeda(faturamento);
  document.querySelector("#report-orders").textContent = vendas.length;
  document.querySelector("#report-average").textContent = formatoMoeda(vendas.length ? faturamento / vendas.length : 0);
  document.querySelector("#report-stock-value").textContent = formatoMoeda(valorEstoque);
  document.querySelector("#report-stock-units").textContent = `${unidades.toLocaleString("pt-BR")} ${unidades === 1 ? "unidade" : "unidades"} em estoque`;

  const porPagamento = {};
  vendas.forEach((v) => { porPagamento[v.pagamento || "Outros"] = (porPagamento[v.pagamento || "Outros"] || 0) + (Number(v.valor) || 0); });
  desenharBarras(document.querySelector("#report-payments"), Object.entries(porPagamento).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor), formatoMoeda);

  const porCategoria = {};
  bebidas.forEach((b) => { porCategoria[b.categoria || "Outros"] = (porCategoria[b.categoria || "Outros"] || 0) + (Number(b.estoque) || 0); });
  desenharBarras(document.querySelector("#report-categories"), Object.entries(porCategoria).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor), (v) => `${v.toLocaleString("pt-BR")} un.`);

  const vendidos = {};
  vendas.forEach((v) => (v.linhas || []).forEach((l) => { vendidos[l.bebidaId] = (vendidos[l.bebidaId] || 0) + (Number(l.quantidade) || 0); }));
  const ranking = bebidas.map((b) => ({ bebida: b, quantidade: vendidos[b.id] || 0 })).filter((r) => r.quantidade > 0).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
  document.querySelector("#report-products-empty").classList.toggle("hidden", ranking.length > 0);
  document.querySelector("#report-products").innerHTML = ranking.map(({ bebida: b, quantidade }, i) =>
    `<tr><td>${i + 1}</td><td>${escapar(b.nome)}</td><td>${escapar(b.categoria || "Outros")}</td><td>${quantidade.toLocaleString("pt-BR")} un.</td><td>${formatoMoeda(quantidade * (Number(b.preco) || 0))}</td><td>${(Number(b.estoque) || 0).toLocaleString("pt-BR")} un.</td></tr>`
  ).join("");
}

// Atualiza breadcrumb, data e muda a página visível.
function abrirTela(nome) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("hidden", p.id !== `${nome}-page`));
  document.querySelectorAll(".nav-item[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === nome));
  document.querySelector("#sale-date").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date());
  const breadcrumb = document.querySelector("#header-breadcrumb");
  if (breadcrumb) breadcrumb.textContent = nomesDeTela[nome] || nome;
  if (nome === "venda") document.querySelector("#product-search").focus();
  if (nome === "estoque") desenharEstoque();
  if (nome === "vendas") desenharVendas();
  if (nome === "relatorios") desenharRelatorios();
}

// Atualiza o indicador "Salvo às" após qualquer gravação bem-sucedida.
function marcarSalvo() {
  const el = document.querySelector("#header-saved");
  if (!el) return;
  const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  el.textContent = `Salvo às ${hora}`;
}

// Ctrl+F — Nova Venda com foco na busca.
window.api?.aoSolicitarBusca?.(() => {
  abrirTela("venda");
  const campo = document.querySelector("#product-search");
  campo.focus(); campo.select();
});

document.querySelectorAll(".nav-item[data-page], [data-go]").forEach((b) => {
  b.addEventListener("click", () => abrirTela(b.dataset.page || b.dataset.go));
});

// Ctrl+N — abre estoque com formulário de novo produto.
window.api?.aoNovoProduto?.(() => { abrirTela("estoque"); abrirFormularioProduto(); });

document.querySelector("#stock-search").addEventListener("input", desenharEstoque);
document.querySelector("#stock-category").addEventListener("change", (e) => { categoriaEstoqueAtiva = e.target.value; desenharEstoque(); });
document.querySelector("#sales-search").addEventListener("input", desenharVendas);
document.querySelector("#sales-payment").addEventListener("change", (e) => { pagamentoVendasAtivo = e.target.value; desenharVendas(); });
document.querySelector("#new-product-button").addEventListener("click", () => abrirFormularioProduto());
document.querySelector("#close-product-dialog").addEventListener("click", () => document.querySelector("#product-dialog").close());
document.querySelector("#cancel-product-dialog").addEventListener("click", () => document.querySelector("#product-dialog").close());
document.querySelector("#close-sale-detail").addEventListener("click", () => document.querySelector("#sale-detail-dialog").close());
document.querySelector("#close-sale-detail-btn").addEventListener("click", () => document.querySelector("#sale-detail-dialog").close());
document.querySelector("#sale-detail-dialog").addEventListener("close", () => { _ultimoFocusDetalhe?.focus(); _ultimoFocusDetalhe = null; });
document.querySelector("#sales-table-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sale-id]");
  if (!btn) return;
  const id = Number(btn.dataset.saleId);
  const venda = vendas.find((v) => Number(v.id) === id);
  if (!venda) return;
  _ultimoFocusDetalhe = btn;
  abrirDetalheVenda(venda);
});

document.querySelector("#product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.querySelector("#product-form-message");
  const dados = {
    id: document.querySelector("#product-id").value || undefined,
    nome: document.querySelector("#product-name").value.trim(),
    marca: document.querySelector("#product-brand").value.trim(),
    categoria: document.querySelector("#product-category").value,
    preco: Number(document.querySelector("#product-price").value),
    estoque: Number(document.querySelector("#product-stock").value),
    validade: document.querySelector("#product-expiry").value || null
  };
  if (!dados.nome || !dados.categoria || !Number.isFinite(dados.preco) || dados.preco <= 0 || !Number.isInteger(dados.estoque) || dados.estoque < 0) {
    msg.textContent = "Confira os campos: nome, categoria, preço positivo e quantidade inteira."; return;
  }
  const botao = document.querySelector("#save-product-button");
  botao.disabled = true; msg.textContent = "";
  try {
    if (window.api?.salvarProduto) {
      conferirResposta(await window.api.salvarProduto(dados));
    } else {
      const id = dados.id ? Number(dados.id) : Math.max(0, ...bebidas.map((b) => Number(b.id) || 0)) + 1;
      const bebida = { ...dados, id };
      const idx = bebidas.findIndex((b) => b.id === id);
      if (idx >= 0) bebidas[idx] = bebida; else bebidas.push(bebida);
    }
    document.querySelector("#product-dialog").close();
    await recarregarDados();
    marcarSalvo();
  } catch (erro) {
    msg.textContent = erro.message || "Não foi possível salvar o produto.";
  } finally {
    botao.disabled = false;
  }
});

document.querySelector("#stock-table-body").addEventListener("click", async (e) => {
  const editar = e.target.closest("[data-edit-product]");
  const excluir = e.target.closest("[data-delete-product]");
  if (editar) { abrirFormularioProduto(porId(editar.dataset.editProduct)); return; }
  if (!excluir) return;
  const id = Number(excluir.dataset.deleteProduct);
  try {
    if (window.api?.excluirProduto) {
      if (!conferirResposta(await window.api.excluirProduto(id))) return;
    } else {
      if (!window.confirm("Deseja realmente excluir esta bebida?")) return;
      bebidas = bebidas.filter((b) => b.id !== id);
    }
    await recarregarDados();
    marcarSalvo();
  } catch (erro) {
    window.alert(erro.message || "Não foi possível excluir o produto.");
  }
});

document.querySelector("#product-grid").addEventListener("click", (e) => {
  const cartao = e.target.closest("[data-product]");
  if (!cartao) return;
  const bebida = porId(cartao.dataset.product);
  if (!bebida) return;
  const existente = carrinho.find((item) => item.id === bebida.id);
  if (existente) {
    if (existente.quantidade >= bebida.estoque) return;
    existente.quantidade++;
  } else {
    carrinho.push({ id: bebida.id, nome: bebida.nome, preco: bebida.preco, quantidade: 1 });
  }
  document.querySelector("#sale-message").textContent = "";
  desenharPedido();
});

document.querySelector("#product-search").addEventListener("input", desenharCatalogo);
document.querySelector("#category-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-category]");
  if (!b) return;
  categoriaAtiva = b.dataset.category;
  desenharCatalogo();
});

document.querySelector("#order-items").addEventListener("click", (e) => {
  const alterar = e.target.closest("[data-qty]");
  const remover = e.target.closest("[data-remove]");
  if (alterar) {
    const item = carrinho.find((l) => l.id === Number(alterar.dataset.id));
    const bebida = porId(alterar.dataset.id);
    if (!item) return;
    item.quantidade += Number(alterar.dataset.qty);
    if (item.quantidade <= 0) carrinho = carrinho.filter((l) => l.id !== item.id);
    if (bebida && item.quantidade > bebida.estoque) item.quantidade = bebida.estoque;
  } else if (remover) {
    carrinho = carrinho.filter((l) => l.id !== Number(remover.dataset.remove));
  } else return;
  desenharPedido();
});

document.querySelector("#discount-input").addEventListener("input", desenharPedido);
document.querySelector("#clear-cart").addEventListener("click", () => { carrinho = []; desenharPedido(); });

document.addEventListener("keydown", (e) => {
  if (e.key === "F2") { e.preventDefault(); abrirTela("venda"); document.querySelector("#product-search").focus(); }
});

// Finaliza venda via IPC; confere resposta antes de limpar o carrinho.
document.querySelector("#finish-sale").addEventListener("click", async () => {
  const dadosVenda = {
    itens: carrinho.map(({ id, nome, preco, quantidade }) => ({ bebidaId: id, nomeBebida: nome, quantidade, precoUnitario: preco })),
    formaPagamento: document.querySelector("#payment-method").value,
    descontoPercentual: Number(document.querySelector("#discount-input").value) || 0
  };
  const botao = document.querySelector("#finish-sale");
  const msgEl = document.querySelector("#sale-message");
  botao.disabled = true;
  msgEl.classList.remove("success-message");
  try {
    if (window.api?.registrarVenda) {
      conferirResposta(await window.api.registrarVenda(dadosVenda));
      await recarregarDados();
    } else {
      const total = carrinho.reduce((s, item) => s + item.preco * item.quantidade, 0);
      const numeros = vendas.map((v) => parseInt(String(v.pedido).replace(/\D/g, ""), 10) || 0);
      vendas.unshift({
        pedido: `#${Math.max(1048, ...numeros) + 1}`,
        criadoEm: new Date().toISOString(),
        itens: (() => { const q = carrinho.reduce((s, i) => s + i.quantidade, 0); return `${q} ${q === 1 ? "item" : "itens"}`; })(),
        pagamento: dadosVenda.formaPagamento,
        valor: total * (1 - dadosVenda.descontoPercentual / 100),
        status: "Concluída",
        linhas: dadosVenda.itens
      });
    }
    // Só limpa o carrinho após confirmação de sucesso.
    carrinho = [];
    document.querySelector("#discount-input").value = "0";
    msgEl.classList.add("success-message");
    msgEl.textContent = "Venda concluída com sucesso.";
    desenharPedido();
    atualizarDashboard();
    marcarSalvo();
  } catch (erro) {
    msgEl.textContent = erro.message || "Não foi possível concluir a venda.";
    botao.disabled = false;
  }
});

// Inicializa dados, relógio e breadcrumb.
async function iniciar() {
  const data = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const dataFmt = data.charAt(0).toLocaleUpperCase("pt-BR") + data.slice(1);
  document.querySelector("#dashboard-date").textContent = dataFmt;
  document.querySelector("#sale-date").textContent = dataFmt;

  // Relógio no cabeçalho, atualizado a cada 60 s.
  function atualizarRelogio() {
    const el = document.querySelector("#header-clock");
    if (el) el.textContent = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }
  atualizarRelogio();
  setInterval(atualizarRelogio, 60_000);

  // Indicador "Salvo às" começa em estado neutro.
  const elSalvo = document.querySelector("#header-saved");
  if (elSalvo) elSalvo.textContent = "Pronto";

  try {
    if (window.api?.carregarProdutos) {
      const r = conferirResposta(await window.api.carregarProdutos());
      if (Array.isArray(r)) bebidas = r.map((b) => ({ ...b, categoria: b.categoria?.label || rotuloCategoria[b.categoria] || b.categoria || "Outros" }));
    }
    if (window.api?.listarVendas) {
      const r = conferirResposta(await window.api.listarVendas());
      if (Array.isArray(r)) vendas = r;
    }
    atualizarDashboard();
    desenharCatalogo();
    desenharPedido();
    desenharEstoque();
  } catch (erro) {
    console.error("Não foi possível carregar os dados:", erro);
    atualizarDashboard();
    desenharCatalogo();
    desenharPedido();
    desenharEstoque();
  }
}

iniciar();
