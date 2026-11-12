import { $, $$, escapeHtml, fmt1, toast, avg } from "../utils.js";
import { ehJogador, jogosRealizados, statsPorAtleta, notasDoAtletaNoJogo, resultadoJogo } from "../stats.js";
import { anosDisponiveis, MESES } from "../filters.js";
import { openImagemModal, iniciais } from "./flyer.js";

// Premiações da temporada (artilheiro, garçom, G+A, melhor nota, mais assíduo)
// e Destaque do mês (melhor nota média do mês), com imagem pra compartilhar.

let aba = "temporada"; // temporada | mes
let anoSel = null;     // null = ano mais recente; "all" = todos
let mesSel = null;     // "AAAA-MM"; null = mês mais recente

const HASHTAGS = "#bdc04\n#futeboldevarzea\n#somosbdc";

function mesLabel(ref){
  const [a, m] = ref.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

function nomesTexto(itens, limite = 2){
  const n = itens.map(i => i.atleta.nome);
  return n.length <= limite ? n.join(", ") : `${n.slice(0, limite).join(", ")} +${n.length - limite}`;
}

// Quatro/cinco prêmios da temporada. `top` traz o pódio (até 3), `vencedores`
// todos que empatam na liderança.
function calcularPremios(jogadores, jogos){
  const base = statsPorAtleta(jogadores, jogos).filter(s => s.jogosCount > 0 || s.gols > 0 || s.assistencias > 0);
  const asc = [...jogos].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const comNota = (id) => jogos.filter(j => notasDoAtletaNoJogo(j, id).length > 0).length;
  const jogosAvaliados = jogos.filter(j => Object.keys(j.avaliacoesJogadores || {}).some(id => notasDoAtletaNoJogo(j, id).length > 0)).length;
  const minNota = Math.min(5, Math.max(1, Math.ceil(jogosAvaliados * 0.4)));
  const porNome = (a, b) => (a.atleta.nome || "").localeCompare(b.atleta.nome || "", "pt-BR");

  // Extras: gols em jogos vencidos (Decisivo) e evolução das notas (Revelação).
  const stats = base.map(s => {
    const id = s.atleta.id;
    let golsVit = 0;
    asc.forEach(j => { if (resultadoJogo(j) === "vitoria") (j.golsAssistencias || []).forEach(e => { if (e.atletaGolId === id) golsVit++; }); });
    const notas = asc.map(j => avg(notasDoAtletaNoJogo(j, id))).filter(n => n !== null);
    let delta = null;
    if (notas.length >= 4){
      const meio = Math.floor(notas.length / 2);
      delta = avg(notas.slice(meio)) - avg(notas.slice(0, meio));
    }
    return { ...s, golsVit, delta };
  });

  const defs = [
    { key: "artilheiro", emoji: "⚽", label: "Artilheiro", metric: s => s.gols, filtro: s => s.gols > 0, desempate: (a, b) => b.assistencias - a.assistencias, fmt: s => `${s.gols} gol${s.gols > 1 ? "s" : ""}`, unidade: "gols" },
    { key: "garcom", emoji: "🅰️", label: "Garçom", metric: s => s.assistencias, filtro: s => s.assistencias > 0, desempate: (a, b) => b.gols - a.gols, fmt: s => `${s.assistencias} assist.`, unidade: "assistências" },
    { key: "ga", emoji: "🔥", label: "Gols + assistências", metric: s => s.gols + s.assistencias, filtro: s => s.gols + s.assistencias > 0, desempate: (a, b) => b.gols - a.gols, fmt: s => `${s.gols + s.assistencias} (${s.gols}G ${s.assistencias}A)`, unidade: "participações em gols" },
    { key: "nota", emoji: "⭐", label: "Melhor nota média", metric: s => s.media, filtro: s => s.media !== null && comNota(s.atleta.id) >= minNota, desempate: (a, b) => b.jogosCount - a.jogosCount, fmt: s => fmt1(s.media), unidade: `nota média (mín. ${minNota} jogos avaliados)` },
    { key: "assiduo", emoji: "🏃", label: "Mais assíduo", metric: s => s.jogosCount, filtro: s => s.jogosCount > 0, desempate: (a, b) => b.gols + b.assistencias - (a.gols + a.assistencias), fmt: s => `${s.jogosCount} jogo${s.jogosCount > 1 ? "s" : ""}`, unidade: "jogos" },
    { key: "decisivo", emoji: "🎯", label: "Decisivo", metric: s => s.golsVit, filtro: s => s.golsVit > 0, desempate: (a, b) => b.assistencias - a.assistencias, fmt: s => `${s.golsVit} gol${s.golsVit > 1 ? "s" : ""} em vitórias`, unidade: "gols em jogos vencidos" },
    { key: "revelacao", emoji: "📈", label: "Revelação", metric: s => s.delta, filtro: s => s.delta !== null && s.delta > 0.05, desempate: (a, b) => b.jogosCount - a.jogosCount, fmt: s => `+${fmt1(s.delta)} na nota`, unidade: "evolução da nota (2ª metade da temporada x 1ª)" },
  ];
  return defs.map(d => {
    const lista = stats.filter(d.filtro).sort((a, b) => d.metric(b) - d.metric(a) || d.desempate(a, b) || porNome(a, b));
    const lider = lista[0] ? d.metric(lista[0]) : null;
    return { ...d, top: lista.slice(0, 3), vencedores: lista.filter(s => d.metric(s) === lider) };
  });
}

function rankingDoMes(jogadores, realizados, mes){
  return statsPorAtleta(jogadores, realizados.filter(j => (j.data || "").startsWith(mes)))
    .filter(s => s.media !== null && s.jogosCount > 0)
    .sort((a, b) => b.media - a.media || (b.gols + b.assistencias) - (a.gols + a.assistencias) || b.jogosCount - a.jogosCount);
}

function textoTemporada(premios, periodo){
  const linhas = [`🏆 *Premiação ${periodo} — Bom D' Copus*`, ""];
  premios.filter(p => p.vencedores.length).forEach(p => {
    linhas.push(`${p.emoji} ${p.label}: ${nomesTexto(p.vencedores, 3)} (${p.fmt(p.vencedores[0])})`);
  });
  return linhas.join("\n");
}

function abrirImagemTemporada(premios, periodo){
  const itens = premios.filter(p => p.vencedores.length);
  openImagemModal({
    titulo: "Imagem da premiação",
    arquivo: `premiacao-bom-d-copus-${periodo.replace(/\W+/g, "-").toLowerCase()}`,
    legenda: `${textoTemporada(premios, periodo).replace(/\*/g, "")}\n\n${HASHTAGS}`,
    render: (e) => {
      const pad = e.H > 1500 ? 30 : 12;
      const fn = itens.length > 5 ? 48 : 60;
      const linhas = itens.map(p => `
        <div style="display:flex; align-items:center; gap:22px; width:100%; padding:${pad}px 0; border-bottom:2px solid ${e.A}44;">
          <div style="font-size:${fn}px; width:84px; text-align:center;">${p.emoji}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:24px; letter-spacing:.18em; color:${e.A};">${escapeHtml(p.label.toUpperCase())}</div>
            <div style="font-family:'Bebas Neue',sans-serif; font-size:${fn}px; line-height:1.05;">${escapeHtml(nomesTexto(p.vencedores).toUpperCase())}</div>
          </div>
          <div style="font-family:'Bebas Neue',sans-serif; font-size:${fn - 10}px; color:${e.A}; white-space:nowrap;">${escapeHtml(p.fmt(p.vencedores[0]))}</div>
        </div>`).join("");
      return `<div style="${e.base}">${e.cantos}${e.topo}
        <div style="text-align:center;">
          <div style="font-family:'Bebas Neue',sans-serif; font-size:84px; letter-spacing:.16em; color:${e.A}; line-height:1;">PREMIAÇÃO</div>
          <div style="font-size:38px; color:${e.T.muted2}; margin-top:8px;">${escapeHtml(periodo.toUpperCase())}</div>
        </div>
        <div style="width:100%;">${linhas}</div>
        ${e.rodape}
      </div>`;
    },
  });
}

function abrirImagemDestaque(ranking, mesRef){
  const top = ranking.slice(0, 5);
  const porId = Object.fromEntries(top.map(s => [s.atleta.id, s]));
  const [, m] = mesRef.split("-").map(Number);
  const mesNome = MESES[m - 1].toUpperCase();
  const legenda = (id) => {
    const s = porId[id] || top[0];
    return [`🏆 Destaque do mês — ${mesLabel(mesRef)}`, `⭐ ${s.atleta.nome} — nota média ${fmt1(s.media)}`,
      `📊 ${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"} · ${s.gols} gol${s.gols === 1 ? "" : "s"} · ${s.assistencias} assistência${s.assistencias === 1 ? "" : "s"}`, "", HASHTAGS].join("\n");
  };
  openImagemModal({
    titulo: `Destaque do mês — ${mesLabel(mesRef)}`,
    arquivo: `destaque-do-mes-${mesRef}`,
    comFoto: true,
    selecao: { label: "Jogador", padrao: top[0].atleta.id, opcoes: top.map(s => ({ value: s.atleta.id, label: `${s.atleta.nome} — ${fmt1(s.media)}` })) },
    legenda,
    render: (e) => {
      const s = porId[e.selecaoId] || top[0];
      const ph = e.formato === "story" ? 700 : 470;
      const quadro = e.foto
        ? `<img src="${e.foto}" style="width:${ph}px; height:${ph}px; object-fit:cover; border-radius:44px; border:10px solid ${e.A};">`
        : `<div style="width:${ph}px; height:${ph}px; border-radius:44px; border:10px solid ${e.A}; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:${Math.round(ph * 0.4)}px; color:${e.A};">${escapeHtml(iniciais(s.atleta.nome))}</div>`;
      const feitos = [`${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"}`, s.gols ? `${s.gols} gol${s.gols > 1 ? "s" : ""}` : "", s.assistencias ? `${s.assistencias} assistência${s.assistencias > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
      return `<div style="${e.base}">${e.cantos}${e.topo}
        <div style="font-family:'Bebas Neue',sans-serif; font-size:70px; letter-spacing:.14em; color:${e.A}; text-align:center; line-height:1.05;">DESTAQUE DE ${escapeHtml(mesNome)}</div>
        ${quadro}
        <div style="text-align:center;">
          <div style="font-family:'Bebas Neue',sans-serif; font-size:116px; line-height:1; letter-spacing:.02em;">${escapeHtml(s.atleta.nome.toUpperCase())}</div>
          <div style="font-size:36px; color:${e.T.muted2}; margin-top:8px;">${escapeHtml([s.atleta.posicao, feitos].filter(Boolean).join(" · "))}</div>
        </div>
        <div style="border:4px solid ${e.A}; border-radius:26px; padding:10px 46px; text-align:center;"><div style="font-size:24px; letter-spacing:.16em; color:${e.A};">NOTA MÉDIA</div><div style="font-family:'Bebas Neue',sans-serif; font-size:100px; line-height:1;">${fmt1(s.media)}</div></div>
        <div style="text-align:center; font-size:30px; color:${e.T.muted2};">${escapeHtml(mesLabel(mesRef))}</div>
        ${e.rodape}
      </div>`;
    },
  });
}

export function renderPremiacoes(root, state){
  const jogadores = state.atletas.filter(ehJogador);
  const realizados = jogosRealizados(state.jogos);
  const anos = anosDisponiveis(realizados);
  const meses = [...new Set(realizados.map(j => (j.data || "").slice(0, 7)).filter(m => m.length === 7))].sort().reverse();
  if (anoSel === null) anoSel = anos[0] || "all";
  if (anoSel !== "all" && !anos.includes(anoSel)) anoSel = anos[0] || "all";
  if (mesSel === null || !meses.includes(mesSel)) mesSel = meses[0] || null;

  let corpo = "";
  let periodo = "";

  if (aba === "temporada"){
    const jogos = anoSel === "all" ? realizados : realizados.filter(j => (j.data || "").startsWith(anoSel));
    periodo = anoSel === "all" ? "de todas as temporadas" : `da temporada ${anoSel}`;
    const premios = calcularPremios(jogadores, jogos);
    const entregues = premios.filter(p => p.vencedores.length);

    // Quem levou mais troféus (manchete).
    const trofeus = new Map();
    entregues.forEach(p => p.vencedores.forEach(v => trofeus.set(v.atleta.id, { atleta: v.atleta, n: (trofeus.get(v.atleta.id)?.n || 0) + 1 })));
    const rank = [...trofeus.values()].sort((a, b) => b.n - a.n);
    const topN = rank.length ? rank[0].n : 0;
    const campeoes = rank.filter(r => r.n === topN);
    const manchete = entregues.length ? `
      <div class="manchete">
        <div class="manchete-eyebrow">Premiação ${anoSel === "all" ? "de todas as temporadas" : `da temporada ${anoSel}`}</div>
        <div class="manchete-titulo">${topN > 1 ? `${escapeHtml(nomesTexto(campeoes.map(c => ({ atleta: c.atleta })), 2))} ${campeoes.length > 1 ? "lideram" : "lidera"} com ${topN} troféus` : `${entregues.length} prêmios entregues, cada um com um dono diferente`}</div>
        <div class="manchete-sub">${entregues.length} prêmios em ${jogos.length} jogo${jogos.length === 1 ? "" : "s"} · quem vai levar a taça no fim do ano?</div>
      </div>` : "";

    const cards = premios.map(p => {
      if (!p.vencedores.length) return `
        <div class="tro-card tro-vazio">
          <div class="tro-top"><span class="tro-emoji">${p.emoji}</span><span class="tro-label">${escapeHtml(p.label)}</span></div>
          <div class="tro-outros">Sem dados suficientes ainda.</div>
        </div>`;
      const outros = p.top.slice(1).map((s, i) => `${i + 2}º ${escapeHtml(s.atleta.nome)} ${escapeHtml(p.fmt(s))}`).join(" · ");
      return `
        <div class="tro-card">
          <div class="tro-top"><span class="tro-emoji">${p.emoji}</span><span class="tro-label">${escapeHtml(p.label)}</span></div>
          <div class="tro-nome">${escapeHtml(nomesTexto(p.vencedores, 2))}</div>
          <div class="tro-val">${escapeHtml(p.fmt(p.vencedores[0]))}</div>
          ${outros ? `<div class="tro-outros">${outros}</div>` : ""}
        </div>`;
    }).join("");
    corpo = `
      ${manchete}
      <div class="rank-filtros" style="max-width:520px;">
        <div class="field">
          <label>Temporada</label>
          <select id="pm-ano">
            ${anos.map(a => `<option value="${a}" ${a === anoSel ? "selected" : ""}>${a}</option>`).join("")}
            <option value="all" ${anoSel === "all" ? "selected" : ""}>Todas</option>
          </select>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
        <button class="btn btn-primary btn-sm" id="pm-imagem" ${entregues.length ? "" : "disabled"}>Gerar imagem da premiação</button>
        <button class="btn btn-ghost btn-sm" id="pm-copiar" ${entregues.length ? "" : "disabled"}>Copiar texto</button>
      </div>
      <div class="tro-grid">${cards}</div>`;
    root.__premios = premios;
  } else {
    const ranking = mesSel ? rankingDoMes(jogadores, realizados, mesSel) : [];
    root.__ranking = ranking;
    const top3 = ranking.slice(0, 3);
    const pod = (s, i) => `
      <div class="rank-pod p${i + 1}" data-atleta="${s.atleta.id}" title="Ver extrato">
        <div class="rank-pod-pos">${i + 1}º</div>
        <div class="rank-pod-name">${escapeHtml(s.atleta.nome)}</div>
        <div class="rank-pod-val">${fmt1(s.media)}</div>
        <div class="rank-pod-unit">nota média</div>
        <div class="rank-pod-sub">${s.jogosCount} jogo${s.jogosCount === 1 ? "" : "s"} · ${s.gols}G ${s.assistencias}A</div>
      </div>`;
    const resto = ranking.slice(3, 8).map((s, i) => `
      <tr><td class="pill-num">${i + 4}º</td><td><strong>${escapeHtml(s.atleta.nome)}</strong></td><td class="pill-num">${fmt1(s.media)}</td><td class="pill-num">${s.jogosCount}</td><td class="pill-num">${s.gols}</td><td class="pill-num">${s.assistencias}</td></tr>`).join("");

    // Linha do tempo: destaque de cada mês.
    const historico = meses.map(m => ({ mes: m, rk: rankingDoMes(jogadores, realizados, m) })).filter(x => x.rk.length);
    root.__historico = historico;

    corpo = `
      ${ranking.length ? `
      <div class="manchete">
        <div class="manchete-eyebrow">Destaque de ${escapeHtml(mesLabel(mesSel))}</div>
        <div class="manchete-titulo">${escapeHtml(ranking[0].atleta.nome)} — nota média ${fmt1(ranking[0].media)}</div>
        <div class="manchete-sub">${ranking[0].jogosCount} jogo${ranking[0].jogosCount === 1 ? "" : "s"} no mês, ${ranking[0].gols} gol${ranking[0].gols === 1 ? "" : "s"} e ${ranking[0].assistencias} assistência${ranking[0].assistencias === 1 ? "" : "s"}${ranking[1] ? ` · logo atrás: ${escapeHtml(ranking[1].atleta.nome)} (${fmt1(ranking[1].media)})` : ""}</div>
      </div>` : ""}
      <div class="rank-filtros" style="max-width:520px;">
        <div class="field">
          <label>Mês</label>
          <select id="pm-mes">${meses.map(m => `<option value="${m}" ${m === mesSel ? "selected" : ""}>${mesLabel(m)}</option>`).join("")}</select>
        </div>
      </div>
      ${ranking.length ? `
        <div style="margin-bottom:16px;"><button class="btn btn-primary btn-sm" id="pm-destaque">Gerar imagem do destaque</button></div>
        <div class="rank-podium">${[1, 0, 2].filter(i => top3[i]).map(i => pod(top3[i], i)).join("")}</div>
        ${resto ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Atleta</th><th>Nota média</th><th>Jogos</th><th>Gols</th><th>Assist.</th></tr></thead>
          <tbody>${resto}</tbody></table></div>` : ""}
        <p class="field-hint" style="margin-top:8px;">Ranking pela nota média no mês, só com jogadores escalados e avaliados. Desempate por gols + assistências e depois por jogos.</p>`
      : `<div class="empty-state"><h3>Sem notas nesse mês</h3><p>O destaque do mês usa as avaliações dos jogadores. Escolha outro mês ou lance as notas das partidas.</p></div>`}

      ${historico.length ? `
        <div class="dash-section-title" style="margin-top:26px;">Destaques mês a mês</div>
        ${historico.map(h => `
          <div class="hist-card" style="cursor:default;">
            <div class="hist-res res-e" style="font-size:12px;">${escapeHtml(MESES[Number(h.mes.slice(5)) - 1].slice(0, 3).toUpperCase())}</div>
            <div class="hist-info">
              <div class="hist-adv">${escapeHtml(h.rk[0].atleta.nome)}</div>
              <div class="hist-meta">${escapeHtml(mesLabel(h.mes))} · ${h.rk[0].jogosCount} jogo${h.rk[0].jogosCount === 1 ? "" : "s"} · ${h.rk[0].gols}G ${h.rk[0].assistencias}A</div>
            </div>
            <div class="hist-placar">
              <div class="hist-placar-val">${fmt1(h.rk[0].media)}</div>
              <button class="btn btn-ghost btn-sm" data-img-mes="${h.mes}" type="button" style="margin-top:4px;">Imagem</button>
            </div>
          </div>`).join("")}` : ""}`;
  }

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h1>Premiações</h1>
      </div>
    </div>
    <div class="rank-chips">
      <button class="rank-chip ${aba === "temporada" ? "active" : ""}" data-aba="temporada" type="button">Premiação da temporada</button>
      <button class="rank-chip ${aba === "mes" ? "active" : ""}" data-aba="mes" type="button">Destaque do mês</button>
    </div>
    ${corpo}
  `;

  $$(".rank-chip[data-aba]", root).forEach(b => b.addEventListener("click", () => { aba = b.dataset.aba; renderPremiacoes(root, state); }));
  $$(".rank-pod", root).forEach(el => el.addEventListener("click", () => { location.hash = `#extrato/${el.dataset.atleta}`; }));
  $("#pm-ano", root)?.addEventListener("change", (e) => { anoSel = e.target.value; renderPremiacoes(root, state); });
  $("#pm-mes", root)?.addEventListener("change", (e) => { mesSel = e.target.value; renderPremiacoes(root, state); });
  $("#pm-imagem", root)?.addEventListener("click", () => abrirImagemTemporada(root.__premios, periodo.replace("da temporada ", "temporada ").replace("de todas as temporadas", "todas as temporadas")));
  $("#pm-copiar", root)?.addEventListener("click", async () => {
    try{ await navigator.clipboard.writeText(textoTemporada(root.__premios, periodo.replace("da temporada ", "temporada "))); toast("Texto copiado! Cole no WhatsApp.", "ok"); }
    catch(err){ toast("Não foi possível copiar automaticamente.", "err"); }
  });
  $("#pm-destaque", root)?.addEventListener("click", () => abrirImagemDestaque(root.__ranking, mesSel));
  $$("[data-img-mes]", root).forEach(b => b.addEventListener("click", () => {
    const h = root.__historico.find(x => x.mes === b.dataset.imgMes);
    if (h) abrirImagemDestaque(h.rk, h.mes);
  }));
}
