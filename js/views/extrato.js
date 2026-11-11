import { $, escapeHtml, formatDate, fmt1, avg } from "../utils.js";
import {
  ehJogador, jogosRealizados, normalizeEscalacao, posicaoJogadaNoJogo, statsPorAtleta,
  notasDoAtletaNoJogo, resultadoJogo, GOL_CONTRA_ID,
} from "../stats.js";

// Extrato do jogador — tela pública (mesmo nível do Ranking). A nota média
// de cada jogo é aberta a todos; o detalhe de "quem deu qual nota" só
// aparece pra quem está logado com conta autorizada.
export function renderExtrato(root, state, atletaId){
  const jogadores = state.atletas.filter(ehJogador)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const atleta = jogadores.find(a => a.id === atletaId) || null;

  const opcoes = jogadores.map(a =>
    `<option value="${a.id}" ${atleta && a.id === atleta.id ? "selected" : ""}>${escapeHtml(a.nome)}${a.ativo === false ? " (inativo)" : ""}</option>`
  ).join("");

  let corpo = `<div class="empty-state"><h3>Escolha um jogador</h3><p>Selecione um atleta acima para ver o extrato dele.</p></div>`;
  if (atleta) corpo = extratoHtml(atleta, state);

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h1>Extrato do jogador</h1>
      </div>
    </div>
    <div class="field" style="max-width:320px; margin-bottom:20px;">
      <label>Jogador</label>
      <select id="extrato-atleta">
        <option value="">Selecione…</option>
        ${opcoes}
      </select>
    </div>
    ${corpo}
  `;

  $("#extrato-atleta", root).addEventListener("change", (e) => {
    location.hash = e.target.value ? `#extrato/${e.target.value}` : "#extrato";
  });
}

function extratoHtml(atleta, state){
  const realizados = jogosRealizados(state.jogos);
  const nomeAtleta = (id) => state.atletas.find(a => a.id === id)?.nome || "?";
  const nomeAdv = (id) => state.adversarios.find(a => a.id === id)?.nome || "?";

  // Jogos em que o atleta esteve escalado ou teve algum gol/assistência —
  // os totais batem com os do Ranking (que conta gols mesmo sem escalação).
  const jogos = realizados.filter(j => {
    const escalado = [...normalizeEscalacao(j.escalacaoInicial), ...normalizeEscalacao(j.escalacaoFinal)].some(e => e.atletaId === atleta.id);
    const evento = (j.golsAssistencias || []).some(e => e.atletaGolId === atleta.id || e.atletaAssistId === atleta.id);
    return escalado || evento;
  }).sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  const s = statsPorAtleta([atleta], realizados)[0];
  let v = 0, e = 0, d = 0;
  jogos.forEach(j => {
    const r = resultadoJogo(j);
    if (r === "vitoria") v++; else if (r === "empate") e++; else if (r === "derrota") d++;
  });

  const kpis = [
    ["Jogos", s.jogosCount],
    ["Gols", s.gols],
    ["Assistências", s.assistencias],
    ["G+A", s.gols + s.assistencias],
    ["Nota média", s.media === null ? "—" : fmt1(s.media)],
  ];
  const kpiHtml = kpis.map(([l, val]) => `
    <div class="kpi-tile"><div class="kpi-label">${l}</div><div class="kpi-value">${val}</div></div>`).join("");

  const cards = jogos.map(j => {
    const res = resultadoJogo(j);
    const badge = res === "vitoria" ? `<span class="badge badge-ok">Vitória</span>`
      : res === "derrota" ? `<span class="badge badge-danger">Derrota</span>`
      : res === "empate" ? `<span class="badge badge-off">Empate</span>` : "";
    const placar = res ? `${j.placarNos} x ${j.placarAdversario}` : "—";
    const pos = posicaoJogadaNoJogo(j, atleta.id) || atleta.posicao || "—";

    const notas = notasDoAtletaNoJogo(j, atleta.id);
    const nota = avg(notas);
    let detalheNotas = "";
    if (state.isAuthorized && j.avaliacoesJogadores?.[atleta.id] && typeof j.avaliacoesJogadores[atleta.id].nota !== "number"){
      const porVotante = Object.entries(j.avaliacoesJogadores[atleta.id])
        .filter(([, x]) => typeof x?.nota === "number")
        .map(([vid, x]) => `${escapeHtml(nomeAtleta(vid))} ${fmt1(x.nota)}`);
      if (porVotante.length) detalheNotas = `<div style="font-size:11px; color:var(--ink-faint); margin-top:4px;">${porVotante.join(" · ")}</div>`;
    }

    const linhas = [];
    (j.golsAssistencias || []).forEach(ev => {
      if (ev.atletaGolId === atleta.id){
        const meta = [ev.tipoGol, ev.tempo].filter(Boolean).map(escapeHtml).join(" · ");
        const ass = ev.atletaAssistId && ev.atletaAssistId !== GOL_CONTRA_ID ? ` — assistência de ${escapeHtml(nomeAtleta(ev.atletaAssistId))}` : "";
        linhas.push(`⚽ Gol${meta ? ` (${meta})` : ""}${ass}`);
      }
      if (ev.atletaAssistId === atleta.id){
        const meta = [ev.tipoGol, ev.tempo].filter(Boolean).map(escapeHtml).join(" · ");
        linhas.push(`🅰️ Assistência${meta ? ` (${meta})` : ""} — gol de ${escapeHtml(nomeAtleta(ev.atletaGolId))}`);
      }
    });

    return `
      <div class="card card-pad" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="card-title" style="margin-bottom:2px;">${formatDate(j.data)} · vs ${escapeHtml(nomeAdv(j.adversarioId))}</div>
            <div class="card-sub" style="margin-bottom:0;">${placar} ${badge} · ${escapeHtml(pos)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-soft);">Nota</div>
            <div class="pill-num" style="font-size:20px;">${nota === null ? "—" : fmt1(nota)}</div>
          </div>
        </div>
        ${detalheNotas}
        ${linhas.length ? `<div style="margin-top:10px; font-size:13px; display:flex; flex-direction:column; gap:4px;">${linhas.map(l => `<div>${l}</div>`).join("")}</div>` : ""}
      </div>`;
  }).join("");

  return `
    <div style="margin-bottom:6px; font-size:13px; color:var(--ink-soft);">
      ${escapeHtml(atleta.posicao || "")}${atleta.numero !== null && atleta.numero !== undefined ? ` · camisa ${atleta.numero}` : ""}
      · ${v}V ${e}E ${d}D nos jogos em que participou
    </div>
    <div class="kpi-grid">${kpiHtml}</div>
    <h2 style="font-size:18px; margin:6px 0 12px;">Partidas</h2>
    ${cards || `<p style="color:var(--ink-faint); font-style:italic;">Nenhuma partida realizada com esse jogador.</p>`}
  `;
}
