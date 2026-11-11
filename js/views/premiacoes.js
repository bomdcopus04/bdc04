import { $, $$, escapeHtml, fmt1, toast } from "../utils.js";
import { ehJogador, jogosRealizados, statsPorAtleta, notasDoAtletaNoJogo } from "../stats.js";
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
  const stats = statsPorAtleta(jogadores, jogos).filter(s => s.jogosCount > 0 || s.gols > 0 || s.assistencias > 0);
  const comNota = (id) => jogos.filter(j => notasDoAtletaNoJogo(j, id).length > 0).length;
  const jogosAvaliados = jogos.filter(j => Object.keys(j.avaliacoesJogadores || {}).some(id => notasDoAtletaNoJogo(j, id).length > 0)).length;
  const minNota = Math.min(5, Math.max(1, Math.ceil(jogosAvaliados * 0.4)));
  const porNome = (a, b) => (a.atleta.nome || "").localeCompare(b.atleta.nome || "", "pt-BR");

  const defs = [
    { key: "artilheiro", emoji: "⚽", label: "Artilheiro", metric: s => s.gols, filtro: s => s.gols > 0, desempate: (a, b) => b.assistencias - a.assistencias, fmt: s => `${s.gols} gol${s.gols > 1 ? "s" : ""}`, unidade: "gols" },
    { key: "garcom", emoji: "🅰️", label: "Garçom", metric: s => s.assistencias, filtro: s => s.assistencias > 0, desempate: (a, b) => b.gols - a.gols, fmt: s => `${s.assistencias} assist.`, unidade: "assistências" },
    { key: "ga", emoji: "🔥", label: "Gols + assistências", metric: s => s.gols + s.assistencias, filtro: s => s.gols + s.assistencias > 0, desempate: (a, b) => b.gols - a.gols, fmt: s => `${s.gols + s.assistencias} (${s.gols}G ${s.assistencias}A)`, unidade: "participações em gols" },
    { key: "nota", emoji: "⭐", label: "Melhor nota média", metric: s => s.media, filtro: s => s.media !== null && comNota(s.atleta.id) >= minNota, desempate: (a, b) => b.jogosCount - a.jogosCount, fmt: s => fmt1(s.media), unidade: `nota média (mín. ${minNota} jogos avaliados)` },
    { key: "assiduo", emoji: "🏃", label: "Mais assíduo", metric: s => s.jogosCount, filtro: s => s.jogosCount > 0, desempate: (a, b) => b.gols + b.assistencias - (a.gols + a.assistencias), fmt: s => `${s.jogosCount} jogo${s.jogosCount > 1 ? "s" : ""}`, unidade: "jogos" },
  ];
  return defs.map(d => {
    const lista = stats.filter(d.filtro).sort((a, b) => d.metric(b) - d.metric(a) || d.desempate(a, b) || porNome(a, b));
    const lider = lista[0] ? d.metric(lista[0]) : null;
    return { ...d, top: lista.slice(0, 3), vencedores: lista.filter(s => d.metric(s) === lider) };
  });
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
      const pad = e.H > 1500 ? 34 : 18;
      const linhas = itens.map(p => `
        <div style="display:flex; align-items:center; gap:22px; width:100%; padding:${pad}px 0; border-bottom:2px solid ${e.A}44;">
          <div style="font-size:60px; width:84px; text-align:center;">${p.emoji}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:24px; letter-spacing:.18em; color:${e.A};">${escapeHtml(p.label.toUpperCase())}</div>
            <div style="font-family:'Bebas Neue',sans-serif; font-size:60px; line-height:1.05;">${escapeHtml(nomesTexto(p.vencedores).toUpperCase())}</div>
          </div>
          <div style="font-family:'Bebas Neue',sans-serif; font-size:50px; color:${e.A}; white-space:nowrap;">${escapeHtml(p.fmt(p.vencedores[0]))}</div>
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
    const cards = premios.map(p => `
      <div class="card card-pad">
        <div class="card-title">${p.emoji} ${escapeHtml(p.label)}</div>
        <div class="card-sub">${escapeHtml(p.unidade)}</div>
        ${p.top.length ? p.top.map((s, i) => `
          <div style="display:flex; justify-content:space-between; gap:10px; padding:6px 0; ${i ? "" : "font-weight:700;"}">
            <span>${["🥇", "🥈", "🥉"][i]} ${escapeHtml(s.atleta.nome)}</span>
            <span style="font-family:var(--font-mono);">${escapeHtml(p.fmt(s))}</span>
          </div>`).join("") : `<p style="color:var(--ink-faint); font-size:13px; margin:0;">Sem dados suficientes.</p>`}
      </div>`).join("");
    corpo = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
        <button class="btn btn-primary btn-sm" id="pm-imagem" ${premios.some(p => p.vencedores.length) ? "" : "disabled"}>Gerar imagem da premiação</button>
        <button class="btn btn-ghost btn-sm" id="pm-copiar" ${premios.some(p => p.vencedores.length) ? "" : "disabled"}>Copiar texto</button>
      </div>
      <div class="dashboard-grid-3">${cards}</div>`;
    root.__premios = premios;
  } else {
    const jogosMes = mesSel ? realizados.filter(j => (j.data || "").startsWith(mesSel)) : [];
    const ranking = statsPorAtleta(jogadores, jogosMes)
      .filter(s => s.media !== null && s.jogosCount > 0)
      .sort((a, b) => b.media - a.media || (b.gols + b.assistencias) - (a.gols + a.assistencias) || b.jogosCount - a.jogosCount);
    root.__ranking = ranking;
    const linhas = ranking.slice(0, 8).map((s, i) => `
      <tr>
        <td class="pill-num">${i + 1}º</td>
        <td><strong>${escapeHtml(s.atleta.nome)}</strong></td>
        <td class="pill-num">${fmt1(s.media)}</td>
        <td class="pill-num">${s.jogosCount}</td>
        <td class="pill-num">${s.gols}</td>
        <td class="pill-num">${s.assistencias}</td>
      </tr>`).join("");
    corpo = `
      <div class="form-grid" style="max-width:420px; margin-bottom:14px;">
        <div class="field">
          <label>Mês</label>
          <select id="pm-mes">${meses.map(m => `<option value="${m}" ${m === mesSel ? "selected" : ""}>${mesLabel(m)}</option>`).join("")}</select>
        </div>
      </div>
      ${ranking.length ? `
        <div class="card card-pad" style="margin-bottom:14px;">
          <div class="card-sub" style="margin-bottom:2px;">🏆 Destaque de ${escapeHtml(mesSel ? mesLabel(mesSel) : "")}</div>
          <div style="font-family:'Bebas Neue',sans-serif; font-size:34px; letter-spacing:.03em;">${escapeHtml(ranking[0].atleta.nome)} — nota média ${fmt1(ranking[0].media)}</div>
        </div>
        <div style="margin-bottom:14px;"><button class="btn btn-primary btn-sm" id="pm-destaque">Gerar imagem do destaque</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Atleta</th><th>Nota média</th><th>Jogos</th><th>Gols</th><th>Assist.</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <p class="field-hint" style="margin-top:8px;">Ranking pela nota média no mês, só com jogadores escalados e avaliados. Desempate por gols + assistências e depois por jogos.</p>`
      : `<div class="empty-state"><h3>Sem notas nesse mês</h3><p>O destaque do mês usa as avaliações dos jogadores. Escolha outro mês ou lance as notas das partidas.</p></div>`}`;
  }

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h1>Premiações</h1>
      </div>
    </div>
    <div class="tabbar">
      <button class="tab-btn ${aba === "temporada" ? "active" : ""}" data-aba="temporada">Premiação da temporada</button>
      <button class="tab-btn ${aba === "mes" ? "active" : ""}" data-aba="mes">Destaque do mês</button>
    </div>
    ${aba === "temporada" ? `
      <div class="form-grid" style="max-width:420px; margin-bottom:14px;">
        <div class="field">
          <label>Temporada</label>
          <select id="pm-ano">
            ${anos.map(a => `<option value="${a}" ${a === anoSel ? "selected" : ""}>${a}</option>`).join("")}
            <option value="all" ${anoSel === "all" ? "selected" : ""}>Todas</option>
          </select>
        </div>
      </div>` : ""}
    ${corpo}
  `;

  $$(".tab-btn[data-aba]", root).forEach(b => b.addEventListener("click", () => { aba = b.dataset.aba; renderPremiacoes(root, state); }));
  $("#pm-ano", root)?.addEventListener("change", (e) => { anoSel = e.target.value; renderPremiacoes(root, state); });
  $("#pm-mes", root)?.addEventListener("change", (e) => { mesSel = e.target.value; renderPremiacoes(root, state); });
  $("#pm-imagem", root)?.addEventListener("click", () => abrirImagemTemporada(root.__premios, periodo.replace("da temporada ", "temporada ").replace("de todas as temporadas", "todas as temporadas")));
  $("#pm-copiar", root)?.addEventListener("click", async () => {
    try{ await navigator.clipboard.writeText(textoTemporada(root.__premios, periodo.replace("da temporada ", "temporada "))); toast("Texto copiado! Cole no WhatsApp.", "ok"); }
    catch(err){ toast("Não foi possível copiar automaticamente.", "err"); }
  });
  $("#pm-destaque", root)?.addEventListener("click", () => abrirImagemDestaque(root.__ranking, mesSel));
}
