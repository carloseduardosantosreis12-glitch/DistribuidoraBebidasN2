// renderer.js controla Dashboard, Nova Venda e Estoque.
// Quando o preload existe, bebidas são carregadas e gravadas no JSON pelo processo principal.

const rotuloCategoria = {
  REFRIGERANTE: "Refrigerantes", AGUA: "Águas", SUCO: "Sucos", CERVEJA: "Cervejas",
  ENERGETICO: "Energéticos", VINHO: "Vinhos", DESTILADO: "Destilados", OUTRO: "Outros"
};

// Estado em memória; bebidas são carregadas do JSON na inicialização.
let bebidas = [];
let carrinho = [];
let categoriaAtiva = "Todos";
let categoriaEstoqueAtiva = "Todas";
// Vendas em memória até commit 2 (IPC + vendas.json).
let vendas = [];

const porId = (id) => bebidas.find((bebida) => bebida.id === Number(id));
const formatoMoeda = (valor) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor) || 0);
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caractere]);

// Trata o retorno { ok, dados, erro } usado no material da aula, além de resultados simples.
function conferirResposta(resposta) {
  if (resposta && resposta.ok === false) {
    throw new Error(resposta.erro || resposta.mensagem || "A solicitação não pôde ser concluída.");
  }
  if (resposta && resposta.ok === true) {
    return resposta.dados ?? resposta.data ?? resposta.valor ?? resposta;
  }
  return resposta;
}

