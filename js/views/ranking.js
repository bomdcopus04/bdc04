import { $, $$, escapeHtml, formatDate, fmt1, toast, reRenderKeepingFocus } from "../utils.js";
import { statsPorAtleta, ehJogador } from "../stats.js";

let activeMetric = "ga"; // jogos | gols | assistencias | ga | nota
let filtroAno = "";
let filtroMes = "";
let filtroPartida = "";
// Filtro "quem votou" (nota média) — ids dos votantes selecionados. Vazio
// conta o voto de todo mundo (comportamento padrão, igual antes desse
// filtro existir). Só aparece pra quem está logado com conta autorizada.
let votantesFiltro = [];

const METRICAS = [
  { key: "jogos", label: "Qtde. de jogos" },
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

// Gera uma imagem (PNG) da tabela de ranking atual (já filtrada/ordenada) e
// compartilha (Web Share API) ou baixa o arquivo — pra mandar rapidinho no
// grupo do WhatsApp. Mesmo padrão usado no botão de compartilhar da Escalação ideal.
async function compartilharImagemRanking(theadHtml, tbodyHtml, metricLabel, periodoLabel, votantesLabel){
  if (typeof html2canvas !== "function"){
    toast("Não foi possível gerar a imagem (recurso indisponível).", "err");
    return;
  }
  const card = document.createElement("div");
  card.style.cssText = "position:fixed; left:-9999px; top:0; width:640px; background:#fff; padding:22px; font-family:'Inter',system-ui,sans-serif;";
  card.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <img src="assets/logo-bomdcopus.png" crossorigin="anonymous" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
      <div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:.03em; color:#141414; line-height:1;">BOM D' COPUS</div>
        <div style="font-size:11px; color:#5B6470; margin-top:2px;">Ranking — ${escapeHtml(metricLabel)} · ${escapeHtml(periodoLabel)}${votantesLabel ? ` · Nota de: ${escapeHtml(votantesLabel)}` : ""}</div>
      </div>
    </div>
    <table style="width:100%; border-collapse:collapse;">
      <thead>${theadHtml}</thead>
      <tbody>${tbodyHtml}</tbody>
    </table>
  `;
  document.body.appendChild(card);

  try{
    const canvas = await html2canvas(card, { backgroundColor: "#ffffff", scale: 2, windowWidth: 1000, useCORS: true });
    card.remove();

    canvas.toBlob(async (blob) => {
      if (!blob){
        toast("Não foi possível gerar a imagem.", "err");
        return;
      }
      const file = new File([blob], `ranking-${metricLabel}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        try{
          await navigator.share({ files: [file], title: "Ranking", text: `Ranking — Bom D' Copus (${metricLabel})` });
          return;
        }catch(err){
          if (err?.name === "AbortError") return; // usuário cancelou o compartilhamento
          console.error(err);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ranking-${metricLabel}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Imagem salva!", "ok");
    }, "image/png");
  }catch(err){
    card.remove();
    console.error(err);
    toast("Erro ao gerar a imagem: " + err.message, "err");
  }
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

  const theadRowHtml = `<tr><th>#</th><th>Atleta</th><th>Posição</th><th>Jogos</th><th>Gols</th><th>Assist.</th><th>G+A</th><th>Nota média</th></tr>`;
  const rows = listaFinal.map((s, i) => `
    <tr>
      <td class="pill-num">${i + 1}º</td>
      <td><strong class="atleta-link" data-atleta="${s.atleta.id}" title="Ver extrato">${escapeHtml(s.atleta.nome)}</strong></td>
      <td>${escapeHtml(s.atleta.posicao || "—")}</td>
      <td class="pill-num">${s.jogosCount}</td>
      <td class="pill-num">${s.gols}</td>
      <td class="pill-num">${s.assistencias}</td>
      <td class="pill-num">${s.gols + s.assistencias}</td>
      <td>${fmt1(s.media)}</td>
    </tr>`).join("");

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

    <div class="tabbar">
      ${METRICAS.map(m => `<button class="tab-btn" data-metric="${m.key}">${escapeHtml(m.label)}</button>`).join("")}
    </div>

    <div class="form-grid" style="margin-bottom:20px; max-width:680px;">
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

    <div class="table-wrap">
      <table>
        <thead>${theadRowHtml}</thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="8">Nenhum dado para os filtros selecionados.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  $$(".tab-btn", root).forEach(btn => {
    btn.classList.toggle("active", btn.dataset.metric === activeMetric);
    btn.addEventListener("click", () => {
      activeMetric = btn.dataset.metric;
      reRenderKeepingFocus(root, () => renderRanking(root, state));
    });
  });

  $("#filtro-ano", root)?.addEventListener("change", (e) => { filtroAno = e.target.value; reRenderKeepingFocus(root, () => renderRanking(root, state)); });
  $("#filtro-mes", root)?.addEventListener("change", (e) => { filtroMes = e.target.value; reRenderKeepingFocus(root, () => renderRanking(root, state)); });
  $("#filtro-partida", root)?.addEventListener("change", (e) => { filtroPartida = e.target.value; reRenderKeepingFocus(root, () => renderRanking(root, state)); });

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

  $("#btn-print-ranking", root)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    toast("Gerando imagem…", "ok");
    try{
      const periodoLabel = filtroPartida
        ? (() => {
            const j = realizados.find(x => x.id === filtroPartida);
            return j ? `${formatDate(j.data)} vs ${nomeAdv(j.adversarioId)}` : "Partida específica";
          })()
        : [filtroMes ? MESES[Number(filtroMes) - 1] : null, filtroAno].filter(Boolean).join("/") || "Todos os períodos";
      const metricLabel = METRICAS.find(m => m.key === activeMetric)?.label || "Ranking";
      const votantesLabel = votanteIds ? votantes.filter(v => votanteIds.includes(v.id)).map(v => v.nome).join(", ") : "";
      await compartilharImagemRanking(theadRowHtml, rows || `<tr><td colspan="8" style="text-align:center; color:#999; padding:20px;">Nenhum dado para os filtros selecionados.</td></tr>`, metricLabel, periodoLabel, votantesLabel);
    } finally {
      btn.disabled = false;
    }
  });
}
