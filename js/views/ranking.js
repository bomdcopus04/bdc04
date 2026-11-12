import { $, $$, escapeHtml, formatDate, fmt1, reRenderKeepingFocus } from "../utils.js";
import { statsPorAtleta, ehJogador } from "../stats.js";
import { openImagemModal } from "./flyer.js";

let activeMetric = "ga"; // jogos | gols | assistencias | ga | nota
let filtroAno = "";
let filtroMes = "";
let filtroPartida = "";
// Filtro "quem votou" (nota média) — ids dos votantes selecionados. Vazio
// conta o voto de todo mundo (comportamento padrão, igual antes desse
// filtro existir). Só aparece pra quem está logado com conta autorizada.
let votantesFiltro = [];

const METRICAS = [
  { key: "jogos", label: "Jogos" },
  { key: "gols", label: "Gols" },
  { key: "assistencias", label: "Assistências" },
  { key: "ga", label: "G+A" },
  { key: "nota", label: "Nota média" },
];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function ordenarPorMetrica(lista, metrica){
  const cmp = {
    jogos: (a, b) => b.jogosCount - a.jogosCount,
    gols: (a, b) => b.gols - a.gols,
    assistencias: (a, b) => b.assistencias - a.assistencias,
    ga: (a, b) => (b.gols + b.assistencias) - (a.gols + a.assistencias),
    nota: (a, b) => (b.media ?? -1) - (a.media ?? -1),
  }[metrica];
  return [...lista].sort(cmp || (() => 0));
}

function filtrarPorMetrica(lista, metrica){
  switch (metrica){
    case "jogos": return lista.filter(s => s.jogosCount > 0);
    case "gols": return lista.filter(s => s.gols > 0);
    case "assistencias": return lista.filter(s => s.assistencias > 0);
    case "ga": return lista.filter(s => (s.gols + s.assistencias) > 0);
    case "nota": return lista.filter(s => s.media !== null);
    default: return lista;
  }
}

// Valor principal e legenda de cada métrica (usados no pódio e na imagem).
const VALOR = {
  jogos: { val: s => String(s.jogosCount), unid: "jogos" },
  gols: { val: s => String(s.gols), unid: "gols" },
  assistencias: { val: s => String(s.assistencias), unid: "assistências" },
  ga: { val: s => String(s.gols + s.assistencias), unid: "gols + assist." },
  nota: { val: s => fmt1(s.media), unid: "nota média" },
};

function detalhe(s){
  return `${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"} · ${s.gols} gol${s.gols === 1 ? "" : "s"} · ${s.assistencias} assist.`;
}

function abrirImagemRanking(top5, metricLabel, periodoLabel, votantesLabel, metrica){
  const medalhas = ["1º", "2º", "3º", "4º", "5º"];
  const v = VALOR[metrica];
  const legenda = [`🏆 Ranking — ${metricLabel} (${periodoLabel})`, "",
    ...top5.map((s, i) => `${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]} ${s.atleta.nome} — ${v.val(s)} ${v.unid}`),
    "", "#bdc04\n#futeboldevarzea\n#somosbdc"].join("\n");
  openImagemModal({
    titulo: "Imagem do ranking",
    arquivo: `ranking-${metrica}`,
    legenda,
    render: (e) => {
      const pad = e.H > 1500 ? 30 : 16;
      const linhas = top5.map((s, i) => `
        <div style="display:flex; align-items:center; gap:22px; width:100%; padding:${pad}px ${i === 0 ? 18 : 0}px; border-bottom:2px solid ${e.A}44; ${i === 0 ? `background:${e.A}22; border-radius:20px;` : ""}">
          <div style="font-family:'Bebas Neue',sans-serif; font-size:${i === 0 ? 84 : 66}px; color:${e.A}; width:100px; text-align:center; line-height:1;">${medalhas[i]}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-family:'Bebas Neue',sans-serif; font-size:${i === 0 ? 78 : 62}px; line-height:1.05; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.atleta.nome.toUpperCase())}</div>
            <div style="font-size:26px; color:${e.T.muted2};">${escapeHtml(detalhe(s))}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Bebas Neue',sans-serif; font-size:${i === 0 ? 100 : 78}px; line-height:1; color:${e.A};">${escapeHtml(v.val(s))}</div>
            <div style="font-size:22px; color:${e.T.muted2};">${escapeHtml(v.unid)}</div>
          </div>
        </div>`).join("");
      return `<div style="${e.base}">${e.cantos}${e.topo}
        <div style="text-align:center;">
          <div style="font-family:'Bebas Neue',sans-serif; font-size:92px; letter-spacing:.14em; color:${e.A}; line-height:1;">RANKING</div>
          <div style="font-size:40px; margin-top:6px;">${escapeHtml(metricLabel.toUpperCase())} · TOP 5</div>
          <div style="font-size:28px; color:${e.T.muted2}; margin-top:6px;">${escapeHtml(periodoLabel)}${votantesLabel ? ` · Nota de: ${escapeHtml(votantesLabel)}` : ""}</div>
        </div>
        <div style="width:100%;">${linhas}</div>
        ${e.rodape}
      </div>`;
    },
  });
}

