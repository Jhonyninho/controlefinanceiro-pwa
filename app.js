// ======================================================
// CONFIGURAÇÃO
// ======================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbwwLJDDYbwoRqqQ329HbSUadGS5Y1hJWoWIAT7To-TV-EHfOA6mum-0XvmizO-svnq0/exec';

// ======================================================
// SESSÃO
// ======================================================
const SESSION_KEY = 'usuarioLogado';
let usuarioLogado = null;

// ======================================================
// ESTADO GLOBAL
// ======================================================
let categorias = [];
let contas = [];
let pagamentos = [];
let lancamentos = [];
let lancamentosFuturos = [];
let lancamentosFuturosFiltrados = [];

// ======================================================
// FILTROS – LANÇAMENTOS FUTUROS
// ======================================================
let filtrosFuturos = {
  mes: '',
  ano: '',
  conta: ''
};


// ======================================================
// HELPERS GERAIS
// ======================================================
function getUsuarioLogado() {
  const u = localStorage.getItem(SESSION_KEY);
  return u ? JSON.parse(u) : null;
}

function post(action, payload = {}) {
  const params = new URLSearchParams({ action, ...payload }).toString();
  return fetch(`${API_URL}?${params}`).then(r => r.json());
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseValorBR(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;

  return Number(
    String(v)
      .replace(/\./g, '')   // remove milhar
      .replace(',', '.')    // troca vírgula por ponto
  ) || 0;
}


function mesIndex(data) {
  const d = new Date(data);
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate()
  ).getMonth();
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const d = new Date(dataISO);
  return d.toLocaleDateString('pt-BR');
}


// ======================================================
// INIT GERAL + LOGIN
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
  configurarLogin();
  verificarSessao();
});

// ---------------- LOGIN ----------------
function configurarLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const login = document.getElementById('login').value;
    const senha = document.getElementById('senha').value;
    const erro  = document.getElementById('loginError');

    erro.classList.add('hidden');

    try {
      const res = await post('login', { login, senha });

      if (!res.ok) {
        erro.innerText = res.erro || 'Usuário ou senha inválidos';
        erro.classList.remove('hidden');
        return;
      }

      const user = res.usuario;

      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: user.id,
        login: user.login,
        nome: user.nome,
        perfil: user.perfil
      }));

      usuarioLogado = user.login;
      iniciarApp();


    } catch (err) {
      erro.innerText = 'Erro ao conectar com o servidor';
      erro.classList.remove('hidden');
    }
  });
}

// ======================================================
// INIT DO SISTEMA (OBRIGATÓRIO)
// ======================================================
async function iniciarSistema() {
  atualizarPeriodoAtual();

  await carregarCategorias();
  await carregarContas();
  renderTabelaContas();
  await carregarPagamentos();
  await carregarLancamentos();
  await carregarLancamentosFuturos();

  inicializarFiltrosLancamentosFuturos();
  configurarFormulario();
  inicializarFormularioNovaDespesa();

  renderResumo();
  renderTabelas();
  renderLancamentosFuturos();
}

function inicializarFiltrosLancamentosFuturos() {
  const selMes = document.getElementById('filtroMesFuturo');
  const selAno = document.getElementById('filtroAnoFuturo');
  const selConta = document.getElementById('filtroContaFuturo');
  const btnLimpar = document.getElementById('btnLimparFiltrosFuturo');

  if (!selMes || !selAno || !selConta || !btnLimpar) return;

  // ANOS
  const anoAtual = new Date().getFullYear();
  selAno.innerHTML = '<option value="">Todos</option>';
  for (let a = anoAtual - 1; a <= anoAtual + 10; a++) {
    selAno.innerHTML += `<option value="${a}">${a}</option>`;
  }

  // CONTAS
  selConta.innerHTML = '<option value="">Todas</option>';
  contas.forEach(c => {
    selConta.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
  });

  // EVENTOS
  selMes.onchange = () => {
    filtrosFuturos.mes = selMes.value;
    aplicarFiltrosLancamentosFuturos();
  };

  selAno.onchange = () => {
    filtrosFuturos.ano = selAno.value;
    aplicarFiltrosLancamentosFuturos();
  };

  selConta.onchange = () => {
    filtrosFuturos.conta = selConta.value;
    aplicarFiltrosLancamentosFuturos();
  };

  btnLimpar.onclick = () => {
    filtrosFuturos = { mes: '', ano: '', conta: '' };
    selMes.value = '';
    selAno.value = '';
    selConta.value = '';

    lancamentosFuturosFiltrados = [];
    controlarBotaoPagarTudo();
    renderLancamentosFuturos(lancamentosFuturos);
  };
}


// ---------------- SESSÃO ----------------
function verificarSessao() {
  const user = getUsuarioLogado();
  if (user) {
    usuarioLogado = user.login;
    iniciarApp();
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  document.getElementById('login-screen')?.classList.remove('hidden');
  document.getElementById('app')?.classList.add('hidden');
}

function iniciarApp() {
  document.getElementById('login-screen')?.classList.add('hidden');
  document.getElementById('app')?.classList.remove('hidden');
  iniciarSistema();
}

// ======================================================
// PERÍODO
// ======================================================
function atualizarPeriodoAtual() {
  const el = document.getElementById('periodoAtual');
  if (!el) return;

  const hoje = new Date();
  el.innerText = hoje.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}


// ======================================================
// CATEGORIAS
// ======================================================
async function carregarCategorias() {
  const res = await post('getCategorias');
  categorias = res.categorias || [];
}

// ======================================================
// CONTAS
// ======================================================
async function carregarContas() {
  const res = await post('getContas');
  contas = res.contas || [];

  // ===============================
  // SELECT – NOVO LANÇAMENTO
  // (somente contas ATIVAS)
  // ===============================
  const selectConta = document.getElementById('conta');
  if (!selectConta) return;

  selectConta.innerHTML = '<option value="">Selecione</option>';

  contas
    .filter(c => c.ativo === 'SIM')   // 👈 SOMENTE ATIVAS
    .forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nome;
      opt.textContent = c.nome;
      selectConta.appendChild(opt);
    });
}


