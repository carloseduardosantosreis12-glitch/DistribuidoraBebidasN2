// renderer.js controla apenas as telas Dashboard e Nova Venda.
// Os dados de demonstração permitem visualizar a interface antes da integração com IPC/JSON.

const bebidasDemo = [
  // Campos do modelo Bebida usado na N1: id, nome, marca, categoria, preco e estoque.
  { id: 1, nome: "Cerveja Pilsen Lata 350ml", marca: "Ambev", categoria: "Cervejas", preco: 38.90, estoque: 24 },
  { id: 2, nome: "Cerveja Long Neck 330ml", marca: "Heineken", categoria: "Cervejas", preco: 94.00, estoque: 36 },
  { id: 3, nome: "Refrigerante Cola 2L", marca: "Coca-Cola", categoria: "Refrigerantes", preco: 42.50, estoque: 148 },
  { id: 4, nome: "Refrigerante Guaraná 2L", marca: "Antarctica", categoria: "Refrigerantes", preco: 39.90, estoque: 11 },
  { id: 5, nome: "Água Mineral sem gás 500ml", marca: "Indaiá", categoria: "Águas", preco: 18.00, estoque: 9 },
  { id: 6, nome: "Água Mineral 1,5L", marca: "Indaiá", categoria: "Águas", preco: 16.50, estoque: 42 },
  { id: 7, nome: "Suco de Uva Integral 1L", marca: "Aurora", categoria: "Sucos", preco: 48.00, estoque: 21 },
  { id: 8, nome: "Energético 473ml", marca: "Red Bull", categoria: "Energéticos", preco: 39.00, estoque: 5 }
];

// Totais de demonstração do Dashboard, separados do modelo da bebida da N1.
const quantidadeVendidaDemo = { 1: 82, 2: 68, 3: 61, 4: 54, 5: 47, 6: 31, 7: 28, 8: 22 };
const rotuloCategoria = {
  REFRIGERANTE: "Refrigerantes", AGUA: "Águas", SUCO: "Sucos", CERVEJA: "Cervejas",
  ENERGETICO: "Energéticos", VINHO: "Vinhos", DESTILADO: "Destilados", OUTRO: "Outros"
};

// Carrinho e filtro são estados temporários desta tela.
let bebidas = [...bebidasDemo];
let carrinho = [];
let categoriaAtiva = "Todos";
let vendasDemo = [
  { pedido: "#1048", horario: "Hoje, 14:32", itens: "3 itens", pagamento: "Pix", valor: 128.40, status: "Concluída" },
  { pedido: "#1047", horario: "Hoje, 13:58", itens: "5 itens", pagamento: "Dinheiro", valor: 247.00, status: "Concluída" },
  { pedido: "#1046", horario: "Hoje, 12:41", itens: "2 itens", pagamento: "Cartão de débito", valor: 81.50, status: "Concluída" }
];

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

