import { escapeHtml, formatDate, fmt1 } from "../utils.js";
import { jogosRealizados, resultadoJogo, statsPorAtleta, ehJogador } from "../stats.js";
import { MESES } from "../filters.js";

// Hub "Relatórios" — abre com a história da temporada em uma manchete e
// agrupa as telas de consulta por pergunta (quem está bem, como o time joga,
// memória do time). Cada cartão traz uma frase gerada pelos dados.

const ICONES = {
  ranking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10l-1 8a4 4 0 0 1-8 0L7 4z"/><path d="M5 6H3a2 2 0 0 0 0 4h1M19 6h2a2 2 0 0 1 0 4h-1"/></svg>`,
  premiacoes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg>`,
  extrato: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>`,
  retrospecto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  "escalacao-ideal": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="2.4"/><circle cx="5" cy="14" r="2.4"/><circle cx="19" cy="14" r="2.4"/><circle cx="9" cy="20" r="2.4"/><circle cx="15" cy="20" r="2.4"/></svg>`,
  historico: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
};

function plural(n, um, varios){ return `${n} ${n === 1 ? um : varios}`; }

export function renderRelatoriosHub(root, state){
  const realizados = jogosRealizados(state.jogos).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const jogadores = state.atletas.filter(ehJogador);
  const nomeAdv = id => state.adversarios.find(a => a.id === id)?.nome || "?";

  // ---- Manchete da temporada (ano mais recente com jogos) ----
  const ano = realizados[0] ? realizados[0].data.slice(0, 4) : null;
  const doAno = ano ? realizados.filter(j => j.data.startsWith(ano)) : [];
  const cont = { vitoria: 0, empate: 0, derrota: 0 };
  let gp = 0, gc = 0;
  doAno.forEach(j => {
    const r = resultadoJogo(j);
    if (r) cont[r]++;
    gp += j.placarNos || 0; gc += j.placarAdversario || 0;
  });
  const aprov = doAno.length ? Math.round(((cont.vitoria * 3 + cont.empate) / (doAno.length * 3)) * 100) : 0;
  const stAno = statsPorAtleta(jogadores, doAno);
  const artilheiro = [...stAno].sort((a, b) => b.gols - a.gols || b.assistencias - a.assistencias)[0];
  const ultimo = realizados[0];
  const rUlt = ultimo ? resultadoJogo(ultimo) : null;
  const txtUlt = ultimo ? `${{ vitoria: "Vitória", empate: "Empate", derrota: "Derrota" }[rUlt] || "Jogo"} ${ultimo.placarNos ?? "–"} x ${ultimo.placarAdversario ?? "–"} contra ${nomeAdv(ultimo.adversarioId)} em ${formatDate(ultimo.data)}` : "";

  const manchete = doAno.length ? `
    <div class="manchete">
      <div class="manchete-eyebrow">Temporada ${ano}${ano === String(new Date().getFullYear()) ? " até aqui" : ""}</div>
      <div class="manchete-titulo">${plural(cont.vitoria, "vitória", "vitórias")}, ${plural(cont.empate, "empate", "empates")} e ${plural(cont.derrota, "derrota", "derrotas")} em ${plural(doAno.length, "jogo", "jogos")}</div>
      <div class="manchete-sub">${plural(gp, "gol marcado", "gols marcados")} e ${gc} sofrido${gc === 1 ? "" : "s"} · aproveitamento de ${aprov}%${artilheiro && artilheiro.gols > 0 ? ` · ${escapeHtml(artilheiro.atleta.nome)} lidera a artilharia com ${artilheiro.gols} gol${artilheiro.gols === 1 ? "" : "s"}` : ""}</div>
      ${txtUlt ? `<div class="manchete-ult">Último jogo: ${escapeHtml(txtUlt)}</div>` : ""}
    </div>` : `
    <div class="manchete"><div class="manchete-titulo">A temporada ainda não começou nas estatísticas</div><div class="manchete-sub">Assim que as primeiras partidas forem realizadas, a história do time aparece aqui.</div></div>`;

  // ---- Frases de cada cartão ----
  const todosStats = statsPorAtleta(jogadores, realizados);
  const lider = [...todosStats].sort((a, b) => (b.gols + b.assistencias) - (a.gols + a.assistencias))[0];
  const fraseRanking = lider && (lider.gols + lider.assistencias) > 0
    ? `${lider.atleta.nome} lidera em gols + assistências (${lider.gols + lider.assistencias})` : "Artilharia, assistências e notas";

  // Destaque do mês: melhor nota média do último mês com notas.
  let fraseMes = "Temporada e destaque do mês, com imagem pra compartilhar";
  const meses = [...new Set(realizados.map(j => j.data.slice(0, 7)))].sort().reverse();
  for (const m of meses){
    const rk = statsPorAtleta(jogadores, realizados.filter(j => j.data.startsWith(m)))
      .filter(s => s.media !== null && s.jogosCount > 0).sort((a, b) => b.media - a.media);
    if (rk.length){ fraseMes = `${MESES[Number(m.slice(5)) - 1]}: ${rk[0].atleta.nome} é o destaque (nota ${fmt1(rk[0].media)})`; break; }
  }

  // Freguês e carrasco: adversários com melhor e pior aproveitamento (mín. 2 jogos).
  const porAdv = {};
  realizados.forEach(j => {
    const r = resultadoJogo(j); if (!r) return;
    const x = porAdv[j.adversarioId] = porAdv[j.adversarioId] || { n: 0, pts: 0 };
    x.n++; x.pts += r === "vitoria" ? 3 : r === "empate" ? 1 : 0;
  });
  const advs = Object.entries(porAdv).filter(([, x]) => x.n >= 2).map(([id, x]) => ({ id, n: x.n, ap: x.pts / (x.n * 3) }));
  advs.sort((a, b) => b.ap - a.ap);
  const fraseRetro = advs.length >= 2
    ? `Melhor campanha contra ${nomeAdv(advs[0].id)} (${Math.round(advs[0].ap * 100)}%); mais difícil: ${nomeAdv(advs[advs.length - 1].id)}`
    : "Campanha contra cada adversário e em cada campo";

  const grupos = [
    { titulo: "Quem está se destacando", itens: [
      { route: "ranking", label: "Ranking", desc: fraseRanking },
      { route: "premiacoes", label: "Premiações", desc: fraseMes },
      { route: "extrato", label: "Extrato do jogador", desc: `A ficha de cada um dos ${jogadores.filter(a => a.ativo !== false).length} atletas ativos` },
    ]},
    { titulo: "Como o time joga", itens: [
      { route: "retrospecto", label: "Retrospecto", desc: fraseRetro },
      { route: "escalacao-ideal", label: "Escalação ideal", desc: "O melhor time possível, por formação" },
    ]},
    { titulo: "Memória do time", itens: [
      { route: "historico", label: "Histórico", desc: `${plural(realizados.length, "partida", "partidas")} na história${ultimo ? ` · a última em ${formatDate(ultimo.data)}` : ""}` },
    ]},
  ];

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Visão geral</div>
        <h1>Relatórios</h1>
      </div>
    </div>
    ${manchete}
    ${grupos.map(g => `
      <div class="dash-section-title" style="margin-top:6px;">${g.titulo}</div>
      <div class="dashboard-grid-3">
        ${g.itens.map(it => `
          <a href="#${it.route}" class="card card-pad" style="display:flex; align-items:center; gap:14px; text-decoration:none;">
            <div style="width:44px; height:44px; border-radius:50%; background:var(--pitch-light); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--pitch);">${ICONES[it.route]}</div>
            <div style="min-width:0;">
              <div class="card-title" style="margin-bottom:2px;">${it.label}</div>
              <div class="card-sub" style="margin-bottom:0;">${escapeHtml(it.desc)}</div>
            </div>
          </a>`).join("")}
      </div>`).join("")}
  `;
}
