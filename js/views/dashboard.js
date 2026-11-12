import { $, $$, escapeHtml, formatDate, fmt1, toast, getTheme, toggleTheme, reRenderKeepingFocus } from "../utils.js";
import { resumoGeral, resultadoJogo, jogosRealizados, saldoGols, ehJogador, statsPorAtleta, notasDoAtletaNoJogo } from "../stats.js";
import { listenPresencas } from "../db.js";
import { getFiltroPeriodo, setFiltroPeriodo, filtrarPorPeriodo, anosDisponiveis, MESES } from "../filters.js";

function renderQr(containerId, texto){
  const el = document.getElementById(containerId);
  if (!el || typeof qrcode !== "function") return;
  try{
    const qr = qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    el.innerHTML = qr.createImgTag(4, 4);
  }catch(err){
    console.error("Erro ao gerar QR code:", err);
  }
}

const RESULTADO_BADGE = {
  vitoria: `<span class="badge badge-vit">V</span>`,
  empate: `<span class="badge badge-pending">E</span>`,
  derrota: `<span class="badge badge-danger">D</span>`,
};

let outsideClickHandler = null;

let unsubPresenca = null;

// "Damasco 1 x 4 BDC" (placar do adversário primeiro, como na súmula do rival).
function tituloPlacar(j, nomeAdvTexto){
  return `${nomeAdvTexto} ${j.placarAdversario ?? "–"} x ${j.placarNos ?? "–"} BDC`;
}

function pararPresenca(){ if (unsubPresenca){ unsubPresenca(); unsubPresenca = null; } }

// Sequência atual a partir dos resultados mais recentes.
function textoSequencia(recentesDesc){
  const res = recentesDesc.map(resultadoJogo);
  const conta = (fn) => { let n = 0; for (const r of res){ if (fn(r)) n++; else break; } return n; };
  const vit = conta(r => r === "vitoria");
  if (vit >= 2) return `${vit} vitórias seguidas`;
  const inv = conta(r => r && r !== "derrota");
  if (inv >= 2) return `${inv} jogos sem perder`;
  const sv = conta(r => r && r !== "vitoria");
  if (res[0] === "derrota") return sv >= 2 ? `${sv} jogos sem vencer` : "Derrota no último jogo";
  if (res[0] === "vitoria") return "Vitória no último jogo";
  return res[0] === "empate" ? "Empate no último jogo" : "";
}