export function renderRanking(root, state){
  const realizados = [...state.jogos]
    .filter(j => j.status === "realizado")
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  const anosDisponiveis = [...new Set(realizados.map(j => (j.data || "").slice(0, 4)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  const nomeAdv = id => state.adversarios.find(a => a.id === id)?.nome || "?";

  // Filtro "quem votou" (nota média) — só disponível pra quem está logado
  // com conta Google autorizada. Descarta seleções de votantes que não
  // existem mais (ex: perdeu o direito a voto).
  const votantes = state.isAuthorized ? state.atletas.filter(a => a.podeVotar) : [];
  votantesFiltro = votantesFiltro.filter(id => votantes.some(v => v.id === id));
  const votanteIds = votantesFiltro.length > 0 ? votantesFiltro : null;

  let jogosFiltrados;
  if (filtroPartida){
    jogosFiltrados = realizados.filter(j => j.id === filtroPartida);
  } else {
    jogosFiltrados = realizados.filter(j => {
      const ano = (j.data || "").slice(0, 4);
      const mes = (j.data || "").slice(5, 7);
      if (filtroAno && ano !== filtroAno) return false;
      if (filtroMes && mes !== filtroMes) return false;
      return true;
    });
  }

  const stats = statsPorAtleta(state.atletas.filter(ehJogador), jogosFiltrados, votanteIds);
  const listaFinal = ordenarPorMetrica(filtrarPorMetrica(stats, activeMetric), activeMetric);

  const top3 = listaFinal.slice(0, 3);
  const resto = listaFinal.slice(3);
  const v = VALOR[activeMetric];
  // Coluna da métrica selecionada fica levemente destacada (cabeçalho + células).
  const hl = (k) => activeMetric === k ? ` class="col-ativa"` : "";
  const hlNum = (k) => activeMetric === k ? "pill-num col-ativa" : "pill-num";
  const theadRowHtml = `<tr><th>#</th><th>Atleta</th><th>Posição</th><th${hl("jogos")}>Jogos</th><th${hl("gols")}>Gols</th><th${hl("assistencias")}>Assist.</th><th${hl("ga")}>G+A</th><th${hl("nota")}>Nota média</th></tr>`;
  const rows = resto.map((s, i) => `
    <tr>
      <td class="pill-num">${i + 4}º</td>
      <td><strong class="atleta-link" data-atleta="${s.atleta.id}" title="Ver extrato">${escapeHtml(s.atleta.nome)}</strong></td>
      <td>${escapeHtml(s.atleta.posicao || "—")}</td>
      <td class="${hlNum("jogos")}">${s.jogosCount}</td>
      <td class="${hlNum("gols")}">${s.gols}</td>
      <td class="${hlNum("assistencias")}">${s.assistencias}</td>
      <td class="${hlNum("ga")}">${s.gols + s.assistencias}</td>
      <td${hl("nota")}>${fmt1(s.media)}</td>
    </tr>`).join("");

  const pod = (s, i) => `
    <div class="rank-pod p${i + 1}" data-atleta="${s.atleta.id}" title="Ver extrato">
      <div class="rank-pod-pos">${i + 1}º</div>
      <div class="rank-pod-name">${escapeHtml(s.atleta.nome)}</div>
      <div class="rank-pod-val">${escapeHtml(v.val(s))}</div>
      <div class="rank-pod-unit">${escapeHtml(v.unid)}</div>
      <div class="rank-pod-sub">${escapeHtml(s.atleta.posicao || "")}</div>
    </div>`;

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Visão geral</div>
        <h1>Ranking</h1>
      </div>
      <button class="btn-icon-share" id="btn-print-ranking" type="button" title="Compartilhar imagem do ranking" aria-label="Compartilhar imagem do ranking" ${listaFinal.length === 0 ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
    </div>

    <div class="rank-chips">
      ${METRICAS.map(m => `<button class="rank-chip ${m.key === activeMetric ? "active" : ""}" data-metric="${m.key}" type="button">${escapeHtml(m.label)}</button>`).join("")}
    </div>

    <div class="rank-filtros">
      <div class="field">
        <label>Ano</label>
        <select id="filtro-ano" ${filtroPartida ? "disabled" : ""}>
          <option value="">Todos</option>
          ${anosDisponiveis.map(a => `<option value="${a}" ${a === filtroAno ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Mês</label>
        <select id="filtro-mes" ${filtroPartida ? "disabled" : ""}>
          <option value="">Todos</option>
          ${MESES.map((m, idx) => {
            const val = String(idx + 1).padStart(2, "0");
            return `<option value="${val}" ${val === filtroMes ? "selected" : ""}>${m}</option>`;
          }).join("")}
        </select>
      </div>
      <div class="field span-2">
        <label>Partida específica</label>
        <select id="filtro-partida">
          <option value="">Todas as partidas</option>
          ${realizados.map(j => `<option value="${j.id}" ${j.id === filtroPartida ? "selected" : ""}>${formatDate(j.data)} — vs ${escapeHtml(nomeAdv(j.adversarioId))}</option>`).join("")}
        </select>
      </div>
    </div>

    ${votantes.length > 0 ? `
      <div style="margin-bottom:20px;">
        <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft); margin-bottom:8px;">
          Quem votou (nota média) <span style="font-weight:400; text-transform:none; letter-spacing:0; color:var(--ink-faint);">— ninguém selecionado conta o voto de todo mundo</span>
        </label>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${votantes.map(v => `<button class="votante-btn ${votantesFiltro.includes(v.id) ? "active" : ""}" data-votante="${v.id}" type="button">${escapeHtml(v.nome)}</button>`).join("")}
        </div>
      </div>
    ` : ""}

    ${top3.length === 0 ? `<div class="empty-state"><h3>Sem dados</h3><p>Nenhum dado para os filtros selecionados.</p></div>` : `
    <div class="rank-podium">${[1, 0, 2].filter(i => top3[i]).map(i => pod(top3[i], i)).join("")}</div>
    ${resto.length ? `
    <div class="table-wrap">
      <table>
        <thead>${theadRowHtml}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : ""}`}
  `;

  $$(".rank-chip", root).forEach(btn => {
    btn.addEventListener("click", () => {
      activeMetric = btn.dataset.metric;
      reRenderKeepingFocus(root, () => renderRanking(root, state));
    });
  });

  $("#filtro-ano", root)?.addEventListener("change", (e) => { filtroAno = e.target.value; reRenderKeepingFocus(root, () => renderRanking(root, state)); });
  $("#filtro-mes", root)?.addEventListener("change", (e) => { filtroMes = e.target.value; reRenderKeepingFocus(root, () => renderRanking(root, state)); });
  $("#filtro-partida", root)?.addEventListener("change", (e) => { filtroPartida = e.target.value; reRenderKeepingFocus(root, () => renderRanking(root, state)); });

  $$(".rank-pod", root).forEach(el => el.addEventListener("click", () => { location.hash = `#extrato/${el.dataset.atleta}`; }));
  $$(".atleta-link", root).forEach(el => {
    el.addEventListener("click", () => { location.hash = `#extrato/${el.dataset.atleta}`; });
  });

  $$(".votante-btn", root).forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.votante;
      votantesFiltro = votantesFiltro.includes(id) ? votantesFiltro.filter(x => x !== id) : [...votantesFiltro, id];
      reRenderKeepingFocus(root, () => renderRanking(root, state));
    });
  });

  $("#btn-print-ranking", root)?.addEventListener("click", () => {
    const periodoLabel = filtroPartida
      ? (() => {
          const j = realizados.find(x => x.id === filtroPartida);
          return j ? `${formatDate(j.data)} vs ${nomeAdv(j.adversarioId)}` : "Partida específica";
        })()
      : [filtroMes ? MESES[Number(filtroMes) - 1] : null, filtroAno].filter(Boolean).join("/") || "Todos os períodos";
    const metricLabel = METRICAS.find(m => m.key === activeMetric)?.label || "Ranking";
    const votantesLabel = votanteIds ? votantes.filter(x => votanteIds.includes(x.id)).map(x => x.nome).join(", ") : "";
    abrirImagemRanking(listaFinal.slice(0, 5), metricLabel, periodoLabel, votantesLabel, activeMetric);
  });
}
