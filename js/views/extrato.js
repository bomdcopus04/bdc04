import { $, escapeHtml, formatDate, fmt1, avg } from "../utils.js";
import {
  ehJogador, jogosRealizados, normalizeEscalacao, posicaoJogadaNoJogo, statsPorAtleta,
  notasDoAtletaNoJogo, resultadoJogo, desempateJogo, GOL_CONTRA_ID,
} from "../stats.js";

// Filtro de ano (módulo, pra sobreviver entre re-renders e à troca de jogador).
let filtroAno = "";

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

  const anos = [...new Set(jogosRealizados(state.jogos).map(j => (j.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  if (filtroAno && !anos.includes(filtroAno)) filtroAno = "";

  let corpo = `<div class="empty-state"><h3>Escolha um jogador</h3><p>Selecione um atleta acima para ver o extrato dele.</p></div>`;
  if (atleta) corpo = extratoHtml(atleta, state, filtroAno);

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h1>Extrato do jogador</h1>
      </div>
    </div>
    <div class="form-grid" style="max-width:480px; margin-bottom:20px;">
      <div class="field">
        <label>Jogador</label>
        <select id="extrato-atleta">
          <option value="">Selecione…</option>
          ${opcoes}
        </select>
      </div>
      <div class="field">
        <label>Ano</label>
        <select id="extrato-ano">
          <option value="">Todos</option>
          ${anos.map(a => `<option value="${a}" ${a === filtroAno ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
    </div>
    ${corpo}
  `;

  $("#extrato-atleta", root).addEventListener("change", (e) => {
    location.hash = e.target.value ? `#extrato/${e.target.value}` : "#extrato";
  });
  $("#extrato-ano", root).addEventListener("change", (e) => {
    filtroAno = e.target.value;
    renderExtrato(root, state, atletaId);
  });
}

const RES = {
  vitoria: { letra: "V", cls: "res-v" },
  empate: { letra: "E", cls: "res-e" },
  derrota: { letra: "D", cls: "res-d" },
};

function iniciais(nome){
  return (nome || "?").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function posicaoNoRanking(todos, atletaId, metric){
  const lista = todos.filter(x => x.jogosCount > 0 && (metric === "nota" ? x.media !== null : true));
  const val = { ga: x => x.gols + x.assistencias, gols: x => x.gols, assist: x => x.assistencias, nota: x => x.media, jogos: x => x.jogosCount }[metric];
  lista.sort((a, b) => val(b) - val(a));
  const i = lista.findIndex(x => x.atleta.id === atletaId);
  const meu = lista[i];
  if (i < 0 || (metric !== "nota" && val(meu) === 0)) return null;
  // Empate conta como mesma posição.
  return 1 + lista.findIndex(x => val(x) === val(meu));
}

function pontos(r){ return r === "vitoria" ? 3 : r === "empate" ? 1 : 0; }

function graficoNotas(pontosNota, media){
  if (pontosNota.length < 2) return "";
  const W = 640, H = 130, base = 104, topo = 14;
  const n = pontosNota.length;
  const bw = Math.min(34, (W - 20) / n - 6);
  const x = i => 10 + (i + 0.5) * ((W - 20) / n);
  const y = v => base - (v / 10) * (base - topo);
  const barras = pontosNota.map((p, i) => `
    <rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(p.nota).toFixed(1)}" width="${bw.toFixed(1)}" height="${(base - y(p.nota)).toFixed(1)}" rx="3" fill="var(--gold)" opacity="${p.nota >= media ? 1 : 0.55}"><title>${escapeHtml(p.rotulo)}: nota ${fmt1(p.nota)}</title></rect>
    ${n <= 12 ? `<text x="${x(i).toFixed(1)}" y="${(y(p.nota) - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor">${fmt1(p.nota)}</text>` : ""}
    <text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="currentColor" opacity=".6">${escapeHtml(p.curto)}</text>`).join("");
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Notas jogo a jogo" style="display:block; color:var(--ink);">
      <line x1="10" x2="${W - 10}" y1="${y(media).toFixed(1)}" y2="${y(media).toFixed(1)}" stroke="currentColor" stroke-dasharray="4 4" opacity=".4"/>
      <text x="${W - 10}" y="${(y(media) - 4).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" opacity=".6">média ${fmt1(media)}</text>
      ${barras}
    </svg>`;
}

function extratoHtml(atleta, state, ano){
  const realizados = jogosRealizados(state.jogos).filter(j => !ano || (j.data || "").startsWith(ano));
  const nomeAtleta = (id) => state.atletas.find(a => a.id === id)?.nome || "?";
  const nomeAdv = (id) => state.adversarios.find(a => a.id === id)?.nome || "?";

  // Jogos em que o atleta esteve escalado ou teve algum gol/assistência —
  // os totais batem com os do Ranking (que conta gols mesmo sem escalação).
  const participou = (j) => {
    const escalado = [...normalizeEscalacao(j.escalacaoInicial), ...normalizeEscalacao(j.escalacaoFinal)].some(e => e.atletaId === atleta.id);
    const evento = (j.golsAssistencias || []).some(e => e.atletaGolId === atleta.id || e.atletaAssistId === atleta.id);
    return escalado || evento;
  };
  const jogos = realizados.filter(participou).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const semEle = realizados.filter(j => !participou(j));

  const todosStats = statsPorAtleta(state.atletas.filter(ehJogador), realizados);
  const s = todosStats.find(x => x.atleta.id === atleta.id) || statsPorAtleta([atleta], realizados)[0];
  let v = 0, e = 0, d = 0, ptsCom = 0;
  jogos.forEach(j => {
    const r = resultadoJogo(j);
    if (r === "vitoria") v++; else if (r === "empate") e++; else if (r === "derrota") d++;
    ptsCom += pontos(r);
  });
  const ga = s.gols + s.assistencias;

  // ---- Notas jogo a jogo (do mais antigo ao mais novo) ----
  const comNota = [...jogos].reverse().map(j => ({ j, nota: avg(notasDoAtletaNoJogo(j, atleta.id)) })).filter(x => x.nota !== null);
  const pontosNota = comNota.slice(-15).map(x => ({
    nota: x.nota,
    rotulo: `${formatDate(x.j.data)} vs ${nomeAdv(x.j.adversarioId)}`,
    curto: (x.j.data || "").slice(8, 10) + "/" + (x.j.data || "").slice(5, 7),
  }));
  const melhor = [...comNota].sort((a, b) => b.nota - a.nota)[0];

  // ---- Frases ----
  const rankGA = posicaoNoRanking(todosStats, atleta.id, "ga");
  const rankNota = posicaoNoRanking(todosStats, atleta.id, "nota");
  const rankJogos = posicaoNoRanking(todosStats, atleta.id, "jogos");
  const ultimos5 = jogos.slice(0, 5);
  const marcouEm = ultimos5.filter(j => (j.golsAssistencias || []).some(ev => ev.atletaGolId === atleta.id)).length;
  const titulo = ga > 0
    ? `${ga} participaç${ga === 1 ? "ão" : "ões"} em gols em ${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"}`
    : `${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"} pelo Bom D' Copus${ano ? ` em ${ano}` : ""}`;
  const frases = [];
  if (rankGA && rankGA <= 3 && ga > 0) frases.push(`${rankGA}º do time em gols + assistências`);
  if (rankNota && rankNota <= 3 && s.media !== null) frases.push(`${rankNota}º em nota média`);
  if (rankJogos && rankJogos <= 3) frases.push(`${rankJogos}º em jogos disputados`);
  if (ultimos5.length >= 3 && marcouEm > 0) frases.push(`marcou em ${marcouEm} dos últimos ${ultimos5.length} jogos`);
  if (melhor) frases.push(`melhor atuação: nota ${fmt1(melhor.nota)} contra ${escapeHtml(nomeAdv(melhor.j.adversarioId))}`);
  if (jogos.length >= 3 && semEle.length >= 3){
    const apCom = Math.round(ptsCom / (jogos.length * 3) * 100);
    const apSem = Math.round(semEle.reduce((t, j) => t + pontos(resultadoJogo(j)), 0) / (semEle.length * 3) * 100);
    // Só mostra quando é favorável: a ficha é pública e não deve virar cobrança.
    if (apCom >= apSem) frases.push(`com ele o time tem ${apCom}% de aproveitamento (sem ele, ${apSem}%)`);
  }

  const kpis = [
    ["Jogos", s.jogosCount, rankJogos],
    ["Gols", s.gols, posicaoNoRanking(todosStats, atleta.id, "gols")],
    ["Assistências", s.assistencias, posicaoNoRanking(todosStats, atleta.id, "assist")],
    ["G+A", ga, rankGA],
    ["Nota média", s.media === null ? "—" : fmt1(s.media), rankNota],
  ];
  const kpiHtml = kpis.map(([l, val, pos]) => `
    <div class="kpi-tile"><div class="kpi-label">${l}</div><div class="kpi-value">${val}</div>${pos ? `<div class="kpi-rank">${pos}º do time</div>` : ""}</div>`).join("");

  const cards = jogos.map(j => {
    const res = resultadoJogo(j);
    const info = RES[res];
    const placar = res ? `${j.placarNos} x ${j.placarAdversario}` : "—";
    const pos = posicaoJogadaNoJogo(j, atleta.id) || atleta.posicao || "—";
    const nota = avg(notasDoAtletaNoJogo(j, atleta.id));

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
      <a href="#historico/${j.id}" class="hist-card" style="text-decoration:none; color:inherit;">
        <div class="hist-res ${info ? info.cls : ""}">${info ? info.letra : "—"}</div>
        <div class="hist-info">
          <div class="hist-adv">vs ${escapeHtml(nomeAdv(j.adversarioId))} <span style="font-weight:400; color:var(--ink-faint);">${placar}${desempateJogo(j) ? ` · ${escapeHtml(desempateJogo(j).texto)}` : ""}</span></div>
          <div class="hist-meta">${formatDate(j.data)} · ${escapeHtml(pos)}</div>
          ${linhas.map(l => `<div class="hist-gols" style="white-space:normal;">${l}</div>`).join("")}
        </div>
        <div class="hist-placar">
          <div class="hist-placar-val">${nota === null ? "—" : fmt1(nota)}</div>
          <div class="hist-nota">nota</div>
        </div>
      </a>`;
  }).join("");

  const sub = [atleta.posicao || "", atleta.numero !== null && atleta.numero !== undefined ? `camisa ${atleta.numero}` : "", `${v}V ${e}E ${d}D nos jogos em que participou${ano ? ` em ${ano}` : ""}`].filter(Boolean).join(" · ");

  return `
    <div class="manchete fx-head">
      <div class="fx-avatar">${escapeHtml(iniciais(atleta.nome))}</div>
      <div style="min-width:0;">
        <div class="manchete-eyebrow">${escapeHtml(atleta.nome)}${atleta.ativo === false ? " · inativo" : ""}</div>
        <div class="manchete-titulo">${titulo}</div>
        <div class="manchete-sub">${frases.length ? frases.join(" · ") : "Ainda sem destaques neste período."}</div>
        <div class="manchete-ult" style="color:rgba(255,255,255,.6);">${escapeHtml(sub)}</div>
      </div>
    </div>
    <div class="kpi-grid">${kpiHtml}</div>
    ${pontosNota.length >= 2 ? `
      <div class="card card-pad" style="margin-bottom:18px;">
        <div class="card-title">Evolução das notas</div>
        <div class="card-sub">Nota em cada jogo (últimos ${pontosNota.length}). Barras mais fortes estão acima da média dele.</div>
        ${graficoNotas(pontosNota, avg(pontosNota.map(p => p.nota)))}
      </div>` : ""}
    <h2 style="font-size:18px; margin:6px 0 12px;">Partidas</h2>
    ${cards || `<p style="color:var(--ink-faint); font-style:italic;">Nenhuma partida realizada com esse jogador.</p>`}
  `;
}