// ======================================================
// CONTAS – TABELA (ABA CONTAS)
// ======================================================
function renderTabelaContas() {
  const tbody = document.querySelector('#tabelaContas tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!contas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;opacity:.6">
          Nenhuma conta cadastrada
        </td>
      </tr>
    `;
    return;
  }

  contas.forEach(conta => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${conta.nome}</td>
      <td>${conta.ativo === 'SIM' ? '✔️' : '❌'}</td>
      <td>${conta.bandeira || '-'}</td>
      <td>${conta.skin || '-'}</td>
      <td>${conta.mostrarResumo === 'SIM' ? '✔️' : '❌'}</td>
      <td>${conta.ordem ?? ''}</td>
      <td>
        <button class="btn-editar">Editar</button>
      </td>
    `;

    // 🔥 EDITAR FUNCIONANDO
    tr.querySelector('.btn-editar').onclick = () => {
      abrirModalEditarConta(conta);
    };

    // Opcional: visual de inativo
    if (conta.ativo === 'NAO') {
      tr.style.opacity = '0.5';
    }

    tbody.appendChild(tr);
  });
}


// ======================================================
// PAGAMENTOS
// ======================================================
async function carregarPagamentos() {
  const res = await post('getPagamentos');
  pagamentos = res.pagamentos || [];

  const selectPagamento = document.getElementById('pagamento');
  if (!selectPagamento) return;

  selectPagamento.innerHTML = '<option value="">Selecione</option>';

  pagamentos.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nome;
    opt.textContent = p.nome;
    selectPagamento.appendChild(opt);
  });
}

// ======================================================
// LANÇAMENTOS ATUAIS
// ======================================================
async function carregarLancamentos() {
  const user = getUsuarioLogado();
  if (!user) {
    lancamentos = [];
    return;
  }

  const res = await post('getLancamentos');

  lancamentos = (res.lancamentos || [])
  .filter(l => String(l[9]).trim() === String(user.login).trim());
}

// ======================================================
// LANÇAMENTOS FUTUROS
// ======================================================
async function carregarLancamentosFuturos() {
  const user = getUsuarioLogado();
  if (!user) {
    lancamentosFuturos = [];
    return;
  }

  const res = await post('getLancamentosFuturos');

  lancamentosFuturos = (res.lancamentos || []).filter(l =>
    String(l[9]).trim() === String(user.login).trim()
  );
}

// ======================================================
// CARDS – FUNÇÃO BASE
// ======================================================
function criarCard(conta, descricao, valor, extraClasse = '') {
  const div = document.createElement('div');

  div.className = `cartao ${conta.skin} ${extraClasse}`;

  div.innerHTML = `
    <div class="chip"></div>

    <div class="cartao-topo">${descricao}</div>

    <div class="cartao-fatura">${formatMoney(valor)}</div>

    <div class="cartao-footer">
      <span>${conta.nome}</span>
      <span class="bandeira">${conta.bandeira}</span>
    </div>
  `;

  return div;
}