// Monta o gráfico de colunas usando createElement + CSSOM (style inline bloqueado pela CSP).
function desenharGrafico(dados) {
  const valores = Array.isArray(dados) && dados.length === 7 ? dados : [0, 0, 0, 0, 0, 0, 0];
  const dias = ["Qui", "Sex", "Sáb", "Dom", "Seg", "Ter", "Hoje"];
  const maior = Math.max(...valores, 1);
  const container = document.querySelector("#sales-chart");
  container.innerHTML = "";
  valores.forEach((valor, indice) => {
    const altura = valor === 0 ? 4 : Math.max(8, Math.round((valor / maior) * 120));
    const valorTexto = valor ? `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : "";

    const col = document.createElement("div");
    col.className = `chart-column${indice === valores.length - 1 ? " today" : ""}`;

    const valEl = document.createElement("span");
    valEl.className = "chart-value";
    valEl.textContent = valorTexto;

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = `${altura}px`;

    const dayEl = document.createElement("span");
    dayEl.className = "chart-day";
    dayEl.textContent = dias[indice];

    col.appendChild(valEl);
    col.appendChild(bar);
    col.appendChild(dayEl);
    container.appendChild(col);
  });
}

// Preenche os indicadores, produtos mais vendidos e tabela de pedidos recentes.
function atualizarDashboard(resumo) {
  const pedidosHoje = vendas.length;
  const valorHoje = vendas.reduce((total, venda) => total + (Number(venda.valor) || 0), 0);
  document.querySelector("#stat-today").textContent = formatoMoeda(resumo?.vendasHoje ?? valorHoje);
  document.querySelector("#stat-orders").textContent = resumo?.pedidosHoje ?? pedidosHoje;
  document.querySelector("#stat-products").textContent = resumo?.totalProdutos ?? bebidas.length;
  document.querySelector("#stat-low").textContent = resumo?.estoqueBaixo ?? bebidas.filter((bebida) => bebida.estoque <= 10).length;
  document.querySelector("#stat-trend").textContent = resumo?.variacaoVendas ?? "—";
  document.querySelector("#stat-orders-trend").textContent = resumo?.variacaoPedidos ?? "—";

  // Ranking calculado a partir das vendas reais (campo linhas de cada venda).
  const vendidos = {};
  vendas.forEach((venda) => (venda.linhas || []).forEach((linha) => {
    vendidos[linha.bebidaId] = (vendidos[linha.bebidaId] || 0) + (Number(linha.quantidade) || 0);
  }));
  const maisVendidos = [...bebidas].sort((a, b) => (vendidos[b.id] || 0) - (vendidos[a.id] || 0)).slice(0, 4);
  document.querySelector("#best-sellers").innerHTML = maisVendidos.map((bebida, indice) => `
    <div class="rank-row"><span class="rank-number">${indice + 1}</span><span class="rank-name">${escapar(bebida.nome)}</span><span class="rank-qty">${(vendidos[bebida.id] || 0).toLocaleString("pt-BR")} un.</span></div>
  `).join("");

  document.querySelector("#recent-sales").innerHTML = vendas.slice(0, 5).map((venda) => `
    <tr><td>${escapar(venda.pedido)}</td><td>${escapar(venda.horario)}</td><td>${escapar(venda.itens)}</td><td>${escapar(venda.pagamento)}</td><td>${formatoMoeda(venda.valor)}</td></tr>
  `).join("");
  desenharGrafico(resumo?.vendasPorDia);
}

// Cria os filtros de categoria e os cartões clicáveis do catálogo de bebidas.
function desenharCatalogo() {
  const busca = document.querySelector("#product-search").value.trim().toLocaleLowerCase("pt-BR");
  const categorias = ["Todos", ...new Set(bebidas.map((bebida) => bebida.categoria))];
  document.querySelector("#category-tabs").innerHTML = categorias.map((categoria) => `
    <button class="category-tab ${categoria === categoriaAtiva ? "active" : ""}" data-category="${escapar(categoria)}" type="button">${escapar(categoria)}</button>
  `).join("");

  const produtos = bebidas.filter((bebida) => {
    const correspondeCategoria = categoriaAtiva === "Todos" || bebida.categoria === categoriaAtiva;
    const codigo = String(bebida.id).padStart(3, "0");
    const correspondeBusca = `${bebida.nome} ${bebida.marca || ""} ${codigo}`.toLocaleLowerCase("pt-BR").includes(busca);
    return correspondeCategoria && correspondeBusca;
  });

  const catalogo = document.querySelector("#product-grid");
  if (!produtos.length) {
    catalogo.innerHTML = '<div class="empty-products">Nenhum produto encontrado para esta busca.</div>';
    return;
  }
  catalogo.innerHTML = produtos.map((bebida) => {
    const noPedido = carrinho.find((item) => item.id === bebida.id)?.quantidade || 0;
    return `<button class="product-card" data-product="${bebida.id}" type="button" ${bebida.estoque <= 0 ? "disabled" : ""}>
      ${noPedido ? `<span class="in-cart">${noPedido} no pedido</span>` : ""}
      <span class="product-category">${escapar(bebida.categoria)}</span><span class="product-name">${escapar(bebida.nome)}</span>
      <span class="product-meta">${escapar(bebida.marca || bebida.categoria)} · estoque ${bebida.estoque}</span><strong class="product-price">${formatoMoeda(bebida.preco)}</strong><span class="product-add" aria-hidden="true">+</span>
    </button>`;
  }).join("");
}

// Atualiza linhas, quantidade, totais e o estado vazio do pedido.
function desenharPedido() {
  const totalItens = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
  document.querySelector("#empty-order").classList.toggle("hidden", carrinho.length > 0);
  document.querySelector("#order-items").innerHTML = carrinho.map((item) => `
    <article class="order-item"><div class="order-item-top"><span class="order-item-name">${escapar(item.nome)}</span><strong class="order-item-subtotal">${formatoMoeda(item.preco * item.quantidade)}</strong></div>
    <div class="order-item-meta"><span>${formatoMoeda(item.preco)} cada</span><span class="qty-controls"><button type="button" data-qty="-1" data-id="${item.id}" aria-label="Diminuir quantidade">−</button><b>${item.quantidade}</b><button type="button" data-qty="1" data-id="${item.id}" aria-label="Aumentar quantidade">+</button><button class="remove-item" type="button" data-remove="${item.id}" aria-label="Remover ${escapar(item.nome)}">×</button></span></div></article>
  `).join("");
  document.querySelector("#order-number").textContent = `#1049 · Balcão 01 · ${totalItens} ${totalItens === 1 ? "item" : "itens"}`;

  const subtotal = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const descontoPercentual = Math.min(100, Math.max(0, Number(document.querySelector("#discount-input").value) || 0));
  const desconto = subtotal * descontoPercentual / 100;
  document.querySelector("#subtotal-value").textContent = formatoMoeda(subtotal);
  document.querySelector("#discount-value").textContent = `− ${formatoMoeda(desconto)}`;
  document.querySelector("#total-value").textContent = formatoMoeda(subtotal - desconto);
  document.querySelector("#finish-sale").disabled = carrinho.length === 0;
  desenharCatalogo();
}

// Cria um SKU visual a partir da categoria e do ID, sem alterar o formato salvo no JSON.
function skuDaBebida(bebida) {
  const prefixos = { Cervejas: "BEB", Refrigerantes: "REF", Águas: "AGU", Sucos: "SUC", Energéticos: "ENE", Vinhos: "VIN", Destilados: "DES", Outros: "OUT" };
  const prefixo = prefixos[bebida.categoria] || "OUT";
  return `${prefixo}-${String(bebida.id).padStart(3, "0")}`;
}

// Mostra a tabela de estoque, seus filtros e os indicadores de quantidade.
function desenharEstoque() {
  const busca = document.querySelector("#stock-search").value.trim().toLocaleLowerCase("pt-BR");
  const seletorCategoria = document.querySelector("#stock-category");
  const categorias = [...new Set(bebidas.map((bebida) => bebida.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (categoriaEstoqueAtiva !== "Todas" && !categorias.includes(categoriaEstoqueAtiva)) categoriaEstoqueAtiva = "Todas";
  seletorCategoria.innerHTML = ['<option value="Todas">Todas as categorias</option>', ...categorias.map((categoria) => `<option value="${escapar(categoria)}">${escapar(categoria)}</option>`)].join("");
  seletorCategoria.value = categoriaEstoqueAtiva;

  const totalUnidades = bebidas.reduce((soma, bebida) => soma + (Number(bebida.estoque) || 0), 0);
  document.querySelector("#stock-summary").textContent = `${bebidas.length} ${bebidas.length === 1 ? "produto cadastrado" : "produtos cadastrados"} · ${totalUnidades.toLocaleString("pt-BR")} ${totalUnidades === 1 ? "unidade" : "unidades"} em estoque`;

  const produtos = bebidas.filter((bebida) => {
    const sku = skuDaBebida(bebida);
    const correspondeBusca = `${bebida.nome} ${sku} ${bebida.marca || ""}`.toLocaleLowerCase("pt-BR").includes(busca);
    return correspondeBusca && (categoriaEstoqueAtiva === "Todas" || bebida.categoria === categoriaEstoqueAtiva);
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
  tabela.innerHTML = produtos.map((bebida) => {
    const unidades = Number(bebida.estoque) || 0;
    const classeStatus = unidades === 0 ? "out" : unidades <= 10 ? "low" : "";
    const textoStatus = unidades === 0 ? "Sem estoque" : unidades <= 10 ? "Estoque baixo" : "Em estoque";
    return `<tr>
      <td>${skuDaBebida(bebida)}</td><td>${escapar(bebida.nome)}</td><td>${escapar(bebida.categoria || "Outros")}</td>
      <td>${unidades.toLocaleString("pt-BR")} un.</td><td>${formatoMoeda(bebida.preco)}</td><td><span class="stock-status ${classeStatus}">${textoStatus}</span></td>
      <td><div class="stock-actions"><button class="stock-action" type="button" data-edit-product="${bebida.id}">Editar</button><button class="stock-action delete" type="button" data-delete-product="${bebida.id}">Excluir</button></div></td>
    </tr>`;
  }).join("");
}

// Abre o mesmo formulário para cadastrar ou alterar uma bebida.
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

// Atualiza a lista real após inclusão, edição ou exclusão e redesenha as telas dependentes.
async function recarregarBebidas() {
  if (window.api?.listarBebidas) {
    const resposta = conferirResposta(await window.api.listarBebidas());
    bebidas = Array.isArray(resposta) ? resposta.map((bebida) => ({ ...bebida, categoria: bebida.categoria?.label || rotuloCategoria[bebida.categoria] || bebida.categoria || "Outros" })) : [];
  }
  desenharEstoque();
  desenharCatalogo();
  desenharPedido();
  atualizarDashboard();
}

// Tela Vendas: lista os pedidos registrados, com busca por pedido e filtro por forma de pagamento.
let pagamentoVendasAtivo = "Todos";

function desenharVendas() {
  const busca = document.querySelector("#sales-search").value.trim().toLocaleLowerCase("pt-BR");
  const seletor = document.querySelector("#sales-payment");
  const formas = [...new Set(vendas.map((venda) => venda.pagamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (pagamentoVendasAtivo !== "Todos" && !formas.includes(pagamentoVendasAtivo)) pagamentoVendasAtivo = "Todos";
  seletor.innerHTML = ['<option value="Todos">Todas as formas de pagamento</option>', ...formas.map((forma) => `<option value="${escapar(forma)}">${escapar(forma)}</option>`)].join("");
  seletor.value = pagamentoVendasAtivo;

  const vendasFiltradas = vendas.filter((venda) => String(venda.pedido).toLocaleLowerCase("pt-BR").includes(busca) && (pagamentoVendasAtivo === "Todos" || venda.pagamento === pagamentoVendasAtivo));
  const faturamento = vendasFiltradas.reduce((soma, venda) => soma + (Number(venda.valor) || 0), 0);
  document.querySelector("#sales-count").textContent = vendasFiltradas.length;
  document.querySelector("#sales-revenue").textContent = formatoMoeda(faturamento);
  document.querySelector("#sales-average").textContent = formatoMoeda(vendasFiltradas.length ? faturamento / vendasFiltradas.length : 0);
  document.querySelector("#sales-summary").textContent = `${vendasFiltradas.length} ${vendasFiltradas.length === 1 ? "venda registrada" : "vendas registradas"}`;

  const vazio = document.querySelector("#sales-empty");
  const tabela = document.querySelector("#sales-table-body");
  if (!vendasFiltradas.length) {
    tabela.innerHTML = "";
    vazio.classList.remove("hidden");
    const nenhumaVenda = vendas.length === 0;
    document.querySelector("#sales-empty-title").textContent = nenhumaVenda ? "Nenhuma venda registrada" : "Nenhum resultado encontrado";
    document.querySelector("#sales-empty-description").textContent = nenhumaVenda ? "As vendas concluídas em Nova Venda aparecem aqui." : "Tente mudar a busca ou escolher outra forma de pagamento.";
    return;
  }
  vazio.classList.add("hidden");
  tabela.innerHTML = vendasFiltradas.map((venda) => `<tr>
    <td>${escapar(venda.pedido)}</td><td>${escapar(venda.horario)}</td><td>${escapar(venda.itens)}</td><td>${escapar(venda.pagamento)}</td>
    <td>${formatoMoeda(venda.valor)}</td><td><span class="status-pill">${escapar(venda.status || "Concluída")}</span></td>
  </tr>`).join("");
}

// Desenha uma lista de barras horizontais; a largura vai pelo CSSOM porque a CSP bloqueia style inline.
function desenharBarras(destino, itens, formatar) {
  const maior = Math.max(...itens.map((item) => item.valor), 1);
  destino.innerHTML = itens.length
    ? itens.map((item) => `<div class="bar-row"><span>${escapar(item.nome)}</span><span class="bar-track"><span class="bar-fill" data-largura="${Math.round((item.valor / maior) * 100)}"></span></span><span class="bar-value">${formatar(item.valor)}</span></div>`).join("")
    : '<div class="bar-empty">Sem dados para mostrar.</div>';
  destino.querySelectorAll("[data-largura]").forEach((barra) => { barra.style.width = `${barra.dataset.largura}%`; });
}

// Tela Relatórios: totais de vendas, valor do estoque e rankings calculados com os dados em memória.
function desenharRelatorios() {
  const faturamento = vendas.reduce((soma, venda) => soma + (Number(venda.valor) || 0), 0);
  const unidades = bebidas.reduce((soma, bebida) => soma + (Number(bebida.estoque) || 0), 0);
  const valorEstoque = bebidas.reduce((soma, bebida) => soma + (Number(bebida.preco) || 0) * (Number(bebida.estoque) || 0), 0);
  document.querySelector("#report-revenue").textContent = formatoMoeda(faturamento);
  document.querySelector("#report-orders").textContent = vendas.length;
  document.querySelector("#report-average").textContent = formatoMoeda(vendas.length ? faturamento / vendas.length : 0);
  document.querySelector("#report-stock-value").textContent = formatoMoeda(valorEstoque);
  document.querySelector("#report-stock-units").textContent = `${unidades.toLocaleString("pt-BR")} ${unidades === 1 ? "unidade" : "unidades"} em estoque`;

  const porPagamento = {};
  vendas.forEach((venda) => { porPagamento[venda.pagamento || "Outros"] = (porPagamento[venda.pagamento || "Outros"] || 0) + (Number(venda.valor) || 0); });
  desenharBarras(document.querySelector("#report-payments"), Object.entries(porPagamento).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor), formatoMoeda);

  const porCategoria = {};
  bebidas.forEach((bebida) => { porCategoria[bebida.categoria || "Outros"] = (porCategoria[bebida.categoria || "Outros"] || 0) + (Number(bebida.estoque) || 0); });
  desenharBarras(document.querySelector("#report-categories"), Object.entries(porCategoria).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor), (valor) => `${valor.toLocaleString("pt-BR")} un.`);

  const vendidos = {};
  vendas.forEach((venda) => (venda.linhas || []).forEach((linha) => { vendidos[linha.bebidaId] = (vendidos[linha.bebidaId] || 0) + (Number(linha.quantidade) || 0); }));
  const ranking = bebidas.map((bebida) => ({ bebida, quantidade: vendidos[bebida.id] || 0 })).filter((linha) => linha.quantidade > 0).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
  document.querySelector("#report-products-empty").classList.toggle("hidden", ranking.length > 0);
  document.querySelector("#report-products").innerHTML = ranking.map(({ bebida, quantidade }, indice) => `<tr>
    <td>${indice + 1}</td><td>${escapar(bebida.nome)}</td><td>${escapar(bebida.categoria || "Outros")}</td>
    <td>${quantidade.toLocaleString("pt-BR")} un.</td><td>${formatoMoeda(quantidade * (Number(bebida.preco) || 0))}</td><td>${(Number(bebida.estoque) || 0).toLocaleString("pt-BR")} un.</td>
  </tr>`).join("");
}

// A navegação mostra uma seção por vez dentro do mesmo index.html.
function abrirTela(nome) {
  document.querySelectorAll(".page").forEach((pagina) => pagina.classList.toggle("hidden", pagina.id !== `${nome}-page`));
  document.querySelectorAll(".nav-item[data-page]").forEach((botao) => botao.classList.toggle("active", botao.dataset.page === nome));
  document.querySelector("#sale-date").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date());
  if (nome === "venda") document.querySelector("#product-search").focus();
  if (nome === "estoque") desenharEstoque();
  if (nome === "vendas") desenharVendas();
  if (nome === "relatorios") desenharRelatorios();
}

// Ctrl+F no menu nativo abre Nova Venda e coloca o cursor na busca de bebidas.
window.api?.aoSolicitarBusca?.(() => {
  abrirTela("venda");
  const campoBusca = document.querySelector("#product-search");
  campoBusca.focus();
  campoBusca.select();
});

// Registra os cliques da navegação e os botões de ação do Dashboard.
document.querySelectorAll(".nav-item[data-page], [data-go]").forEach((botao) => {
  botao.addEventListener("click", () => abrirTela(botao.dataset.page || botao.dataset.go));
});

// Ctrl+N no menu nativo abre diretamente o formulário de novo produto na tela Estoque.
window.api?.aoNovoProduto?.(() => {
  abrirTela("estoque");
  abrirFormularioProduto();
});

// Busca e categoria da tela Estoque atualizam a tabela sem recarregar o aplicativo.
document.querySelector("#stock-search").addEventListener("input", desenharEstoque);
document.querySelector("#stock-category").addEventListener("change", (evento) => {
  categoriaEstoqueAtiva = evento.target.value;
  desenharEstoque();
});
// Busca e forma de pagamento da tela Vendas atualizam a tabela na hora.
document.querySelector("#sales-search").addEventListener("input", desenharVendas);
document.querySelector("#sales-payment").addEventListener("change", (evento) => {
  pagamentoVendasAtivo = evento.target.value;
  desenharVendas();
});
document.querySelector("#new-product-button").addEventListener("click", () => abrirFormularioProduto());
document.querySelector("#close-product-dialog").addEventListener("click", () => document.querySelector("#product-dialog").close());
document.querySelector("#cancel-product-dialog").addEventListener("click", () => document.querySelector("#product-dialog").close());

// Salva no repositório JSON através do preload; fora do Electron, mantém a lista em memória.
document.querySelector("#product-form").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const mensagem = document.querySelector("#product-form-message");
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
    mensagem.textContent = "Confira os campos: nome, categoria, preço positivo e quantidade inteira.";
    return;
  }
  const botao = document.querySelector("#save-product-button");
  botao.disabled = true;
  mensagem.textContent = "";
  try {
    if (window.api?.salvarBebida) {
      conferirResposta(await window.api.salvarBebida(dados));
    } else {
      const id = dados.id ? Number(dados.id) : Math.max(0, ...bebidas.map((bebida) => Number(bebida.id) || 0)) + 1;
      const bebida = { ...dados, id };
      const indice = bebidas.findIndex((item) => item.id === id);
      if (indice >= 0) bebidas[indice] = bebida;
      else bebidas.push(bebida);
    }
    document.querySelector("#product-dialog").close();
    await recarregarBebidas();
  } catch (erro) {
    mensagem.textContent = erro.message || "Não foi possível salvar o produto.";
  } finally {
    botao.disabled = false;
  }
});

// Editar reutiliza o formulário; excluir usa a confirmação nativa configurada no main.js.
document.querySelector("#stock-table-body").addEventListener("click", async (evento) => {
  const botaoEditar = evento.target.closest("[data-edit-product]");
  const botaoExcluir = evento.target.closest("[data-delete-product]");
  if (botaoEditar) {
    abrirFormularioProduto(porId(botaoEditar.dataset.editProduct));
    return;
  }
  if (!botaoExcluir) return;
  const id = Number(botaoExcluir.dataset.deleteProduct);
  try {
    if (window.api?.excluirBebida) {
      const excluiu = conferirResposta(await window.api.excluirBebida(id));
      if (!excluiu) return;
    } else {
      if (!window.confirm("Deseja realmente excluir esta bebida?")) return;
      bebidas = bebidas.filter((bebida) => bebida.id !== id);
    }
    await recarregarBebidas();
  } catch (erro) {
    window.alert(erro.message || "Não foi possível excluir o produto.");
  }
});

// Adicionar um produto ao pedido ocorre ao clicar em qualquer parte do seu cartão.
document.querySelector("#product-grid").addEventListener("click", (evento) => {
  const cartao = evento.target.closest("[data-product]");
  if (!cartao) return;
  const bebida = porId(cartao.dataset.product);
  if (!bebida) return;
  const existente = carrinho.find((item) => item.id === bebida.id);
  if (existente) {
    if (existente.quantidade >= bebida.estoque) return;
    existente.quantidade += 1;
  } else {
    carrinho.push({ id: bebida.id, nome: bebida.nome, preco: bebida.preco, quantidade: 1 });
  }
  document.querySelector("#sale-message").textContent = "";
  desenharPedido();
});

// A busca é atualizada enquanto se digita, e os chips filtram por categoria.
document.querySelector("#product-search").addEventListener("input", desenharCatalogo);
document.querySelector("#category-tabs").addEventListener("click", (evento) => {
  const botao = evento.target.closest("[data-category]");
  if (!botao) return;
  categoriaAtiva = botao.dataset.category;
  desenharCatalogo();
});

// Controles de quantidade e remoção de itens do pedido atual.
document.querySelector("#order-items").addEventListener("click", (evento) => {
  const alterar = evento.target.closest("[data-qty]");
  const remover = evento.target.closest("[data-remove]");
  if (alterar) {
    const item = carrinho.find((linha) => linha.id === Number(alterar.dataset.id));
    const bebida = porId(alterar.dataset.id);
    if (!item) return;
    item.quantidade += Number(alterar.dataset.qty);
    if (item.quantidade <= 0) carrinho = carrinho.filter((linha) => linha.id !== item.id);
    if (bebida && item.quantidade > bebida.estoque) item.quantidade = bebida.estoque;
  } else if (remover) {
    carrinho = carrinho.filter((linha) => linha.id !== Number(remover.dataset.remove));
  } else return;
  desenharPedido();
});

document.querySelector("#discount-input").addEventListener("input", desenharPedido);
document.querySelector("#clear-cart").addEventListener("click", () => { carrinho = []; desenharPedido(); });

// Atalho F2 leva o cursor direto para a pesquisa de produto.
document.addEventListener("keydown", (evento) => {
  if (evento.key === "F2") {
    evento.preventDefault();
    abrirTela("venda");
    document.querySelector("#product-search").focus();
  }
});

// Finaliza a venda pelo IPC (commit 2); enquanto não existir, registra em memória.
document.querySelector("#finish-sale").addEventListener("click", async () => {
  const dados = {
    itens: carrinho.map(({ id, nome, preco, quantidade }) => ({ bebidaId: id, nomeBebida: nome, quantidade, precoUnitario: preco })),
    formaPagamento: document.querySelector("#payment-method").value,
    descontoPercentual: Number(document.querySelector("#discount-input").value) || 0
  };
  const botao = document.querySelector("#finish-sale");
  botao.disabled = true;
  try {
    if (window.api?.registrarVenda) {
      conferirResposta(await window.api.registrarVenda(dados));
      await recarregarBebidas();
    } else {
      const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
      const numeros = vendas.map((venda) => parseInt(String(venda.pedido).replace(/\D/g, ""), 10) || 0);
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      vendas.unshift({ pedido: `#${Math.max(1048, ...numeros) + 1}`, horario: `Hoje, ${hora}`, itens: `${carrinho.length} ${carrinho.length === 1 ? "item" : "itens"}`, pagamento: dados.formaPagamento, valor: total * (1 - dados.descontoPercentual / 100), status: "Concluída", linhas: dados.itens });
    }
    carrinho = [];
    document.querySelector("#discount-input").value = "0";
    document.querySelector("#sale-message").textContent = "Venda concluída com sucesso.";
    document.querySelector("#sale-message").classList.add("success-message");
    desenharPedido();
    atualizarDashboard();
  } catch (erro) {
    document.querySelector("#sale-message").classList.remove("success-message");
    document.querySelector("#sale-message").textContent = erro.message || "Não foi possível concluir a venda.";
    botao.disabled = false;
  }
});

// Busca dados reais quando a API estiver pronta; até lá, inicia com listas vazias.
async function iniciar() {
  const data = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  document.querySelector("#dashboard-date").textContent = data.charAt(0).toLocaleUpperCase("pt-BR") + data.slice(1);
  document.querySelector("#sale-date").textContent = data;
  try {
    if (window.api?.listarBebidas) {
      const resposta = conferirResposta(await window.api.listarBebidas());
      if (Array.isArray(resposta)) bebidas = resposta.map((bebida) => ({ ...bebida, categoria: bebida.categoria?.label || rotuloCategoria[bebida.categoria] || bebida.categoria || "Outros" }));
    }
    // Vendas: adicionado no commit 2 via window.api.listarVendas (IPC + vendas.json).
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
