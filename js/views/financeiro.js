import { $, $$, escapeHtml, toast, openModal, closeModal, confirmAction, todayISO, formatDate } from "../utils.js";
import { createDoc, saveDoc, removeDoc, createDocWithId } from "../db.js";

// ============================================================================
// Financeiro — saldo, lançamentos de entrada/saída, controle de mensalidade
// por mês (só jogadores marcados como "pagante" no cadastro) e histórico de
// transações. Tudo guardado na coleção `financeiro` (uma linha por
// lançamento) + um documento único `configuracoes/geral` com o valor atual
// da mensalidade.
// ============================================================================

// Mês em que o controle financeiro do time começou — a lista de meses
// "passados/atual" da tela sempre parte daqui, nunca antes.
const MES_INICIO = "2026-08";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesAtualRef(){
  return todayISO().slice(0, 7);
}

function addMeses(mesRef, delta){
  const [ano, mes] = mesRef.split("-").map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesesEntre(inicio, fim){
  const out = [];
  let cur = inicio;
  while (cur <= fim){
    out.push(cur);
    cur = addMeses(cur, 1);
  }
  return out;
}

function mesLabel(mesRef){
  const [ano, mes] = mesRef.split("-").map(Number);
  return `${MESES_PT[mes - 1]}/${ano}`;
}

function fmtBRL(n){
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Primeiro mês em que o jogador passa a dever mensalidade ("Paga mensalidade
// desde" no cadastro). Sem preenchimento, vale desde o início do controle.
function inicioPagamento(atleta){
  return atleta.pagoDesde && atleta.pagoDesde > MES_INICIO ? atleta.pagoDesde : MES_INICIO;
}
const pagouMes = (transacoes, mesRef, atletaId) => transacoes.some(t => t.tipo === "mensalidade" && t.mesRef === mesRef && t.atletaId === atletaId);
const isentoMes = (transacoes, mesRef, atletaId) => transacoes.some(t => t.tipo === "isencao" && t.mesRef === mesRef && t.atletaId === atletaId);

function idIsencao(mesRef, atletaId){
  return `isen_${mesRef}_${atletaId}`;
}

function idMensalidade(mesRef, atletaId){
  return `mens_${mesRef}_${atletaId}`;
}

// Quantos meses passados/atual aparecem direto na tela principal — o
// restante do histórico (conforme os meses forem se acumulando) fica só no
// botão "Ver todas". No mobile, 3 é o que cabe lado a lado sem espremer.
const MESES_VISIVEIS_TELA = 3;

// Monta o "tile" de um mês (nome + quantas mensalidades já foram pagas) —
// usado tanto na tela principal quanto nos modais de meses futuros/todos.
function mesTileHtml(mesRef, transacoes, pagantesAtivos){
  // Conta quem deve (ou já pagou) naquele mês: ignora quem ainda não tinha
  // começado a pagar e quem está isento.
  const base = pagantesAtivos.filter(a => pagouMes(transacoes, mesRef, a.id)
    || (inicioPagamento(a) <= mesRef && !isentoMes(transacoes, mesRef, a.id)));
  const pagos = base.filter(a => pagouMes(transacoes, mesRef, a.id)).length;
  return `
    <button type="button" class="mes-tile" data-mes="${mesRef}">
      <div class="mes-nome">${mesLabel(mesRef)}</div>
      <div class="mes-sub">${pagos}/${base.length} pagas</div>
    </button>`;
}

// ----------------------------------------------------------------------------
// Lançar Entrada / Saída
// ----------------------------------------------------------------------------
function openTransacaoForm(tipo){
  const label = tipo === "entrada" ? "Entrada" : "Saída";
  openModal(`
    <div class="modal-head">
      <h3>Nova ${label}</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <form id="form-transacao">
        <div class="form-grid">
          <div class="field">
            <label>Valor (R$) *</label>
            <input type="number" name="valor" min="0.01" step="0.01" required>
          </div>
          <div class="field">
            <label>Data *</label>
            <input type="date" name="data" value="${todayISO()}" required>
          </div>
          <div class="field span-2">
            <label>Descrição</label>
            <input type="text" name="descricao" placeholder="Ex.: compra de bolas, aluguel de campo…">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  $("#form-transacao").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const valor = Number(fd.get("valor"));
    if (!valor || valor <= 0){ toast("Informe um valor válido.", "err"); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try{
      await createDoc("financeiro", {
        tipo,
        valor,
        data: fd.get("data") || todayISO(),
        descricao: (fd.get("descricao") || "").trim(),
      });
      toast(`${label} lançada.`, "ok");
      closeModal();
    }catch(err){
      console.error(err);
      toast("Erro ao salvar: " + err.message, "err");
      btn.disabled = false;
    }
  });
}

// ----------------------------------------------------------------------------
// Editar uma transação já lançada (data, valor, descrição) — vale pra
// qualquer tipo (entrada, saída ou mensalidade); o tipo em si não muda.
// ----------------------------------------------------------------------------
function openEditTransacaoForm(t){
  const tipoLabel = t.tipo === "entrada" ? "Entrada" : t.tipo === "saida" ? "Saída" : "Mensalidade";
  openModal(`
    <div class="modal-head">
      <h3>Editar ${tipoLabel}</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <form id="form-editar-transacao">
        <div class="form-grid">
          <div class="field">
            <label>Valor (R$) *</label>
            <input type="number" name="valor" min="0.01" step="0.01" value="${t.valor ?? ""}" required>
          </div>
          <div class="field">
            <label>Data *</label>
            <input type="date" name="data" value="${t.data || todayISO()}" required>
          </div>
          <div class="field span-2">
            <label>Descrição</label>
            <input type="text" name="descricao" value="${escapeHtml(t.descricao || "")}" placeholder="Ex.: compra de bolas, aluguel de campo…">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  $("#form-editar-transacao").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const valor = Number(fd.get("valor"));
    if (!valor || valor <= 0){ toast("Informe um valor válido.", "err"); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try{
      await saveDoc("financeiro", t.id, {
        valor,
        data: fd.get("data") || todayISO(),
        descricao: (fd.get("descricao") || "").trim(),
      });
      toast(`${tipoLabel} atualizada.`, "ok");
      closeModal();
    }catch(err){
      console.error(err);
      toast("Erro ao salvar: " + err.message, "err");
      btn.disabled = false;
    }
  });
}

// ----------------------------------------------------------------------------
// Valor da mensalidade (configuracoes/geral) — mudar aqui NÃO altera
// mensalidades já marcadas como pagas (cada uma guarda o valor de quando foi
// paga), só passa a valer pros próximos lançamentos.
// ----------------------------------------------------------------------------
function openConfigMensalidadeForm(state){
  const atual = state.configFinanceiro?.valorMensalidade ?? 0;
  openModal(`
    <div class="modal-head">
      <h3>Valor da mensalidade</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <form id="form-mensalidade-valor">
        <div class="field">
          <label>Valor (R$) *</label>
          <input type="number" name="valor" min="0" step="0.01" value="${atual || ""}" required>
        </div>
        <p class="field-hint">Esse valor vale a partir de agora — mensalidades já marcadas como pagas não mudam retroativamente.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  $("#form-mensalidade-valor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const valor = Number(new FormData(e.target).get("valor"));
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try{
      await createDocWithId("configuracoes", "geral", { valorMensalidade: valor });
      toast("Valor da mensalidade atualizado.", "ok");
      closeModal();
    }catch(err){
      console.error(err);
      toast("Erro ao salvar: " + err.message, "err");
      btn.disabled = false;
    }
  });
}

// ----------------------------------------------------------------------------
// Detalhe de um mês — lista de jogadores pagantes ativos com checkbox de
// pago/não pago (idempotente: id fixo por mês+atleta) + botão de copiar a
// lista pra colar no WhatsApp.
// ----------------------------------------------------------------------------
function openMesDetalhe(mesRef, state){
  const valorMensalidade = state.configFinanceiro?.valorMensalidade ?? 0;
  const transacoes = state.financeiro || [];
  // Quem aparece: pagantes ativos que já começaram a pagar nesse mês (ou que
  // já têm pagamento/isenção registrados nele).
  const atletasPagantes = (state.atletas || [])
    .filter(a => a.pagante && a.ativo !== false
      && (inicioPagamento(a) <= mesRef || pagouMes(transacoes, mesRef, a.id) || isentoMes(transacoes, mesRef, a.id)))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

  const estado = {}; // atletaId -> "pago" | "pendente" | "isento"
  atletasPagantes.forEach(a => {
    estado[a.id] = pagouMes(transacoes, mesRef, a.id) ? "pago" : isentoMes(transacoes, mesRef, a.id) ? "isento" : "pendente";
  });
  const badgeCls = (e) => e === "pago" ? "badge-ok" : e === "isento" ? "badge-pending" : "badge-off";
  const badgeTxt = (e) => e === "pago" ? "Pago" : e === "isento" ? "Isento" : "Não pago";

  const rowsHtml = atletasPagantes.map(a => `
      <div class="event-row" style="justify-content:space-between; gap:8px;" data-atleta-row="${a.id}">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
          <input type="checkbox" data-atleta-id="${a.id}" ${estado[a.id] === "pago" ? "checked" : ""} ${estado[a.id] === "isento" ? "disabled" : ""} style="width:16px; height:16px;">
          ${escapeHtml(a.nome)}
        </label>
        <span class="badge ${badgeCls(estado[a.id])}">${badgeTxt(estado[a.id])}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-isentar" data-atleta-id="${a.id}" ${estado[a.id] === "pago" ? "disabled" : ""}>${estado[a.id] === "isento" ? "Cobrar" : "Isentar"}</button>
      </div>`).join("");

  openModal(`
    <div class="modal-head">
      <h3>Mensalidades — ${mesLabel(mesRef)}</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <p class="field-hint" style="margin-bottom:10px;">Valor da mensalidade: <strong>${fmtBRL(valorMensalidade)}</strong>. "Isentar" tira o jogador da cobrança só deste mês (ex.: ficou parado).</p>
      ${atletasPagantes.length ? rowsHtml : `<p style="color:var(--ink-faint); font-style:italic;">Nenhum jogador pagante ativo cadastrado para este mês.</p>`}
      <div class="form-actions" style="justify-content:space-between;">
        <button type="button" class="btn btn-ghost" id="btn-copiar-lista">Copiar lista p/ WhatsApp</button>
        <button type="button" class="btn btn-primary" data-close>Fechar</button>
      </div>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  // Atualiza a linha (badge, checkbox, botão) conforme o estado do jogador.
  const atualizarLinha = (atletaId) => {
    const row = document.querySelector(`[data-atleta-row="${atletaId}"]`);
    if (!row) return;
    const e = estado[atletaId];
    const badge = row.querySelector(".badge");
    badge.textContent = badgeTxt(e);
    badge.className = `badge ${badgeCls(e)}`;
    const chk = row.querySelector("input[type=checkbox]");
    chk.checked = e === "pago";
    chk.disabled = e === "isento";
    const btn = row.querySelector(".btn-isentar");
    btn.disabled = e === "pago";
    btn.textContent = e === "isento" ? "Cobrar" : "Isentar";
  };

  $$("input[type=checkbox][data-atleta-id]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const atletaId = chk.dataset.atletaId;
      const atleta = atletasPagantes.find(a => a.id === atletaId);
      const docId = idMensalidade(mesRef, atletaId);
      const anterior = estado[atletaId];
      chk.disabled = true;
      try{
        if (chk.checked){
          await createDocWithId("financeiro", docId, {
            tipo: "mensalidade",
            valor: valorMensalidade,
            data: todayISO(),
            descricao: `Mensalidade ${mesLabel(mesRef)} — ${atleta.nome}`,
            atletaId,
            mesRef,
          });
          estado[atletaId] = "pago";
        } else {
          await removeDoc("financeiro", docId);
          estado[atletaId] = "pendente";
        }
      }catch(err){
        console.error(err);
        toast("Erro ao atualizar: " + err.message, "err");
        estado[atletaId] = anterior;
      }
      atualizarLinha(atletaId);
    });
  });

  $$(".btn-isentar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const atletaId = btn.dataset.atletaId;
      const atleta = atletasPagantes.find(a => a.id === atletaId);
      const docId = idIsencao(mesRef, atletaId);
      btn.disabled = true;
      try{
        if (estado[atletaId] === "isento"){
          await removeDoc("financeiro", docId);
          estado[atletaId] = "pendente";
        } else {
          await createDocWithId("financeiro", docId, {
            tipo: "isencao",
            valor: 0,
            data: todayISO(),
            descricao: `Isento ${mesLabel(mesRef)} — ${atleta.nome}`,
            atletaId,
            mesRef,
          });
          estado[atletaId] = "isento";
        }
      }catch(err){
        console.error(err);
        toast("Erro ao atualizar: " + err.message, "err");
      }
      atualizarLinha(atletaId);
    });
  });

  $("#btn-copiar-lista")?.addEventListener("click", async () => {
    const icone = { pago: "✅", pendente: "❌", isento: "➖" };
    const linhas = atletasPagantes.map(a => `${icone[estado[a.id]]} ${a.nome}${estado[a.id] === "isento" ? " (isento)" : ""}`);
    const texto = `*Mensalidades — ${mesLabel(mesRef)}*\n${linhas.join("\n")}`;
    try{
      await navigator.clipboard.writeText(texto);
      toast("Lista copiada! Cole no WhatsApp.", "ok");
    }catch(err){
      toast("Não foi possível copiar automaticamente.", "err");
    }
  });
}