// ======================================================
// LIMPA COLUNAS DE CARDS (OBRIGATÓRIO)
// ======================================================
function limparColunas() {
  [
    'cards-debito',
    'cards-credito',
    'cards-pix-entrada',
    'cards-pix-saida'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}


// ======================================================
// RESUMO ATUAL (POR CONTA × PAGAMENTO) – CORRIGIDO
// ======================================================
function renderResumo() {
  limparColunas();

  contas
    .filter(c => c.ativo === 'SIM')          // 👈 ESSENCIAL
    .filter(c => c.mostrarResumo === 'SIM')
    .sort((a, b) => Number(a.ordem) - Number(b.ordem))
    .forEach(conta => {

      const nomeConta = conta.nome;
      const skin = conta.skin || 'padrao';
      const bandeira = conta.bandeira || 'VISA';

      // =========================
      // DÉBITO
      // =========================
      const debito = lancamentos
        .filter(l =>
          l[2] === 'SAIDA' &&
          l[5] === nomeConta &&
          l[6] === 'Débito'
        )
        .reduce((s, l) => s + parseValorBR(l[7]), 0);

      document.getElementById('cards-debito')
        ?.appendChild(
          criarCard(
            { nome: nomeConta, skin, bandeira },
            'Débito',
            debito
          )
        );

      // =========================
      // CRÉDITO
      // =========================
      const credito = lancamentos
        .filter(l =>
          l[2] === 'SAIDA' &&
          l[5] === nomeConta &&
          l[6] === 'Crédito'
        )
        .reduce((s, l) => s + parseValorBR(l[7]), 0);

      document.getElementById('cards-credito')
        ?.appendChild(
          criarCard(
            { nome: nomeConta, skin, bandeira },
            'Crédito',
            credito
          )
        );

      // =========================
      // PIX / TED – ENTRADA
      // =========================
      const pixEntrada = lancamentos
        .filter(l =>
          l[2] === 'ENTRADA' &&
          l[5] === nomeConta &&
          (l[6] === 'Pix' || l[6] === 'TED')
        )
        .reduce((s, l) => s + parseValorBR(l[7]), 0);

      document.getElementById('cards-pix-entrada')
        ?.appendChild(
          criarCard(
            { nome: nomeConta, skin, bandeira },
            'Pix / TED Recebido',
            pixEntrada,
            'pix-entrada'
          )
        );

      // =========================
      // PIX / TED – SAÍDA
      // =========================
      const pixSaida = lancamentos
        .filter(l =>
          l[2] === 'SAIDA' &&
          l[5] === nomeConta &&
          (l[6] === 'Pix' || l[6] === 'TED')
        )
        .reduce((s, l) => s + parseValorBR(l[7]), 0);

      document.getElementById('cards-pix-saida')
        ?.appendChild(
          criarCard(
            { nome: nomeConta, skin, bandeira },
            'Pix / TED Pago',
            pixSaida,
            'pix-saida'
          )
        );
    });
}
// ======================================================
// TABELAS
// ======================================================
function renderTabelas() {
  renderCategoriaMes();
  renderCategoriaTipo();
  renderEntradasTipo();
}

// ---------- Categoria x Mês (COM DRILL-DOWN) ----------
function renderCategoriaMes() {
  const tbody = document.querySelector('#tabelaCategoriaMes tbody');
  const tfootRow = document.querySelector('#tabelaCategoriaMes tfoot tr');
  if (!tbody || !tfootRow) return;

  tbody.innerHTML = '';

  let totalGeral = 0;
  const totaisMes = Array(12).fill(0); // 👈 TOTAL POR MÊS
  const mapa = {};

  // Monta mapa por categoria e mês
  lancamentos.forEach(l => {
    if (l[2] !== 'SAIDA') return;

    const mes = mesIndex(l[1]);
    const valor = parseValorBR(l[7]) || 0;

    mapa[l[3]] ??= Array(12).fill(0);
    mapa[l[3]][mes] += valor;

    totaisMes[mes] += valor;
  });

  // Linhas por categoria
  Object.entries(mapa).forEach(([cat, meses]) => {
    const totalLinha = meses.reduce((a, b) => a + b, 0);
    totalGeral += totalLinha;

    const tr = document.createElement('tr');
    tr.classList.add('linha-editavel');

    tr.innerHTML = `
      <td class="categoria-cell">${cat}</td>
      ${meses.map(v => `
        <td class="${v === 0 ? 'zero' : ''}">
          ${v !== 0 ? formatMoney(v) : ''}
        </td>
      `).join('')}
      <td><strong>${formatMoney(totalLinha)}</strong></td>
    `;

    tr.onclick = () => abrirModalLancamentosCategoria(cat);
    tbody.appendChild(tr);
  });

  // -------- FOOTER (TOTAL POR MÊS + GERAL) --------
  tfootRow.innerHTML = `
    <th>Total</th>
    ${totaisMes.map(v => `
      <th>${v ? formatMoney(v) : ''}</th>
    `).join('')}
    <th><strong>${formatMoney(totalGeral)}</strong></th>
  `;
}



// ---------- Categoria x Tipo (POR PAGAMENTO) ----------
function renderCategoriaTipo() {
  const table = document.getElementById('tabelaCategoriaTipo');
  if (!table) return;

  const tbody = table.querySelector('tbody');
  const tfoot = table.querySelector('tfoot');
  const tfootRow = tfoot?.querySelector('tr');

  tbody.innerHTML = '';

  // Totais gerais
  let totalDeb = 0;
  let totalCred = 0;
  let totalPix = 0;

  const mapa = {};

  lancamentos.forEach(l => {
    if (l[2] !== 'SAIDA') return;

    const categoria = l[3];
    const pagamento = l[6];
    const valor = parseValorBR(l[7]) || 0;

    mapa[categoria] ??= { deb: 0, cred: 0, pix: 0 };

    if (pagamento === 'Débito') {
      mapa[categoria].deb += valor;
      totalDeb += valor;
    } else if (pagamento === 'Crédito') {
      mapa[categoria].cred += valor;
      totalCred += valor;
    } else if (pagamento === 'Pix' || pagamento === 'TED') {
      mapa[categoria].pix += valor;
      totalPix += valor;
    }
  });

  // Linhas por categoria
  Object.entries(mapa).forEach(([cat, v]) => {
    const totalLinha = v.deb + v.cred + v.pix;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat}</td>
      <td>${v.deb ? formatMoney(v.deb) : ''}</td>
      <td>${v.cred ? formatMoney(v.cred) : ''}</td>
      <td>${v.pix ? formatMoney(v.pix) : ''}</td>
      <td><strong>${formatMoney(totalLinha)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  // FOOTER – TOTAL GERAL
  if (tfootRow) {
    const totalGeral = totalDeb + totalCred + totalPix;

    tfootRow.innerHTML = `
      <th>Total</th>
      <th>${totalDeb ? formatMoney(totalDeb) : ''}</th>
      <th>${totalCred ? formatMoney(totalCred) : ''}</th>
      <th>${totalPix ? formatMoney(totalPix) : ''}</th>
      <th><strong>${formatMoney(totalGeral)}</strong></th>
    `;
  }
}

// ------------------- Entrada x Tipo de Recebimento ------------------------------ //
function renderEntradasTipo() {
  const tabela = document.getElementById('tabelaEntradasTipo');
  const tbody = tabela?.querySelector('tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const mapa = {};

  // Totais gerais
  let totalPix = 0;
  let totalTed = 0;
  let totalDinheiro = 0;

  lancamentos.forEach(l => {
    if (l[2] !== 'ENTRADA') return;

    const categoria = l[3];
    const pagamento = l[6];
    const valor = parseValorBR(l[7]) || 0;

    mapa[categoria] ??= { pix: 0, ted: 0, dinheiro: 0 };

    if (pagamento === 'Pix') {
      mapa[categoria].pix += valor;
      totalPix += valor;
    }
    else if (pagamento === 'TED') {
      mapa[categoria].ted += valor;
      totalTed += valor;
    }
    else if (pagamento === 'Dinheiro') {
      mapa[categoria].dinheiro += valor;
      totalDinheiro += valor;
    }
  });

  // Linhas por categoria
  Object.entries(mapa).forEach(([cat, v]) => {
    const totalLinha = v.pix + v.ted + v.dinheiro;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="categoria-cell">${cat}</td>
      <td>${v.pix ? formatMoney(v.pix) : ''}</td>
      <td>${v.ted ? formatMoney(v.ted) : ''}</td>
      <td>${v.dinheiro ? formatMoney(v.dinheiro) : ''}</td>
      <td><strong>${formatMoney(totalLinha)}</strong></td>
    `;

    tr.onclick = () => abrirModalEntradasCategoria(cat);
    tbody.appendChild(tr);
  });

  // -------- TOTAL GERAL --------
  const totalGeral = totalPix + totalTed + totalDinheiro;

  const trTotal = document.createElement('tr');
  trTotal.innerHTML = `
    <td><strong>Total</strong></td>
    <td><strong>${formatMoney(totalPix)}</strong></td>
    <td><strong>${formatMoney(totalTed)}</strong></td>
    <td><strong>${formatMoney(totalDinheiro)}</strong></td>
    <td><strong>${formatMoney(totalGeral)}</strong></td>
  `;

  tbody.appendChild(trTotal);
}

// ======================================================
// LANÇAMENTOS FUTUROS – RENDER (ENTRADA + SAÍDA)
// ======================================================
function aplicarFiltrosLancamentosFuturos() {
  lancamentosFuturosFiltrados = lancamentosFuturos.filter(l => {

    const data = new Date(formatarDataISO(l[1]));
    const mes = data.getMonth();
    const ano = data.getFullYear();

    if (filtrosFuturos.mes !== '' && Number(filtrosFuturos.mes) !== mes) {
      return false;
    }

    if (filtrosFuturos.ano !== '' && Number(filtrosFuturos.ano) !== ano) {
      return false;
    }

    if (filtrosFuturos.conta !== '' && l[5] !== filtrosFuturos.conta) {
      return false;
    }

    return true;
  });

  controlarBotaoPagarTudo();
  renderLancamentosFuturos(lancamentosFuturosFiltrados);
}

// ======================================================
// LANÇAMENTOS FUTUROS – RENDER (COM FILTRO)
function renderLancamentosFuturos(lista = lancamentosFuturos) {
  const tbody = document.querySelector('#tabelaLancamentosFuturos tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!lista.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;opacity:.6">
          Nenhum lançamento futuro
        </td>
      </tr>`;
    return;
  }

  let totalSaidas = 0;
  let totalEntradas = 0;

  lista
    .sort((a, b) => new Date(formatarDataISO(a[1])) - new Date(formatarDataISO(b[1])))
    .forEach(l => {

      const tipo = l[2];
      const valor = parseValorBR(l[7]);

      if (tipo === 'ENTRADA') totalEntradas += valor;
      else totalSaidas += valor;

      const acaoLabel = 'Consolidar';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatarDataBR(l[1])}</td>
        <td>${l[3]}</td>
        <td>${l[5]}</td>
        <td>${formatMoney(valor)}</td>
        <td>
          <button class="btn-pagar">${acaoLabel}</button>
          <button class="btn-editar">Editar</button>
          <button class="btn-excluir">Excluir</button>
        </td>
      `;

      // ✅ PAGAR / RECEBER
      tr.querySelector('.btn-pagar').onclick = async () => {
        const msg = tipo === 'ENTRADA'
          ? 'Confirmar recebimento deste valor?'
          : 'Confirmar pagamento deste lançamento?';

        if (!confirm(msg)) return;

        const dataPagamento = new Date().toISOString().split('T')[0];

        await post('confirmarLancamentoFuturo', {
          id: l[0],
          data: dataPagamento
        });

        // 🔥 REMOVE IMEDIATAMENTE DO FRONT
        lancamentosFuturos = lancamentosFuturos.filter(f => f[0] !== l[0]);

        // 🔁 Recarrega lançamentos reais
        await carregarLancamentos();

        // Atualiza telas
        renderResumo();
        renderTabelas();
        lancamentosFuturosFiltrados = [];
        controlarBotaoPagarTudo();
        aplicarFiltrosLancamentosFuturos();

        // Atualiza período visual
        const d = new Date(dataPagamento);
        const el = document.getElementById('periodoAtual');
        if (el) {
          el.innerText = d.toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric'
          });
        }
      };

      tr.querySelector('.btn-editar').onclick = () => abrirModalEdicaoFuturo(l);

      tr.querySelector('.btn-excluir').onclick = async () => {
        if (!confirm('Deseja excluir este lançamento futuro?')) return;

        await post('deleteLancamentoFuturo', { id: l[0] });

        lancamentosFuturos = lancamentosFuturos.filter(f => f[0] !== l[0]);
        renderLancamentosFuturos();
      };

      tbody.appendChild(tr);
    });

  const trTotal = document.createElement('tr');
  trTotal.innerHTML = `
    <td colspan="3"><strong>Totais</strong></td>
    <td>
      <strong style="color:green">${formatMoney(totalEntradas)}</strong><br>
      <strong style="color:red">${formatMoney(totalSaidas)}</strong>
    </td>
    <td></td>
  `;
  tbody.appendChild(trTotal);
}

// ======================================================
// FORM – NOVA DESPESA (SEM BUG)
// ======================================================
function configurarFormulario() {
  const selTipo = document.getElementById('tipo');
  const selCategoria = document.getElementById('categoria');
  const selSub = document.getElementById('subcategoria');
  const selPagamento = document.getElementById('pagamento');
  const chkParcelado = document.getElementById('parcelado');
  const campoParcelamento = document.getElementById('campoParcelamento');
  const form = document.getElementById('formLancamento');

  if (!selTipo || !selCategoria || !selSub || !form) return;

  function atualizarParcelamento() {
    const permitido =
      selTipo.value === 'SAIDA' &&
      selPagamento.value === 'Crédito' &&
      chkParcelado.checked;

    campoParcelamento.classList.toggle('hidden', !permitido);

    if (!permitido) {
      document.getElementById('qtdParcelas').value = '';
      document.getElementById('valorParcela').value = '';
    }
  }

  selTipo.onchange = () => {
    preencherCategorias(selTipo.value);
    atualizarParcelamento();

    if (selCategoria.options.length > 0) {
      selCategoria.selectedIndex = 0;
      preencherSubcategorias(selTipo.value, selCategoria.value);
    }
  };

  selCategoria.onchange = () => {
    preencherSubcategorias(selTipo.value, selCategoria.value);
  };

  selPagamento.onchange = atualizarParcelamento;
  chkParcelado.onchange = atualizarParcelamento;

  form.onsubmit = salvarLancamento;
}


function inicializarFormularioNovaDespesa() {
  const selTipo = document.getElementById('tipo');
  const selCategoria = document.getElementById('categoria');

  if (!selTipo || !selCategoria) return;
  if (!categorias.length) return;

  preencherCategorias(selTipo.value);

  if (selCategoria.options.length > 0) {
    selCategoria.selectedIndex = 0;
    preencherSubcategorias(selTipo.value, selCategoria.value);
  }
}

function preencherCategorias(tipo) {
  const selCategoria = document.getElementById('categoria');
  if (!selCategoria) return;

  selCategoria.innerHTML = '';
  [...new Set(categorias.filter(c => c.tipo === tipo).map(c => c.categoria))]
    .forEach(c => selCategoria.innerHTML += `<option>${c}</option>`);
}

function preencherSubcategorias(tipo, categoria) {
  const selSub = document.getElementById('subcategoria');
  if (!selSub) return;

  selSub.innerHTML = '';
  categorias
    .filter(c => c.tipo === tipo && c.categoria === categoria)
    .forEach(c => selSub.innerHTML += `<option>${c.subcategoria}</option>`);
}

// ======================================================
// FORM – SALVAR LANÇAMENTO (COM PAGAMENTO)
// ======================================================
async function salvarLancamento(e) {
  e.preventDefault();

  const user = getUsuarioLogado();
  if (!user) {
    alert('Sessão expirada. Faça login novamente.');
    mostrarLogin();
    return;
  }

  const tipo = document.getElementById('tipo').value;
  const pagamento = document.getElementById('pagamento').value;
  const parcelado = document.getElementById('parcelado').checked;
  const isFuturo = document.getElementById('chk-futuro')?.checked;

  // ===============================
  // PARCELAMENTO
  // ===============================
  if (parcelado && tipo === 'SAIDA' && pagamento === 'Crédito') {
    const qtd = Number(document.getElementById('qtdParcelas').value);
    const valorParcela = Number(
      document.getElementById('valorParcela').value.replace(',', '.')
    );

    if (!qtd || !valorParcela) {
      alert('Informe o número de parcelas e o valor de cada parcela.');
      return;
    }

    const dataBase = new Date(document.getElementById('data').value);

    for (let i = 0; i < qtd; i++) {
      const d = new Date(dataBase);
      d.setMonth(d.getMonth() + i);

      const payload = {
        tipo: 'SAIDA',
        categoria: document.getElementById('categoria').value,
        subcategoria: document.getElementById('subcategoria').value,
        conta: document.getElementById('conta').value,
        pagamento: 'Crédito',
        valor: valorParcela,
        data: d.toISOString().split('T')[0],
        descricao: `${document.getElementById('descricao').value || ''} (${i + 1}/${qtd})`,
        usuario: user.login
      };

      await post('addLancamentoFuturo', payload);
    }

  } else {
    // ===============================
    // LANÇAMENTO NORMAL
    // ===============================
    const payload = {
      tipo,
      categoria: document.getElementById('categoria').value,
      subcategoria: document.getElementById('subcategoria').value,
      conta: document.getElementById('conta').value,
      pagamento,
      valor: document.getElementById('valor').value.replace(',', '.'),
      data: document.getElementById('data').value,
      descricao: document.getElementById('descricao').value,
      usuario: user.login
    };

    await post(
      isFuturo ? 'addLancamentoFuturo' : 'addLancamento',
      payload
    );
  }

  e.target.reset();

  await carregarLancamentos();
  await carregarLancamentosFuturos();

  renderResumo();
  renderTabelas();
  renderLancamentosFuturos();
}

// ======================================================
// RESUMO GERAL (ABA NOVA)
// ======================================================

// Calcula os totais gerais (CORRIGIDO)
function calcularResumoGeral() {

  // ===============================
  // SALDO ATUAL
  // ===============================
  const entradas = lancamentos
    .filter(l => l[2] === 'ENTRADA')
    .reduce((s, l) => s + parseValorBR(l[7]), 0);

  const saidas = lancamentos
    .filter(l => l[2] === 'SAIDA')
    .reduce((s, l) => s + parseValorBR(l[7]), 0);

  const saldoAtual = entradas - saidas;

  // ===============================
// FUTUROS
// ===============================
let entradasFuturas = 0;
let saidasFuturas = 0;

  // agrupa crédito por descrição + conta
  const gruposCredito = {};

  lancamentosFuturos.forEach(l => {
    const tipo = l[2];
    const pagamento = l[6];
    const valor = parseValorBR(l[7]);
    const descricao = (l[8] || '').trim();
    const conta = l[5];
    const fatura = l[11];

    // ---------- ENTRADAS ----------
    if (tipo === 'ENTRADA') {
      entradasFuturas += valor;
      return;
    }

    // ---------- SAÍDAS NÃO CRÉDITO ----------
    if (tipo === 'SAIDA' && pagamento !== 'Crédito') {
      saidasFuturas += valor;
      return;
    }

    // ---------- CRÉDITO ----------
    if (tipo === 'SAIDA' && pagamento === 'Crédito') {
      const chave = `${conta}||${descricao}`;

      if (!gruposCredito[chave]) {
        gruposCredito[chave] = [];
      }

      gruposCredito[chave].push({
        valor,
        fatura
      });
    }
  });

  // ===============================
  // CRÉDITO: FATURA ÚNICA × PARCELADO
  // ===============================
  Object.values(gruposCredito).forEach(grupo => {

    const faturasUnicas = [...new Set(grupo.map(g => g.fatura))];

    // 👉 NÃO parcelado (tudo mesma fatura)
    if (faturasUnicas.length === 1) {
      grupo.forEach(g => {
        saidasFuturas += g.valor;
      });
      return;
    }

    // 👉 PARCELADO → menor fatura
    const menorFatura = faturasUnicas.sort()[0];
    grupo
      .filter(g => g.fatura === menorFatura)
      .forEach(g => {
        saidasFuturas += g.valor;
      });
  });

  

  const saldoProjetado = saldoAtual + entradasFuturas - saidasFuturas;

  return {
    entradas,
    saidas,
    entradasFuturas,
    saidasFuturas,
    saldoAtual,
    saldoProjetado
  };
}


// Renderiza os cards do Resumo Geral
function renderResumoGeral() {
  const container = document.getElementById('cards-resumo-geral');
  if (!container) return;

  const r = calcularResumoGeral();

  container.innerHTML = `
    <div class="card resumo entrada">
      <span>Entradas</span>
      <strong>${formatMoney(r.entradas)}</strong>
    </div>

    <div class="card resumo saida">
      <span>Saídas</span>
      <strong>${formatMoney(r.saidas)}</strong>
    </div>

    <div class="card resumo futuro">
      <span>Entradas futuras</span>
      <strong style="color:green">${formatMoney(r.entradasFuturas)}</strong>
    </div>

    <div class="card resumo futuro">
      <span>Saídas futuras</span>
      <strong style="color:red">${formatMoney(r.saidasFuturas)}</strong>
    </div>

    <div class="card resumo saldo">
      <span>Saldo atual</span>
      <strong>${formatMoney(r.saldoAtual)}</strong>
    </div>

    <div class="card resumo projetado">
      <span>Saldo projetado</span>
      <strong>${formatMoney(r.saldoProjetado)}</strong>
    </div>
  `;
}

// ======================================================
// MODAL – EDIÇÃO DE LANÇAMENTO FUTURO
// ======================================================
function abrirModalEdicaoFuturo(l) {
  const modal = document.createElement('div');
  modal.className = 'modal-edicao';

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <h3>Editar Despesa a Vencer</h3>

      <label>Data</label>
      <input type="date" id="edit-data" value="${formatarDataISO(l[1])}">

      <label>Categoria</label>
      <select id="edit-categoria"></select>

      <label>Subcategoria</label>
      <select id="edit-subcategoria"></select>

      <label>Conta</label>
      <select id="edit-conta"></select>

      <label>Forma de Pagamento/Recebimento</label>
      <select id="edit-pagamento"></select>


      <label>Valor</label>
      <input type="number" id="edit-valor" step="0.01" value="${l[7]}">

      <label>Descrição</label>
      <input type="text" id="edit-descricao" value="${l[8] || ''}">

      <div class="modal-acoes">
        <button id="btn-cancelar">Cancelar</button>
        <button id="btn-salvar">Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // FECHAR
  modal.querySelector('.modal-overlay').onclick =
  modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

  // PREENCHER SELECTS
  preencherSelectCategoriasEdicao(l);
  preencherSelectContasEdicao(l);
  preencherSelectPagamentosEdicao(l);


  // SALVAR
  modal.querySelector('#btn-salvar').onclick = async () => {
    const payload = {
      id: l[0],
      data: document.getElementById('edit-data').value,
      tipo: l[2],
      categoria: document.getElementById('edit-categoria').value,
      subcategoria: document.getElementById('edit-subcategoria').value,
      conta: document.getElementById('edit-conta').value,
      pagamento: document.getElementById('edit-pagamento').value, // 👈 NOVO
      valor: document.getElementById('edit-valor').value,
      descricao: document.getElementById('edit-descricao').value,
      usuario: usuarioLogado
    };


    await post('updateLancamentoFuturo', payload);

    modal.remove();

    await carregarLancamentosFuturos();
    renderLancamentosFuturos();
  };
}

// ======================================================
// HELPERS – MODAL FUTURO
// ======================================================
function formatarDataISO(data) {
  if (!data) return '';

  // Já está em ISO
  if (data.includes('-')) return data;

  // Está em BR
  if (data.includes('/')) {
    const [d, m, a] = data.split('/');
    return `${a}-${m}-${d}`;
  }

  return '';
}

function preencherSelectCategoriasEdicao(l) {
  const selCat = document.getElementById('edit-categoria');
  const selSub = document.getElementById('edit-subcategoria');

  selCat.innerHTML = '';
  selSub.innerHTML = '';

  const cats = categorias.filter(c => c.tipo === l[2]);

  [...new Set(cats.map(c => c.categoria))].forEach(c => {
    selCat.innerHTML += `<option ${c === l[3] ? 'selected' : ''}>${c}</option>`;
  });

  function carregarSub() {
    selSub.innerHTML = '';
    cats
      .filter(c => c.categoria === selCat.value)
      .forEach(c => {
        selSub.innerHTML += `<option ${c.subcategoria === l[4] ? 'selected' : ''}>${c.subcategoria}</option>`;
      });
  }

  selCat.onchange = carregarSub;
  carregarSub();
}

function preencherSelectContasEdicao(l) {
  const sel = document.getElementById('edit-conta');
  sel.innerHTML = '';

  contas.forEach(c => {
    sel.innerHTML += `<option ${c.nome === l[5] ? 'selected' : ''}>${c.nome}</option>`;
  });
}

// ======================================================
// SELECT – PAGAMENTOS (EDIÇÃO)
// ======================================================
function preencherSelectPagamentosEdicao(l) {
  const sel = document.getElementById('edit-pagamento');
  if (!sel) return;

  sel.innerHTML = '';

  pagamentos.forEach(p => {
    sel.innerHTML += `
      <option ${p.nome === l[6] ? 'selected' : ''}>
        ${p.nome}
      </option>
    `;
  });
}


// ======================================================
// MODAL – LANÇAMENTOS NORMAIS (POR CATEGORIA)
// ======================================================
function abrirModalLancamentosCategoria(categoria) {
  const modal = document.createElement('div');
  modal.className = 'modal-edicao';

  const lista = lancamentos.filter(l => l[3] === categoria);

  

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <h3>${categoria}</h3>
      <div id="lista-lancamentos"></div>

      <div class="modal-acoes">
        <button id="btn-cancelar">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.modal-overlay').onclick =
  modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

  const container = modal.querySelector('#lista-lancamentos');

  lista
    .sort((a, b) => new Date(a[1]) - new Date(b[1]))
    .forEach(l => {
      const div = document.createElement('div');
      div.className = 'modal-item';

      div.innerHTML = `
        <span>${formatarDataBR(l[1])} – ${l[4]}</span>
        <strong>${formatMoney(l[7])}</strong>
        <div class="modal-actions">
          <button class="btn-editar">Editar</button>
          <button class="btn-excluir">Excluir</button>
        </div>
      `;

      div.querySelector('.btn-editar').onclick = () => {
        modal.remove();
        abrirModalEdicaoLancamento(l);
      };

      div.querySelector('.btn-excluir').onclick = async () => {
        if (!confirm('Deseja excluir este lançamento?')) return;

        await post('deleteLancamento', { id: l[0] });

        modal.remove();
        await carregarLancamentos();
        renderResumo();
        renderTabelas();
      };

      container.appendChild(div);
    });
}

// ======================================================
// MODAL – EDIÇÃO DE LANÇAMENTO NORMAL
// ======================================================
function abrirModalEdicaoLancamento(l) {
  const modal = document.createElement('div');
  modal.className = 'modal-edicao';

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <h3>Editar Lançamento</h3>

      <label>Data</label>
      <input type="date" id="edit-data" value="${formatarDataISO(l[1])}">

      <label>Categoria</label>
      <select id="edit-categoria"></select>

      <label>Subcategoria</label>
      <select id="edit-subcategoria"></select>

      <label>Conta</label>
      <select id="edit-conta"></select>

      <label>Forma de Pagamento/Recebimento</label>
      <select id="edit-pagamento"></select>

      <label>Valor</label>
      <input type="number" id="edit-valor" step="0.01" value="${l[7]}">

      <label>Descrição</label>
      <input type="text" id="edit-descricao" value="${l[8] || ''}">

      <div class="modal-acoes">
        <button id="btn-cancelar">Cancelar</button>
        <button id="btn-salvar">Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.modal-overlay').onclick =
  modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

  preencherSelectCategoriasEdicao(l);
  preencherSelectContasEdicao(l);
  preencherSelectPagamentosEdicao(l);

  modal.querySelector('#btn-salvar').onclick = async () => {
    const user = getUsuarioLogado();
    if (!user) {
      alert('Sessão expirada');
      modal.remove();
      mostrarLogin();
      return;
    }

    const payload = {
      id: l[0],
      data: document.getElementById('edit-data').value,
      tipo: l[2],
      categoria: document.getElementById('edit-categoria').value,
      subcategoria: document.getElementById('edit-subcategoria').value,
      conta: document.getElementById('edit-conta').value,
      pagamento: document.getElementById('edit-pagamento').value,
      valor: document.getElementById('edit-valor').value,
      descricao: document.getElementById('edit-descricao').value,
      usuario: user.login
    };

    await post('updateLancamento', payload);

    modal.remove();

    await carregarLancamentos();
    renderResumo();
    renderTabelas();
  };
}

// ======================================================
// MODAL – ENTRADAS (POR CATEGORIA)
// ======================================================
function abrirModalEntradasCategoria(categoria) {
  const modal = document.createElement('div');
  modal.className = 'modal-edicao';

  const lista = lancamentos.filter(
    l => l[2] === 'ENTRADA' && l[3] === categoria
  );

  if (!lista.length) {
    alert('Nenhuma entrada registrada nesta categoria.');
    return;
  }

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <h3>Entradas – ${categoria}</h3>
      <div id="lista-entradas"></div>

      <div class="modal-acoes">
        <button id="btn-cancelar">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.modal-overlay').onclick =
  modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

  const container = modal.querySelector('#lista-entradas');

  lista
    .sort((a, b) => new Date(a[1]) - new Date(b[1]))
    .forEach(l => {
      const div = document.createElement('div');
      div.className = 'modal-item';

      div.innerHTML = `
        <span>${formatarDataBR(l[1])} – ${l[6]}</span>
        <strong>${formatMoney(l[7])}</strong>
        <div class="modal-actions">
          <button class="btn-editar">Editar</button>
          <button class="btn-excluir">Excluir</button>
        </div>
      `;

      // EDITAR
      div.querySelector('.btn-editar').onclick = () => {
        modal.remove();
        abrirModalEdicaoEntrada(l);
      };

      // EXCLUIR
      div.querySelector('.btn-excluir').onclick = async () => {
        if (!confirm('Deseja excluir esta entrada?')) return;

        await post('deleteLancamento', { id: l[0] });

        modal.remove();
        await carregarLancamentos();
        renderResumo();
        renderTabelas();
      };

      container.appendChild(div);
    });
}


// ======================================================
// MODAL – EDIÇÃO DE ENTRADA
// ======================================================
function abrirModalEditarConta(conta) {
  const modal = document.createElement('div');
  modal.className = 'modal-edicao';

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <h3>Editar Conta</h3>

      <label>Nome</label>
      <input type="text" id="edit-nome" value="${conta.nome}" readonly>

      <label>Ativo</label>
      <select id="edit-ativo">
        <option value="SIM" ${conta.ativo === 'SIM' ? 'selected' : ''}>SIM</option>
        <option value="NAO" ${conta.ativo === 'NAO' ? 'selected' : ''}>NÃO</option>
      </select>

      <label>Bandeira</label>
      <select id="edit-bandeira">
        <option>VISA</option>
        <option>MASTERCARD</option>
        <option>ELO</option>
      </select>

      <label>Skin</label>
      <input type="text" id="edit-skin" value="${conta.skin || ''}">

      <label>Mostrar no Resumo</label>
      <select id="edit-resumo">
        <option value="SIM" ${conta.mostrarResumo === 'SIM' ? 'selected' : ''}>SIM</option>
        <option value="NAO" ${conta.mostrarResumo === 'NAO' ? 'selected' : ''}>NÃO</option>
      </select>

      <label>Ordem</label>
      <input type="number" id="edit-ordem" value="${conta.ordem || 0}">

      <div class="modal-acoes">
        <button id="btn-cancelar">Cancelar</button>
        <button id="btn-salvar">Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.modal-overlay').onclick =
  modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

  modal.querySelector('#edit-bandeira').value = conta.bandeira;

  modal.querySelector('#btn-salvar').onclick = async () => {
    await post('updateConta', {
      id: conta.id,
      nome: document.getElementById('edit-nome').value, // 🔒 preservado
      ativo: document.getElementById('edit-ativo').value,
      bandeira: document.getElementById('edit-bandeira').value,
      skin: document.getElementById('edit-skin').value,
      mostrarResumo: document.getElementById('edit-resumo').value,
      ordem: document.getElementById('edit-ordem').value
    });

    modal.remove();
    await carregarContas();
    renderTabelaContas();
    renderResumo();
  };
}

// ======================================================
// MODAL – EDIÇÃO DE ENTRADA (FALTAVA)
// ======================================================
function abrirModalEdicaoEntrada(l) {
  const modal = document.createElement('div');
  modal.className = 'modal-edicao';

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <h3>Editar Entrada</h3>

      <label>Data</label>
      <input type="date" id="edit-data" value="${formatarDataISO(l[1])}">

      <label>Categoria</label>
      <select id="edit-categoria"></select>

      <label>Subcategoria</label>
      <select id="edit-subcategoria"></select>

      <label>Conta</label>
      <select id="edit-conta"></select>

      <label>Forma de Recebimento</label>
      <select id="edit-pagamento"></select>

      <label>Valor</label>
      <input type="number" id="edit-valor" step="0.01" value="${l[7]}">

      <label>Descrição</label>
      <input type="text" id="edit-descricao" value="${l[8] || ''}">

      <div class="modal-acoes">
        <button id="btn-cancelar">Cancelar</button>
        <button id="btn-salvar">Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.modal-overlay').onclick =
  modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

  // Preenche selects
  preencherSelectCategoriasEdicao(l);
  preencherSelectContasEdicao(l);
  preencherSelectPagamentosEdicao(l);

  modal.querySelector('#btn-salvar').onclick = async () => {
    const user = getUsuarioLogado();
    if (!user) {
      alert('Sessão expirada');
      modal.remove();
      mostrarLogin();
      return;
    }

    const payload = {
      id: l[0],
      data: document.getElementById('edit-data').value,
      tipo: 'ENTRADA',
      categoria: document.getElementById('edit-categoria').value,
      subcategoria: document.getElementById('edit-subcategoria').value,
      conta: document.getElementById('edit-conta').value,
      pagamento: document.getElementById('edit-pagamento').value,
      valor: document.getElementById('edit-valor').value,
      descricao: document.getElementById('edit-descricao').value,
      usuario: user.login
    };

    await post('updateLancamento', payload);

    modal.remove();

    await carregarLancamentos();
    renderResumo();
    renderTabelas();
  };
}

// ======================================================
// BOTÃO PAGAR TUDO – CONTROLE
// ======================================================
function controlarBotaoPagarTudo() {
  const btn = document.getElementById('btnPagarTudo');
  if (!btn) return;

  const filtroAtivo =
    filtrosFuturos.mes !== '' ||
    filtrosFuturos.ano !== '' ||
    filtrosFuturos.conta !== '';

  btn.disabled = !filtroAtivo || lancamentosFuturosFiltrados.length === 0;
}

// ======================================================
// PAGAR TODOS OS LANÇAMENTOS FILTRADOS
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnPagarTudo');
  if (!btn) return;

  btn.onclick = async () => {

    if (!lancamentosFuturosFiltrados.length) return;

    const confirmacao = confirm(
      `Confirmar pagamento de ${lancamentosFuturosFiltrados.length} lançamentos filtrados?`
    );

    if (!confirmacao) return;

    // ✅ DATA LOCAL (SEM UTC)
    const hoje = new Date();
    const dataPagamento = hoje.toLocaleDateString('en-CA');

    // ⚠️ processa um por um, mantendo regra atual
    for (const l of [...lancamentosFuturosFiltrados]) {
      await post('confirmarLancamentoFuturo', {
        id: l[0],
        data: dataPagamento
      });

      lancamentosFuturos = lancamentosFuturos.filter(f => f[0] !== l[0]);
    }

    // ✅ LIMPEZA FINAL (AQUI É O LUGAR CERTO)
    lancamentosFuturosFiltrados = [];
    controlarBotaoPagarTudo();

    // 🔁 Recarrega lançamentos reais
    await carregarLancamentos();

    // 🔄 Reaplica filtros
    aplicarFiltrosLancamentosFuturos();

    // 🔄 Atualiza telas
    renderResumo();
    renderTabelas();

    // 🔄 Atualiza período visual
    const el = document.getElementById('periodoAtual');
    if (el) {
      const d = new Date(dataPagamento);
      el.innerText = d.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      });
    }
  };
});

// ======================================================
// MENU LATERAL + NAVEGAÇÃO ENTRE ABAS (FINAL / CORRETO)
// ======================================================
document.addEventListener('DOMContentLoaded', () => {

  const btnMenu     = document.getElementById('btnMenu');
  const sideMenu    = document.getElementById('sideMenu');
  const menuOverlay = document.getElementById('menuOverlay');

  const links = document.querySelectorAll('.side-link');
  const abas  = document.querySelectorAll('.tab-content');

  if (!btnMenu || !sideMenu || !menuOverlay) return;

  // ---------------- ABRIR MENU ----------------
  btnMenu.addEventListener('click', () => {
    sideMenu.classList.add('open');
    menuOverlay.classList.remove('hidden');
  });

  // ---------------- FECHAR MENU ----------------
  menuOverlay.addEventListener('click', () => {
    sideMenu.classList.remove('open');
    menuOverlay.classList.add('hidden');
  });

  // ---------------- NAVEGAÇÃO ENTRE ABAS ----------------
  links.forEach(link => {
    link.addEventListener('click', () => {

      const alvo = link.dataset.tab;
      if (!alvo) return;

      // remove estados
      links.forEach(l => l.classList.remove('active'));
      abas.forEach(a => a.classList.remove('active'));

      // ativa selecionado
      link.classList.add('active');
      const abaAtiva = document.getElementById(`tab-${alvo}`);
      if (abaAtiva) abaAtiva.classList.add('active');

      // fecha menu após clique (mobile)
      sideMenu.classList.remove('open');
      menuOverlay.classList.add('hidden');

      // gancho especial
      if (alvo === 'resumo-geral') {
        renderResumoGeral();
      }
    });
  });

});

// ======================================================
// MOBILE – ABRIR / FECHAR TABELAS (SAFE)
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tabela-box h2').forEach(h => {
    h.addEventListener('click', () => {
      h.closest('.tabela-box')?.classList.toggle('aberta');
    });
  });
});