// Monta o gráfico de colunas do Dashboard a partir das vendas recentes disponíveis.
function desenharGrafico(dados = [6200, 5400, 9300, 7100, 6800, 8420, 0]) {
  const dias = ["Qui", "Sex", "Sáb", "Dom", "Seg", "Ter", "Hoje"];
  const maior = Math.max(...dados, 1);
  document.querySelector("#sales-chart").innerHTML = dados.map((valor, indice) => {
    const altura = valor === 0 ? 4 : Math.max(8, Math.round((valor / maior) * 120));
    const valorTexto = valor ? `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : "";
    return `<div class="chart-column ${indice === dados.length - 1 ? "today" : ""}"><span class="chart-value">${valorTexto}</span><div class="chart-bar" style="height:${altura}px"></div><span class="chart-day">${dias[indice]}</span></div>`;
  }).join("");
}

// Preenche os indicadores, produtos mais vendidos e tabela de pedidos recentes.
function atualizarDashboard(resumo) {
  const pedidosHoje = vendasDemo.length;
  const valorHoje = vendasDemo.reduce((total, venda) => total + venda.valor, 0);
  document.querySelector("#stat-today").textContent = formatoMoeda(resumo?.vendasHoje ?? valorHoje);
  document.querySelector("#stat-orders").textContent = resumo?.pedidosHoje ?? pedidosHoje;
  document.querySelector("#stat-products").textContent = resumo?.totalProdutos ?? bebidas.length;
  document.querySelector("#stat-low").textContent = resumo?.estoqueBaixo ?? bebidas.filter((bebida) => bebida.estoque <= 10).length;
  document.querySelector("#stat-trend").textContent = resumo?.variacaoVendas ?? "+12,4%";
  document.querySelector("#stat-orders-trend").textContent = resumo?.variacaoPedidos ?? "+6";

  const maisVendidos = [...bebidas].sort((a, b) => (quantidadeVendidaDemo[b.id] || 0) - (quantidadeVendidaDemo[a.id] || 0)).slice(0, 4);
  document.querySelector("#best-sellers").innerHTML = maisVendidos.map((bebida, indice) => `
    <div class="rank-row"><span class="rank-number">${indice + 1}</span><span class="rank-name">${escapar(bebida.nome)}</span><span class="rank-qty">${quantidadeVendidaDemo[bebida.id] || 0} un.</span></div>
  `).join("");

  document.querySelector("#recent-sales").innerHTML = vendasDemo.map((venda) => `
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
    // O código mostrado na N1 é gerado pelo ID; não é um campo extra da entidade.
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

// A navegação por botões e pelo menu nativo abre uma das duas telas implementadas.
function abrirTela(nome) {
  document.querySelector("#dashboard-page").classList.toggle("hidden", nome !== "dashboard");
  document.querySelector("#venda-page").classList.toggle("hidden", nome !== "venda");
  document.querySelectorAll(".nav-item[data-page]").forEach((botao) => botao.classList.toggle("active", botao.dataset.page === nome));
  document.querySelector("#sale-date").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date());
  if (nome === "venda") document.querySelector("#product-search").focus();
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

// Atalho F2 leva o cursor direto para a pesquisa de produto, como indicado no Figma.
document.addEventListener("keydown", (evento) => {
  if (evento.key === "F2") {
    evento.preventDefault();
    abrirTela("venda");
    document.querySelector("#product-search").focus();
  }
});

// Finaliza a venda pela API segura do preload; sem integração, mostra apenas uma confirmação local.
document.querySelector("#finish-sale").addEventListener("click", async () => {
  const dados = {
    // Campos de cada ItemVenda usados na N1, sem enviar funções ou objetos da interface.
    itens: carrinho.map(({ id, nome, preco, quantidade }) => ({ bebidaId: id, nomeBebida: nome, quantidade, precoUnitario: preco })),
    formaPagamento: document.querySelector("#payment-method").value,
    descontoPercentual: Number(document.querySelector("#discount-input").value) || 0
  };
  const botao = document.querySelector("#finish-sale");
  botao.disabled = true;
  try {
    // Contrato previsto: o preload expõe window.api.registrarVenda(dados) usando IPC.
    if (window.api?.registrarVenda) conferirResposta(await window.api.registrarVenda(dados));
    else {
      const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
      vendasDemo.unshift({ pedido: "#1049", horario: "Agora", itens: `${carrinho.length} ${carrinho.length === 1 ? "item" : "itens"}`, pagamento: dados.formaPagamento, valor: total * (1 - dados.descontoPercentual / 100), status: "Concluída" });
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

// Busca dados reais quando a API estiver pronta; até lá, inicia com os exemplos do protótipo.
async function iniciar() {
  const data = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  document.querySelector("#dashboard-date").textContent = data.charAt(0).toLocaleUpperCase("pt-BR") + data.slice(1);
  document.querySelector("#sale-date").textContent = data;
  try {
    // O colega de IPC/dados pode expor estas chamadas pelo preload.js.
    if (window.api?.listarBebidas) {
      const resposta = conferirResposta(await window.api.listarBebidas());
      if (Array.isArray(resposta)) bebidas = resposta.map((bebida) => ({ ...bebida, categoria: bebida.categoria?.label || rotuloCategoria[bebida.categoria] || bebida.categoria || "Outros" }));
    }
    if (window.api?.listarVendas) {
      const resposta = conferirResposta(await window.api.listarVendas());
      if (Array.isArray(resposta)) vendasDemo = resposta;
    }
    const resumo = window.api?.obterResumoDashboard ? conferirResposta(await window.api.obterResumoDashboard()) : null;
    atualizarDashboard(resumo);
    desenharCatalogo();
    desenharPedido();
  } catch (erro) {
    console.error("Não foi possível carregar os dados do Dashboard:", erro);
    atualizarDashboard();
    desenharCatalogo();
    desenharPedido();
  }
}

iniciar();