// ----------------------------------------------------------------------------
// Meses futuros — botão pequeno na tela principal, pra lançar mensalidade
// adiantada sem poluir a lista padrão (que só mostra passado/atual).
// ----------------------------------------------------------------------------
function openMesesFuturos(state){
  const atual = mesAtualRef();
  const meses = mesesEntre(addMeses(atual, 1), addMeses(atual, 6));
  const tilesHtml = meses.map(m => `
    <button type="button" class="mes-tile" data-mes="${m}">
      <div class="mes-nome">${mesLabel(m)}</div>
      <div class="mes-sub">Lançar mensalidades</div>
    </button>`).join("");

  openModal(`
    <div class="modal-head">
      <h3>Meses futuros</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="mes-grid">${tilesHtml}</div>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  $$(".mes-tile").forEach(btn => {
    btn.addEventListener("click", () => openMesDetalhe(btn.dataset.mes, state));
  });
}

// ----------------------------------------------------------------------------
// Ver todas — a tela principal só mostra os meses mais recentes (pra não
// espremer no mobile); esse modal lista o histórico completo, desde
// MES_INICIO até o mês atual, conforme ele for crescendo mês a mês.
// ----------------------------------------------------------------------------
function openMesesTodos(state){
  const transacoes = state.financeiro || [];
  const pagantesAtivos = (state.atletas || []).filter(a => a.pagante && a.ativo !== false);
  const todos = mesesEntre(MES_INICIO, mesAtualRef()).reverse();
  const tilesHtml = todos.map(m => mesTileHtml(m, transacoes, pagantesAtivos)).join("");

  openModal(`
    <div class="modal-head">
      <h3>Todos os meses</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="mes-grid">${tilesHtml}</div>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  $$(".mes-tile").forEach(btn => {
    btn.addEventListener("click", () => openMesDetalhe(btn.dataset.mes, state));
  });
}

// ----------------------------------------------------------------------------
// Pendências — quem está devendo mensalidade, mês a mês (de MES_INICIO até o
// mês atual), convertido em valor com a mensalidade atual. Gera uma mensagem
// pronta pra mandar na diretoria.
// ----------------------------------------------------------------------------
function pendenciasPorMes(state){
  const transacoes = state.financeiro || [];
  const pagantes = (state.atletas || []).filter(a => a.pagante && a.ativo !== false)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  return mesesEntre(MES_INICIO, mesAtualRef()).map(mes => ({
    mes,
    // Deve quem já começou a pagar nesse mês, não pagou e não está isento.
    pendentes: pagantes.filter(a => inicioPagamento(a) <= mes && !pagouMes(transacoes, mes, a.id) && !isentoMes(transacoes, mes, a.id)),
    pagos: pagantes.filter(a => pagouMes(transacoes, mes, a.id)).length,
  }));
}

function saldoAtual(transacoes){
  return transacoes.reduce((acc, t) => t.tipo === "saida" ? acc - (t.valor || 0) : acc + (t.valor || 0), 0);
}

function textoPendencias(state){
  const valor = state.configFinanceiro?.valorMensalidade ?? 0;
  const meses = pendenciasPorMes(state);
  const atual = mesAtualRef();
  const comPendencia = meses.filter(m => m.pendentes.length > 0);
  const totalQtd = comPendencia.reduce((s, m) => s + m.pendentes.length, 0);
  const linhas = [`📊 *Mensalidades pendentes — Bom D' Copus*`, `Posição em ${formatDate(todayISO())}`, ""];
  if (!comPendencia.length){
    linhas.push("✅ Nenhuma mensalidade pendente.");
  } else {
    comPendencia.forEach(m => {
      linhas.push(`*${mesLabel(m.mes)}${m.mes === atual ? " (mês atual)" : ""}* — ${m.pendentes.length} pendente${m.pendentes.length > 1 ? "s" : ""} (${fmtBRL(m.pendentes.length * valor)})`);
      m.pendentes.forEach(a => linhas.push(`• ${a.nome}`));
      linhas.push("");
    });
    linhas.push(`💰 *Total pendente: ${fmtBRL(totalQtd * valor)}* (${totalQtd} mensalidade${totalQtd > 1 ? "s" : ""})`);
  }
  linhas.push(`🏦 *Saldo atual do caixa: ${fmtBRL(saldoAtual(state.financeiro || []))}*`, `Valor da mensalidade: ${fmtBRL(valor)}`);
  return linhas.join("\n");
}

function openPendencias(state){
  const valor = state.configFinanceiro?.valorMensalidade ?? 0;
  const meses = pendenciasPorMes(state).filter(m => m.pendentes.length > 0).reverse();
  const totalQtd = meses.reduce((s, m) => s + m.pendentes.length, 0);
  const blocos = meses.map(m => `
    <div class="card card-pad" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:6px;">
        <strong>${mesLabel(m.mes)}${m.mes === mesAtualRef() ? " <span style='font-weight:400; color:var(--ink-soft);'>(mês atual)</span>" : ""}</strong>
        <span style="font-family:var(--font-mono); font-weight:700; color:var(--danger);">${m.pendentes.length} pendente${m.pendentes.length > 1 ? "s" : ""} · ${fmtBRL(m.pendentes.length * valor)}</span>
      </div>
      <div style="font-size:13px; color:var(--ink-soft);">${m.pendentes.map(a => escapeHtml(a.nome)).join(", ")}</div>
    </div>`).join("");

  openModal(`
    <div class="modal-head">
      <h3>Mensalidades pendentes</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="card card-pad" style="margin-bottom:12px;">
        <div class="card-sub" style="margin-bottom:2px;">Total pendente (${totalQtd} mensalidade${totalQtd === 1 ? "" : "s"} × ${fmtBRL(valor)})</div>
        <div style="font-family:var(--font-mono); font-size:26px; font-weight:700; color:${totalQtd ? "var(--danger)" : "var(--ok)"};">${fmtBRL(totalQtd * valor)}</div>
        <div class="card-sub" style="margin:6px 0 0;">Saldo atual do caixa: <strong>${fmtBRL(saldoAtual(state.financeiro || []))}</strong></div>
      </div>
      ${blocos || `<p style="color:var(--ink-faint); font-style:italic;">Nenhuma mensalidade pendente. 🎉</p>`}
      <p class="field-hint">Considera os jogadores pagantes ativos, de ${mesLabel(MES_INICIO)} até o mês atual (respeitando "paga desde" e os meses isentos), no valor atual da mensalidade.</p>
      <div class="form-actions" style="justify-content:space-between;">
        <button type="button" class="btn btn-ghost" id="btn-copiar-pendencias">Copiar mensagem p/ diretoria</button>
        <button type="button" class="btn btn-primary" data-close>Fechar</button>
      </div>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  $("#btn-copiar-pendencias").addEventListener("click", async () => {
    try{ await navigator.clipboard.writeText(textoPendencias(state)); toast("Mensagem copiada! Cole no WhatsApp.", "ok"); }
    catch(err){ toast("Não foi possível copiar automaticamente.", "err"); }
  });
}

// ----------------------------------------------------------------------------
// Extrato financeiro de um jogador ("check-up"): mês a mês, pago ou pendente,
// com totais e mensagem pronta pra compartilhar.
// ----------------------------------------------------------------------------
function extratoJogadorDados(state, atleta){
  const valorAtual = state.configFinanceiro?.valorMensalidade ?? 0;
  const pagas = (state.financeiro || []).filter(t => t.tipo === "mensalidade" && t.atletaId === atleta.id);
  const porMes = Object.fromEntries(pagas.map(t => [t.mesRef, t]));
  // Meses do controle (até o atual) + qualquer mês adiantado que ele já pagou.
  const meses = [...new Set([...mesesEntre(MES_INICIO, mesAtualRef()), ...pagas.map(t => t.mesRef).filter(Boolean)])].sort();
  const eLinha = atleta.pagante;
  const linhas = meses.map(mes => {
    const t = porMes[mes];
    if (t) return { mes, status: "pago", valor: t.valor ?? 0, data: t.data };
    if (isentoMes(state.financeiro || [], mes, atleta.id)) return { mes, status: "isento", valor: 0 };
    if (mes > mesAtualRef() || !eLinha || mes < inicioPagamento(atleta)) return null;
    return { mes, status: "pendente", valor: valorAtual };
  }).filter(Boolean);
  const totalPago = linhas.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0);
  const totalPend = linhas.filter(l => l.status === "pendente").reduce((s, l) => s + l.valor, 0);
  return { linhas, totalPago, totalPend, qtdPagas: linhas.filter(l => l.status === "pago").length, qtdPend: linhas.filter(l => l.status === "pendente").length };
}

function textoExtrato(atleta, d){
  const linhas = [`🧾 *Extrato financeiro — ${atleta.nome}*`, `Posição em ${formatDate(todayISO())}`, ""];
  d.linhas.forEach(l => linhas.push(l.status === "pago"
    ? `✅ ${mesLabel(l.mes)} — pago em ${formatDate(l.data)} (${fmtBRL(l.valor)})`
    : l.status === "isento" ? `➖ ${mesLabel(l.mes)} — isento`
    : `❌ ${mesLabel(l.mes)} — pendente (${fmtBRL(l.valor)})`));
  if (!d.linhas.length) linhas.push("Sem mensalidades no período.");
  linhas.push("", `💰 Pago: ${fmtBRL(d.totalPago)} (${d.qtdPagas} ${d.qtdPagas === 1 ? "mês" : "meses"})`, `⏳ Pendente: ${fmtBRL(d.totalPend)} (${d.qtdPend} ${d.qtdPend === 1 ? "mês" : "meses"})`);
  return linhas.join("\n");
}

function openExtratoJogador(state){
  const transacoes = state.financeiro || [];
  const comPagamento = new Set(transacoes.filter(t => t.tipo === "mensalidade").map(t => t.atletaId));
  const jogadores = (state.atletas || [])
    .filter(a => a.posicao !== "Técnico" && (a.pagante || comPagamento.has(a.id)))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

  openModal(`
    <div class="modal-head">
      <h3>Extrato financeiro do jogador</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="field" style="max-width:340px; margin-bottom:14px;">
        <label>Jogador</label>
        <select id="ext-jogador">
          <option value="">Selecione…</option>
          ${jogadores.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}${a.ativo === false ? " (inativo)" : ""}</option>`).join("")}
        </select>
      </div>
      <div id="ext-corpo"><p style="color:var(--ink-faint); font-style:italic;">Escolha um jogador para ver o extrato.</p></div>
      <div class="form-actions" style="justify-content:space-between;">
        <button type="button" class="btn btn-ghost" id="btn-copiar-extrato" disabled>Copiar extrato</button>
        <button type="button" class="btn btn-primary" data-close>Fechar</button>
      </div>
    </div>
  `, { wide: true });
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  let atual = null;
  $("#ext-jogador").addEventListener("change", (e) => {
    atual = jogadores.find(a => a.id === e.target.value) || null;
    $("#btn-copiar-extrato").disabled = !atual;
    if (!atual){ $("#ext-corpo").innerHTML = ""; return; }
    const d = extratoJogadorDados(state, atual);
    const rows = [...d.linhas].reverse().map(l => `
      <tr>
        <td>${mesLabel(l.mes)}</td>
        <td><span class="badge ${l.status === "pago" ? "badge-ok" : l.status === "isento" ? "badge-off" : "badge-danger"}">${l.status === "pago" ? "Pago" : l.status === "isento" ? "Isento" : "Pendente"}</span></td>
        <td>${l.status === "pago" ? formatDate(l.data) : "—"}</td>
        <td style="font-family:var(--font-mono); font-weight:700;">${l.status === "isento" ? "—" : fmtBRL(l.valor)}</td>
      </tr>`).join("");
    $("#ext-corpo").innerHTML = `
      <div class="kpi-grid" style="margin-bottom:12px;">
        <div class="kpi-tile"><div class="kpi-label">Pago</div><div class="kpi-value" style="font-size:22px;">${fmtBRL(d.totalPago)}</div></div>
        <div class="kpi-tile"><div class="kpi-label">Pendente</div><div class="kpi-value" style="font-size:22px; color:${d.totalPend ? "var(--danger)" : "inherit"};">${fmtBRL(d.totalPend)}</div></div>
        <div class="kpi-tile"><div class="kpi-label">Meses pagos</div><div class="kpi-value">${d.qtdPagas}</div></div>
        <div class="kpi-tile"><div class="kpi-label">Meses pendentes</div><div class="kpi-value">${d.qtdPend}</div></div>
      </div>
      ${atual.pagante && atual.pagoDesde ? `<p class="field-hint">Paga mensalidade desde ${mesLabel(atual.pagoDesde)}.</p>` : ""}
      ${atual.pagante ? "" : `<p class="field-hint">Este jogador não está marcado como pagante — só aparecem os meses que ele já pagou.</p>`}
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th>Situação</th><th>Pago em</th><th>Valor</th></tr></thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="4">Sem mensalidades no período.</td></tr>`}</tbody>
      </table></div>`;
  });
  $("#btn-copiar-extrato").addEventListener("click", async () => {
    if (!atual) return;
    try{ await navigator.clipboard.writeText(textoExtrato(atual, extratoJogadorDados(state, atual))); toast("Extrato copiado!", "ok"); }
    catch(err){ toast("Não foi possível copiar automaticamente.", "err"); }
  });
}

// ----------------------------------------------------------------------------
// Tela principal
// ----------------------------------------------------------------------------
export function renderFinanceiro(root, state){
  const transacoes = state.financeiro || [];

  const saldo = transacoes.reduce((acc, t) => {
    if (t.tipo === "saida") return acc - (t.valor || 0);
    return acc + (t.valor || 0);
  }, 0);

  const mesesPassados = mesesEntre(MES_INICIO, mesAtualRef()).reverse();
  const pagantesAtivos = (state.atletas || []).filter(a => a.pagante && a.ativo !== false);
  const mesesRecentes = mesesPassados.slice(0, MESES_VISIVEIS_TELA);

  const mesesHtml = mesesRecentes.map(m => mesTileHtml(m, transacoes, pagantesAtivos)).join("");

  const atletasPorId = Object.fromEntries((state.atletas || []).map(a => [a.id, a]));
  const historicoOrdenado = transacoes.filter(t => t.tipo !== "isencao").sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  const historicoRows = historicoOrdenado.map(t => {
    const tipoLabel = t.tipo === "entrada" ? "Entrada" : t.tipo === "saida" ? "Saída" : "Mensalidade";
    const tipoBadge = t.tipo === "saida" ? "badge-danger" : t.tipo === "mensalidade" ? "badge-pending" : "badge-ok";
    const sinal = t.tipo === "saida" ? "−" : "+";
    const desc = t.descricao || (t.tipo === "mensalidade" && atletasPorId[t.atletaId]
      ? `Mensalidade — ${atletasPorId[t.atletaId].nome}`
      : "—");
    return `
      <tr>
        <td>${formatDate(t.data)}</td>
        <td><span class="badge ${tipoBadge}">${tipoLabel}</span></td>
        <td>${escapeHtml(desc)}</td>
        <td style="font-family:var(--font-mono); font-weight:700; ${t.tipo === "saida" ? "color:var(--danger);" : "color:var(--ok);"}">${sinal} ${fmtBRL(t.valor || 0)}</td>
        <td class="col-actions">
          <button class="btn btn-ghost btn-sm btn-editar-transacao" data-id="${t.id}" type="button">Editar</button>
          <button class="btn btn-ghost btn-sm btn-excluir-transacao" data-id="${t.id}" type="button">Excluir</button>
        </td>
      </tr>`;
  }).join("");

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Gestão</div>
        <h1>Financeiro</h1>
      </div>
    </div>

    <div class="saldo-hero">
      <div class="lbl">Saldo atual</div>
      <div class="val ${saldo < 0 ? "negativo" : ""}">${fmtBRL(saldo)}</div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn btn-primary" id="btn-entrada" type="button">+ Entrada</button>
        <button class="btn btn-danger" id="btn-saida" type="button">+ Saída</button>
      </div>
    </div>

    <div class="card card-pad" style="margin:18px 0; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div>
        <div class="card-title" style="margin-bottom:2px;">Valor da mensalidade</div>
        <div class="card-sub" style="margin-bottom:0;">${fmtBRL(state.configFinanceiro?.valorMensalidade ?? 0)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btn-editar-mensalidade" type="button">Editar valor</button>
    </div>

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px;">
      <button class="btn btn-primary btn-sm" id="btn-pendencias" type="button">Pendências de mensalidade</button>
      <button class="btn btn-ghost btn-sm" id="btn-extrato-jogador" type="button">Extrato do jogador</button>
    </div>

    <div class="topbar" style="margin-bottom:12px;">
      <h2 style="font-size:18px; margin:0;">Mensalidades por mês</h2>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="btn-ver-todos-meses" type="button">Ver todas</button>
        <button class="btn btn-ghost btn-sm" id="btn-meses-futuros" type="button">Meses futuros</button>
      </div>
    </div>
    <div class="mes-grid">
      ${mesesHtml || `<p style="color:var(--ink-faint); font-style:italic;">Nenhum mês disponível ainda.</p>`}
    </div>

    <h2 style="font-size:18px; margin:26px 0 12px;">Histórico de transações</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>
        <tbody>
          ${historicoRows || `<tr class="empty-row"><td colspan="5">Nenhuma transação lançada ainda.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  $("#btn-pendencias", root).addEventListener("click", () => openPendencias(state));
  $("#btn-extrato-jogador", root).addEventListener("click", () => openExtratoJogador(state));
  $("#btn-entrada", root).addEventListener("click", () => openTransacaoForm("entrada"));
  $("#btn-saida", root).addEventListener("click", () => openTransacaoForm("saida"));
  $("#btn-editar-mensalidade", root).addEventListener("click", () => openConfigMensalidadeForm(state));
  $("#btn-meses-futuros", root).addEventListener("click", () => openMesesFuturos(state));
  $("#btn-ver-todos-meses", root).addEventListener("click", () => openMesesTodos(state));
  $$(".mes-tile", root).forEach(btn => btn.addEventListener("click", () => openMesDetalhe(btn.dataset.mes, state)));
  $$(".btn-editar-transacao", root).forEach(btn => {
    btn.addEventListener("click", () => {
      const t = transacoes.find(x => x.id === btn.dataset.id);
      if (!t) return;
      openEditTransacaoForm(t);
    });
  });
  $$(".btn-excluir-transacao", root).forEach(btn => {
    btn.addEventListener("click", async () => {
      const t = transacoes.find(x => x.id === btn.dataset.id);
      if (!t) return;
      const label = t.tipo === "entrada" ? "esta entrada" : t.tipo === "saida" ? "esta saída" : "esta mensalidade";
      if (!(await confirmAction(`Excluir ${label}? Essa ação não pode ser desfeita.`))) return;
      try{
        await removeDoc("financeiro", t.id);
        toast("Transação excluída.", "ok");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir: " + err.message, "err");
      }
    });
  });
}