function diasAte(dataISO){
  if (!dataISO) return null;
  const [a, m, d] = dataISO.split("-").map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

function textoDias(n){
  if (n === null) return "";
  if (n === 0) return "HOJE";
  if (n === 1) return "AMANHÃ";
  if (n < 0) return "DATA PASSADA";
  return `EM ${n} DIAS`;
}

function destaqueMesHtml(s, mes){
  const ini = (s.atleta.nome || "?").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const feitos = [s.gols ? `${s.gols} gol${s.gols > 1 ? "s" : ""}` : "", s.assistencias ? `${s.assistencias} assist.` : ""].filter(Boolean).join(" · ") || `${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"}`;
  return `<a href="#premiacoes" class="dash-mes" style="text-decoration:none; color:inherit;">
    <div class="dash-mes-eyebrow">Destaque de ${escapeHtml(chaveMes(mes))}</div>
    <div class="dash-mes-body">
      <div class="dash-mes-avatar">${escapeHtml(ini)}</div>
      <div style="flex:1; min-width:0;"><div class="podium-name">${escapeHtml(s.atleta.nome)}</div><div class="podium-sub">${escapeHtml(feitos)}</div></div>
      <div class="dash-mes-nota">${fmt1(s.media)}</div>
    </div>
  </a>`;
}

function chaveMes(ref){
  const [a, m] = ref.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}


export function renderDashboard(root, state){
  const filtro = getFiltroPeriodo();
  const todosRealizados = jogosRealizados(state.jogos);
  const anos = anosDisponiveis(todosRealizados);
  const realizadosFiltrados = filtrarPorPeriodo(todosRealizados, filtro);

  const r = resumoGeral(realizadosFiltrados);
  const saldo = saldoGols(realizadosFiltrados);
  const pctAssistencia = r.qtdGols > 0 ? Math.round((r.qtdAssistencias / r.qtdGols) * 100) : 0;
  const jogadores = state.atletas.filter(ehJogador);
  const ultimos5 = [...realizadosFiltrados].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 5);

  // Destaques do período (seguem o filtro de ano/mês).
  const statsPeriodo = statsPorAtleta(jogadores, realizadosFiltrados);
  const porNome = (a, b) => (a.atleta.nome || "").localeCompare(b.atleta.nome || "", "pt-BR");
  const jogosAvaliados = realizadosFiltrados.filter(j => Object.keys(j.avaliacoesJogadores || {}).some(id => notasDoAtletaNoJogo(j, id).length > 0)).length;
  const minNota = Math.min(5, Math.max(1, Math.ceil(jogosAvaliados * 0.4)));
  const comNota = (id) => realizadosFiltrados.filter(j => notasDoAtletaNoJogo(j, id).length > 0).length;
  const lider = (lista, metric, desempate) => lista.sort((a, b) => metric(b) - metric(a) || desempate(a, b) || porNome(a, b)).slice(0, 3);
  const destaques = [
    { label: "Artilheiro", unid: "gols", lista: lider(statsPeriodo.filter(s => s.gols > 0), s => s.gols, (a, b) => b.assistencias - a.assistencias), val: s => s.gols, fmt: s => String(s.gols) },
    { label: "Garçom", unid: "assistências", lista: lider(statsPeriodo.filter(s => s.assistencias > 0), s => s.assistencias, (a, b) => b.gols - a.gols), val: s => s.assistencias, fmt: s => String(s.assistencias) },
    { label: "Melhor nota", unid: "nota média", lista: lider(statsPeriodo.filter(s => s.media !== null && comNota(s.atleta.id) >= minNota), s => s.media, (a, b) => b.jogosCount - a.jogosCount), val: s => s.media, fmt: s => fmt1(s.media) },
  ];

  // Forma recente: últimos 10 realizados (sem filtro), do mais antigo ao mais novo.
  const recentesDesc = [...todosRealizados].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 10);
  const sequencia = textoSequencia(recentesDesc);

  // Destaque do mês: último mês com notas lançadas.
  const meses = [...new Set(todosRealizados.map(j => (j.data || "").slice(0, 7)).filter(m => m.length === 7))].sort().reverse();
  let destaqueMes = null, mesDestaque = null;
  for (const m of meses){
    const rk = statsPorAtleta(jogadores, todosRealizados.filter(j => (j.data || "").startsWith(m)))
      .filter(s => s.media !== null && s.jogosCount > 0)
      .sort((a, b) => b.media - a.media || (b.gols + b.assistencias) - (a.gols + a.assistencias) || b.jogosCount - a.jogosCount);
    if (rk.length){ destaqueMes = rk[0]; mesDestaque = m; break; }
  }
  // Próximos jogos não seguem o filtro de ano/mês — são sempre os agendamentos
  // futuros mais próximos, independente do período usado pra olhar o histórico.
  const proximosJogos = state.jogos
    .filter(j => j.status !== "realizado")
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
    .slice(0, 5);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const proximo = proximosJogos.find(j => (j.data || "") >= hojeISO) || proximosJogos[0] || null;

  const nomeAdv = id => escapeHtml(state.adversarios.find(a => a.id === id)?.nome || "?");
  const nomeCampo = id => escapeHtml(state.campos.find(c => c.id === id)?.nome || "?");
  const advTexto = id => state.adversarios.find(a => a.id === id)?.nome || "?";
  const appUrl = location.origin + location.pathname;

  const theme = getTheme();
  const themeTitle = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";
  const themeIcon = theme === "dark"
    // sol — indica que, ao clicar, volta pro tema claro
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`
    // lua — indica que, ao clicar, ativa o tema escuro
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Visão geral</div>
        <h1>Dashboard</h1>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn-icon-share" id="btn-theme-toggle" type="button" title="${themeTitle}" aria-label="${themeTitle}">
          ${themeIcon}
        </button>
        <div class="share-popover-wrap">
          <button class="btn-icon-share" id="btn-share" type="button" title="Compartilhar app" aria-label="Compartilhar app">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-3.8M8.6 13.4l6.8 3.8"/></svg>
          </button>
          <div class="share-popover" id="share-popover">
            <div class="card-title" style="font-size:13.5px;">Acesso rápido ao app</div>
            <div class="card-sub" style="margin-bottom:10px;">Compartilhe o link ou escaneie o QR code.</div>
            <div class="share-link-row">
              <input id="app-link" class="share-link-input" type="text" readonly value="${escapeHtml(appUrl)}">
              <button class="btn btn-primary btn-sm" id="btn-copy-link" type="button">Copiar</button>
            </div>
            <div class="qr-box" id="qr-code" style="margin-top:12px;"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="form-grid" style="margin-bottom:20px; max-width:460px;">
      <div class="field">
        <label>Ano</label>
        <select id="filtro-ano">
          <option value="">Todos</option>
          ${anos.map(a => `<option value="${a}" ${a === filtro.ano ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Mês</label>
        <select id="filtro-mes">
          <option value="">Todos</option>
          ${MESES.map((m, idx) => {
            const val = String(idx + 1).padStart(2, "0");
            return `<option value="${val}" ${val === filtro.mes ? "selected" : ""}>${m}</option>`;
          }).join("")}
        </select>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-tile"><div class="kpi-label">Jogos realizados</div><div class="kpi-value">${r.qtdJogos}</div></div>
      <div class="kpi-tile"><div class="kpi-label">Gols</div><div class="kpi-value">${r.qtdGols}</div></div>
      <div class="kpi-tile"><div class="kpi-label">Saldo de gols</div><div class="kpi-value">${saldo.saldo > 0 ? "+" : ""}${saldo.saldo}</div></div>
      <div class="kpi-tile"><div class="kpi-label">% de assistência</div><div class="kpi-value">${pctAssistencia}<span class="unit">%</span></div></div>
      <div class="kpi-tile"><div class="kpi-label">Aproveitamento</div><div class="kpi-value small">${r.vitorias}V <span class="unit">${r.empates}E</span> <span class="unit">${r.derrotas}D</span></div></div>
      <div class="kpi-tile"><div class="kpi-label">Nota média jogadores</div><div class="kpi-value">${fmt1(r.mediaJogadores)}</div></div>
    </div>

    ${proximo ? `
    <div class="dash-top">
      <div class="dash-hero" data-goto="${proximo.id}" style="cursor:pointer;">
        <div class="dash-hero-eyebrow">Próximo jogo · ${textoDias(diasAte(proximo.data))}</div>
        <div class="dash-hero-title">vs ${nomeAdv(proximo.adversarioId)}</div>
        <div class="dash-hero-sub">${formatDate(proximo.data)}${proximo.horario ? ` · ${escapeHtml(proximo.horario)}` : ""} · ${nomeCampo(proximo.campoId)}</div>
        <div class="dash-hero-pres" id="hero-pres"></div>
      </div>
      ${destaqueMes ? destaqueMesHtml(destaqueMes, mesDestaque) : ""}
    </div>` : (destaqueMes ? `<div class="dash-top">${destaqueMesHtml(destaqueMes, mesDestaque)}</div>` : "")}

    <div class="card card-pad dash-forma">
      <div>
        <div class="card-sub" style="margin-bottom:6px;">Forma recente (últimos ${recentesDesc.length} jogos)</div>
        <div class="dash-dots">${[...recentesDesc].reverse().map(j => { const r = resultadoJogo(j); return `<span data-goto="${j.id}" style="cursor:pointer;" title="${escapeHtml(tituloPlacar(j, advTexto(j.adversarioId)))}">${r ? RESULTADO_BADGE[r] : "—"}</span>`; }).join("")}</div>
      </div>
      ${sequencia ? `<div class="dash-seq"><div class="dash-seq-val">${sequencia}</div><div class="card-sub" style="margin:0;">sequência atual</div></div>` : ""}
    </div>

    <div class="dash-section-title">Destaques do período</div>
    <div class="dash-stats">
      ${destaques.map(d => {
        const [p1, p2, p3] = d.lista;
        if (!p1) return `<div class="card card-pad dash-stat"><div class="card-sub" style="margin-bottom:4px;">${d.label}</div><p style="color:var(--ink-faint); font-size:13px; margin:0;">Sem dados ainda.</p></div>`;
        const outros = [p2, p3].filter(Boolean).map((s, i) => `${i + 2}º ${escapeHtml(s.atleta.nome)} ${d.fmt(s)}`).join(" · ");
        return `<div class="card card-pad dash-stat">
          <div class="card-sub" style="margin-bottom:2px;">${d.label}</div>
          <div class="dash-stat-val">${d.fmt(p1)}</div>
          <div class="podium-name">${escapeHtml(p1.atleta.nome)}</div>
          <div class="dash-bar"><span style="width:${p2 ? Math.max(8, Math.round(d.val(p2) / d.val(p1) * 100)) : 100}%"></span></div>
          <div class="podium-sub">${outros || d.unid}</div>
        </div>`;
      }).join("")}
    </div>
    <div style="margin:-6px 0 20px;"><a href="#ranking" class="btn btn-ghost btn-sm">Ver ranking completo →</a> <a href="#premiacoes" class="btn btn-ghost btn-sm">Premiações →</a></div>

    <div class="dash-bottom">
      <div class="card card-pad">
        <div class="card-title">Últimos 5 confrontos</div>
        <div class="card-sub">Resultados mais recentes</div>
        ${ultimos5.length === 0 ? `<p style="color:var(--ink-faint); font-size:13px;">Nenhuma partida realizada ainda.</p>` : ultimos5.map(j => {
          const res = resultadoJogo(j);
          return `
          <div class="event-row" style="cursor:pointer;" data-goto="${j.id}">
            <span style="width:22px; flex-shrink:0;" title="${escapeHtml(tituloPlacar(j, advTexto(j.adversarioId)))}">${res ? RESULTADO_BADGE[res] : "—"}</span>
            <span style="flex:1;">vs ${nomeAdv(j.adversarioId)} <span style="color:var(--ink-faint); font-size:11px;">${formatDate(j.data)}</span></span>
            <span class="pill-num">${j.placarNos ?? "–"}x${j.placarAdversario ?? "–"}</span>
          </div>`;
        }).join("")}
        <div class="form-actions" style="justify-content:flex-start; border:none; padding-top:12px;">
          <a href="#historico" class="btn btn-ghost btn-sm">Ver histórico completo →</a>
        </div>
      </div>

      <div class="card card-pad">
        <div class="card-title">Próximos jogos</div>
        <div class="card-sub">Partidas agendadas</div>
        ${proximosJogos.length === 0 ? `<p style="color:var(--ink-faint); font-size:13px;">Nenhuma partida agendada no momento.</p>` : proximosJogos.map(j => `
          <div class="event-row" style="cursor:pointer;" data-goto="${j.id}">
            <span style="width:78px; flex-shrink:0; font-size:11px; color:var(--ink-faint);">${formatDate(j.data)}</span>
            <span style="flex:1;">vs ${nomeAdv(j.adversarioId)} <span style="color:var(--ink-faint); font-size:11px;">— ${nomeCampo(j.campoId)}</span></span>
          </div>`).join("")}
        <div class="form-actions" style="justify-content:flex-start; border:none; padding-top:12px;">
          <a href="#jogos" class="btn btn-ghost btn-sm">Ver todos os jogos →</a>
        </div>
      </div>
    </div>
  `;

  pararPresenca();
  if (proximo){
    const ativos = jogadores.filter(a => a.ativo !== false);
    unsubPresenca = listenPresencas(proximo.id, (items) => {
      const el = document.getElementById("hero-pres");
      if (!el){ pararPresenca(); return; }
      const resp = new Map(items.map(p => [p.atletaId, p.resposta]));
      let vou = 0, talvez = 0, nao = 0;
      ativos.forEach(a => { const r = resp.get(a.id); if (r === "vou") vou++; else if (r === "talvez") talvez++; else if (r === "nao") nao++; });
      const sem = ativos.length - vou - talvez - nao;
      el.innerHTML = `<span class="dash-chip ok">${vou} vão</span><span class="dash-chip">${talvez} talvez</span><span class="dash-chip">${nao} não vão</span><span class="dash-chip mute">${sem} sem resposta</span>`;
    });
  }

  $$("[data-goto]", root).forEach(el => el.addEventListener("click", () => {
    const j = state.jogos.find(x => x.id === el.dataset.goto);
    // Jogo realizado abre a súmula (pública); agendado abre a página do jogo.
    location.hash = j && j.status === "realizado" ? `#historico/${j.id}` : `#jogos/${el.dataset.goto}`;
  }));

  $("#filtro-ano", root)?.addEventListener("change", (e) => { setFiltroPeriodo({ ano: e.target.value }); reRenderKeepingFocus(root, () => renderDashboard(root, state)); });
  $("#filtro-mes", root)?.addEventListener("change", (e) => { setFiltroPeriodo({ mes: e.target.value }); reRenderKeepingFocus(root, () => renderDashboard(root, state)); });

  $("#btn-theme-toggle", root)?.addEventListener("click", () => {
    toggleTheme();
    reRenderKeepingFocus(root, () => renderDashboard(root, state));
  });

  $("#btn-share", root)?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("#share-popover", root)?.classList.toggle("open");
  });
  if (outsideClickHandler) document.removeEventListener("click", outsideClickHandler);
  outsideClickHandler = (e) => {
    const wrap = $(".share-popover-wrap", root);
    if (wrap && !wrap.contains(e.target)) $("#share-popover", root)?.classList.remove("open");
  };
  document.addEventListener("click", outsideClickHandler);

  $("#btn-copy-link", root)?.addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(appUrl);
      toast("Link copiado!", "ok");
    }catch(err){
      const input = $("#app-link", root);
      input?.select?.();
      toast("Não foi possível copiar automaticamente. Selecione e copie manualmente.", "err");
    }
  });

  renderQr("qr-code", appUrl);
}
