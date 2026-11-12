import { $, $$, escapeHtml, formatDate, formatDateLong, openModal, closeModal, fmt1, avg, reRenderKeepingFocus, toast } from "../utils.js";
import { resultadoJogo, desempateJogo, normalizeEscalacao, notasDoAtletaNoJogo, jogosRealizados, mediaNotaJogadoresNoJogo, GOL_CONTRA_ID } from "../stats.js";
import { getFiltroPeriodo, setFiltroPeriodo, filtrarPorPeriodo, anosDisponiveis, MESES } from "../filters.js";
import { abrevPosicao } from "./escalacao-ideal.js";

const ORDEM_POSICAO = { "Goleiro": 0, "Zagueiro": 1, "Lateral": 2, "Volante": 3, "Meia": 4, "Atacante": 5 };

let searchHistorico = "";
let ordemHistorico = "recentes"; // recentes | antigos | nota | saldo
let sumulaAberta = null; // evita reabrir a súmula a cada atualização dos dados

// Qualquer mudança de endereço libera a súmula para abrir de novo.
window.addEventListener("hashchange", () => { sumulaAberta = null; });

const RES_INFO = {
  vitoria: { letra: "V", cls: "res-v", nome: "Vitória" },
  empate: { letra: "E", cls: "res-e", nome: "Empate" },
  derrota: { letra: "D", cls: "res-d", nome: "Derrota" },
};

function plural(n, um, varios){ return `${n} ${n === 1 ? um : varios}`; }

export function renderHistorico(root, state, subId){
  const filtro = getFiltroPeriodo();
  const todosRealizados = [...jogosRealizados(state.jogos)].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const anos = anosDisponiveis(todosRealizados);
  const doPeriodo = filtrarPorPeriodo(todosRealizados, filtro);

  const nomeAdv = id => state.adversarios.find(a => a.id === id)?.nome || "?";
  const nomeCampo = id => state.campos.find(c => c.id === id)?.nome || "?";
  const nomeAtleta = id => id === GOL_CONTRA_ID ? "gol contra" : (state.atletas.find(a => a.id === id)?.nome || "?");

  const termo = searchHistorico.toLowerCase();
  const realizados = termo
    ? doPeriodo.filter(j => nomeAdv(j.adversarioId).toLowerCase().includes(termo) || nomeCampo(j.campoId).toLowerCase().includes(termo))
    : doPeriodo;

  const nota = j => mediaNotaJogadoresNoJogo(j).media;
  const saldo = j => (j.placarNos ?? 0) - (j.placarAdversario ?? 0);
  let lista = [...realizados];
  if (ordemHistorico === "antigos") lista.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  else if (ordemHistorico === "nota") lista.sort((a, b) => (nota(b) ?? -1) - (nota(a) ?? -1));
  else if (ordemHistorico === "saldo") lista.sort((a, b) => saldo(b) - saldo(a));
  const porData = ordemHistorico === "recentes" || ordemHistorico === "antigos";

  // ---- Manchete do período ----
  const cont = { vitoria: 0, empate: 0, derrota: 0 };
  let gp = 0, gc = 0;
  realizados.forEach(j => { const r = resultadoJogo(j); if (r) cont[r]++; gp += j.placarNos || 0; gc += j.placarAdversario || 0; });
  const goleada = [...realizados].filter(j => saldo(j) > 0).sort((a, b) => saldo(b) - saldo(a) || (b.data || "").localeCompare(a.data || ""))[0];
  const melhorNota = [...realizados].filter(j => nota(j) !== null).sort((a, b) => nota(b) - nota(a))[0];
  const periodoTxt = [filtro.mes ? MESES[Number(filtro.mes) - 1] : "", filtro.ano || ""].filter(Boolean).join(" de ") || "Toda a história";
  const manchete = realizados.length ? `
    <div class="manchete">
      <div class="manchete-eyebrow">${escapeHtml(periodoTxt)}</div>
      <div class="manchete-titulo">${plural(realizados.length, "partida", "partidas")}: ${plural(cont.vitoria, "vitória", "vitórias")}, ${plural(cont.empate, "empate", "empates")} e ${plural(cont.derrota, "derrota", "derrotas")}</div>
      <div class="manchete-sub">${plural(gp, "gol marcado", "gols marcados")} e ${gc} sofrido${gc === 1 ? "" : "s"}${goleada ? ` · maior vitória: ${goleada.placarNos} x ${goleada.placarAdversario} contra ${escapeHtml(nomeAdv(goleada.adversarioId))}` : ""}${melhorNota ? ` · melhor atuação coletiva: nota ${fmt1(nota(melhorNota))} contra ${escapeHtml(nomeAdv(melhorNota.adversarioId))}` : ""}</div>
    </div>` : "";

  // ---- Cartões ----
  const cartao = (j) => {
    const r = resultadoJogo(j);
    const info = RES_INFO[r];
    const gols = {};
    (j.golsAssistencias || []).forEach(e => { if (e.atletaGolId) gols[e.atletaGolId] = (gols[e.atletaGolId] || 0) + 1; });
    const golsTxt = Object.entries(gols).map(([id, n]) => `${nomeAtleta(id)}${n > 1 ? ` ${n}` : ""}`).join(", ");
    const n = nota(j);
    return `
      <div class="hist-card" data-id="${j.id}">
        <div class="hist-res ${info ? info.cls : ""}" title="${info ? info.nome : ""}">${info ? info.letra : "—"}</div>
        <div class="hist-info">
          <div class="hist-adv">${escapeHtml(nomeAdv(j.adversarioId))}</div>
          <div class="hist-meta">${formatDate(j.data)} · ${escapeHtml(nomeCampo(j.campoId))}${desempateJogo(j) ? ` · ${escapeHtml(desempateJogo(j).texto)}` : ""}</div>
          ${golsTxt ? `<div class="hist-gols">⚽ ${escapeHtml(golsTxt)}</div>` : ""}
        </div>
        <div class="hist-placar">
          <div class="hist-placar-val">${j.placarNos ?? "–"} x ${j.placarAdversario ?? "–"}</div>
          ${n !== null ? `<div class="hist-nota">nota ${fmt1(n)}</div>` : ""}
        </div>
      </div>`;
  };

  let corpo = "";
  if (!lista.length){
    corpo = `<div class="empty-state"><h3>Nenhuma partida</h3><p>${termo ? `Nada encontrado para "${escapeHtml(searchHistorico)}".` : "Nenhuma partida realizada para o período selecionado."}</p></div>`;
  } else if (porData){
    const grupos = [];
    lista.forEach(j => {
      const chave = (j.data || "").slice(0, 7);
      let g = grupos[grupos.length - 1];
      if (!g || g.chave !== chave){ g = { chave, jogos: [] }; grupos.push(g); }
      g.jogos.push(j);
    });
    corpo = grupos.map(g => {
      const c = { vitoria: 0, empate: 0, derrota: 0 };
      g.jogos.forEach(j => { const r = resultadoJogo(j); if (r) c[r]++; });
      const [a, m] = g.chave.split("-").map(Number);
      return `
        <div class="hist-mes">${MESES[m - 1]} de ${a} <span>${plural(g.jogos.length, "jogo", "jogos")} · ${c.vitoria}V ${c.empate}E ${c.derrota}D</span></div>
        ${g.jogos.map(cartao).join("")}`;
    }).join("");
  } else {
    corpo = lista.map(cartao).join("");
  }

  root.innerHTML = `
    <div class="topbar">
      <div><div class="eyebrow">Visão geral</div><h1>Histórico</h1></div>
    </div>

    ${manchete}

    <div class="rank-filtros">
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
      <div class="field">
        <label>Ordenar por</label>
        <select id="ordem-hist">
          <option value="recentes" ${ordemHistorico === "recentes" ? "selected" : ""}>Mais recentes</option>
          <option value="antigos" ${ordemHistorico === "antigos" ? "selected" : ""}>Mais antigos</option>
          <option value="nota" ${ordemHistorico === "nota" ? "selected" : ""}>Melhor nota da partida</option>
          <option value="saldo" ${ordemHistorico === "saldo" ? "selected" : ""}>Maior saldo de gols</option>
        </select>
      </div>
      <div class="field">
        <label>Buscar por adversário/campo</label>
        <input type="text" id="input-busca" placeholder="Digite pra filtrar…" value="${escapeHtml(searchHistorico)}">
      </div>
    </div>

    ${corpo}
  `;

  $("#input-busca", root)?.addEventListener("input", (e) => {
    searchHistorico = e.target.value;
    reRenderKeepingFocus(root, () => renderHistorico(root, state));
  });
  $("#ordem-hist", root)?.addEventListener("change", (e) => { ordemHistorico = e.target.value; renderHistorico(root, state); });

  $$(".hist-card[data-id]", root).forEach(el => {
    el.addEventListener("click", () => {
      const jogo = state.jogos.find(j => j.id === el.dataset.id);
      if (jogo) openSumulaModal(jogo, state);
    });
  });

  $("#filtro-ano", root)?.addEventListener("change", (e) => { setFiltroPeriodo({ ano: e.target.value }); reRenderKeepingFocus(root, () => renderHistorico(root, state)); });
  $("#filtro-mes", root)?.addEventListener("change", (e) => { setFiltroPeriodo({ mes: e.target.value }); reRenderKeepingFocus(root, () => renderHistorico(root, state)); });

  // Link direto para a súmula: #historico/<id do jogo>
  if (subId && sumulaAberta !== subId){
    const jogo = state.jogos.find(j => j.id === subId && j.status === "realizado");
    sumulaAberta = subId;
    if (jogo) openSumulaModal(jogo, state);
  }
}

// Ordena entradas de escalação por posição (GOL, ZAG, LAT, VOL, MEI, ATA) —
// quem não tem posição informada (jogos antigos) fica no final, na ordem original.
function ordenarEntriesPorPosicao(entries){
  return [...entries].sort((a, b) => {
    const oa = a.posicao in ORDEM_POSICAO ? ORDEM_POSICAO[a.posicao] : 99;
    const ob = b.posicao in ORDEM_POSICAO ? ORDEM_POSICAO[b.posicao] : 99;
    return oa - ob;
  });
}

// Gera uma imagem (PNG) da súmula (placar, gols/assistências e as duas
// escalações com a nota de cada jogador) e compartilha (Web Share API) ou
// baixa o arquivo — mesmo padrão usado no Ranking e na Escalação ideal.
async function compartilharImagemSumula(jogo, adv, campo, eventos, entriesInicial, entriesFinal, mediaPorAtleta, nome){
  if (typeof html2canvas !== "function"){
    toast("Não foi possível gerar a imagem (recurso indisponível).", "err");
    return;
  }
  const r = resultadoJogo(jogo);
  const resultadoLabel = { vitoria: "Vitória", empate: "Empate", derrota: "Derrota" }[r] || "";

  const eventosImgHtml = eventos.length === 0
    ? `<div style="color:#8A8F98; font-size:12px;">Nenhum gol registrado.</div>`
    : eventos.map(e => {
        const meta = [e.tipoGol, e.tempo].filter(Boolean).join(" · ");
        return `
      <div style="display:flex; gap:8px; padding:5px 0; border-bottom:1px solid #EDEDED; font-size:12.5px; color:#222;">
        <span style="font-family:monospace; color:#B8860B; font-weight:700; width:28px; flex-shrink:0;">${e.minuto ?? "–"}'</span>
        <span>⚽ ${nome(e.atletaGolId)}${e.atletaAssistId ? ` <span style="color:#8A8F98;">(assist. ${nome(e.atletaAssistId)})</span>` : ""}${meta ? ` <span style="color:#A9AEB5; font-size:10.5px;">— ${meta}</span>` : ""}</span>
      </div>`;
      }).join("");

  const listaImgHtml = (entries) => {
    if (!entries.length) return `<div style="color:#8A8F98; font-size:12px;">Não informada.</div>`;
    return entries.map(e => {
      const media = mediaPorAtleta[e.atletaId];
      return `
      <div style="display:flex; align-items:center; gap:6px; padding:4px 0; border-bottom:1px solid #EDEDED; font-size:12px; color:#222;">
        <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${nome(e.atletaId)}</span>
        ${e.posicao ? `<span style="color:#8A8F98; font-size:10px; flex-shrink:0;">${escapeHtml(abrevPosicao(e.posicao))}</span>` : ""}
        <span style="font-family:monospace; font-weight:700; color:#B8860B; min-width:26px; text-align:right; flex-shrink:0;">${media != null ? media.toFixed(1) : "—"}</span>
      </div>`;
    }).join("");
  };

  const card = document.createElement("div");
  card.style.cssText = "position:fixed; left:-9999px; top:0; width:560px; background:#fff; padding:22px; font-family:'Inter',system-ui,sans-serif;";
  card.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <img src="assets/logo-bomdcopus.png" crossorigin="anonymous" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
      <div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:.03em; color:#141414; line-height:1;">BOM D' COPUS</div>
        <div style="font-size:11px; color:#5B6470; margin-top:2px;">Súmula — ${formatDateLong(jogo.data)}</div>
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; background:#141414; border-radius:10px; padding:16px 18px; margin-bottom:10px;">
      <div style="text-align:center; flex:1;">
        <div style="font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:rgba(255,255,255,.6); font-weight:700; margin-bottom:6px;">Bom D' Copus</div>
        <div style="font-family:monospace; font-size:32px; font-weight:700; color:#E4B62B;">${jogo.placarNos ?? "–"}</div>
      </div>
      <div style="color:rgba(255,255,255,.5); font-size:13px; padding:0 10px;">VS</div>
      <div style="text-align:center; flex:1;">
        <div style="font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:rgba(255,255,255,.6); font-weight:700; margin-bottom:6px;">${escapeHtml(adv?.nome || "?")}</div>
        <div style="font-family:monospace; font-size:32px; font-weight:700; color:#E4B62B;">${jogo.placarAdversario ?? "–"}</div>
      </div>
    </div>
    <div style="font-size:11px; color:#5B6470; margin-bottom:16px;">📍 ${escapeHtml(campo?.nome || "—")}${resultadoLabel ? ` · ${resultadoLabel}` : ""}${desempateJogo(jogo) ? ` · ${escapeHtml(desempateJogo(jogo).texto)}` : ""}</div>

    <div style="font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#8A8F98; font-weight:700; margin-bottom:8px;">Gols e assistências</div>
    ${eventosImgHtml}

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:18px;">
      <div>
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#8A8F98; font-weight:700; margin-bottom:8px;">Escalação inicial</div>
        ${listaImgHtml(entriesInicial)}
      </div>
      <div>
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#8A8F98; font-weight:700; margin-bottom:8px;">Escalação final</div>
        ${listaImgHtml(entriesFinal)}
      </div>
    </div>
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
      const file = new File([blob], `sumula-${jogo.data || "jogo"}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        try{
          await navigator.share({ files: [file], title: "Súmula", text: `Súmula — Bom D' Copus ${jogo.placarNos ?? "–"} x ${jogo.placarAdversario ?? "–"} ${adv?.nome || "?"}` });
          return;
        }catch(err){
          if (err?.name === "AbortError") return; // usuário cancelou o compartilhamento
          console.error(err);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sumula-${jogo.data || "jogo"}.png`;
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

function openSumulaModal(jogo, state){
  const adv = state.adversarios.find(a => a.id === jogo.adversarioId);
  const campo = state.campos.find(c => c.id === jogo.campoId);
  const nome = id => id === GOL_CONTRA_ID ? "Gol contra (adversário)" : escapeHtml(state.atletas.find(a => a.id === id)?.nome || "?");
  const eventos = jogo.golsAssistencias || [];

  const eventosHtml = eventos.length === 0
    ? `<p style="color:var(--ink-faint); font-size:13px;">Nenhum gol registrado.</p>`
    : eventos.map(e => {
        const meta = [e.tipoGol, e.tempo].filter(Boolean).map(escapeHtml).join(" · ");
        return `
      <div class="event-row">
        <span class="event-min">${e.minuto ?? "–"}'</span>
        <span>⚽ ${nome(e.atletaGolId)}${e.atletaAssistId ? ` <span style="color:var(--ink-soft);">(assist. ${nome(e.atletaAssistId)})</span>` : ""}${meta ? ` <span style="color:var(--ink-faint); font-size:11px;">— ${meta}</span>` : ""}</span>
      </div>`;
      }).join("");

  const entriesInicial = ordenarEntriesPorPosicao(normalizeEscalacao(jogo.escalacaoInicial));
  const entriesFinal = ordenarEntriesPorPosicao(normalizeEscalacao(jogo.escalacaoFinal));

  // Nota média de cada atleta avaliado nessa partida — usada tanto na lista
  // "Nota média dos jogadores" quanto ao lado de cada nome nas duas escalações
  // (repete a nota em ambas quando o jogador aparece nas duas listas).
  const mediaPorAtleta = {};
  const qtdPorAtleta = {};
  Object.keys(jogo.avaliacoesJogadores || {}).forEach(id => {
    const notas = notasDoAtletaNoJogo(jogo, id);
    mediaPorAtleta[id] = avg(notas);
    qtdPorAtleta[id] = notas.length;
  });

  const listaEscalacaoHtml = (entries) => {
    if (!entries.length) return `<p style="color:var(--ink-faint); font-size:13px;">Não informada.</p>`;
    return entries.map(e => {
      const media = mediaPorAtleta[e.atletaId];
      return `
      <div class="event-row">
        <span class="ev-name">${nome(e.atletaId)}</span>
        ${e.posicao ? `<span class="ev-pos">${escapeHtml(abrevPosicao(e.posicao))}</span>` : ""}
        <span class="ev-nota">${media != null ? fmt1(media) : "—"}</span>
      </div>`;
    }).join("");
  };

  const notasAtletas = Object.keys(mediaPorAtleta)
    .map(id => ({ id, media: mediaPorAtleta[id], qtd: qtdPorAtleta[id] }))
    .filter(x => x.media !== null)
    .sort((a, b) => b.media - a.media);

  const notasHtml = notasAtletas.length === 0
    ? `<p style="color:var(--ink-faint); font-size:13px;">Sem avaliações registradas.</p>`
    : notasAtletas.map(x => `
        <div class="event-row"><span>${nome(x.id)}</span><span class="pill-num" style="margin-left:auto;">${fmt1(x.media)} <span style="color:var(--ink-faint); font-weight:400;">(${x.qtd})</span></span></div>`).join("");

  openModal(`
    <div class="modal-head">
      <h3>Súmula da partida</h3>
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="btn-icon-share" id="btn-share-sumula" type="button" title="Compartilhar imagem da súmula" aria-label="Compartilhar imagem da súmula">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
        <button class="modal-close" data-close>&times;</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="sumula" style="margin-bottom:20px;">
        <div class="sumula-side"><div class="team">Bom D' Copus</div><div class="score">${jogo.placarNos ?? "–"}</div></div>
        <div class="sumula-mid"><div class="vs">VS</div><div class="date">${formatDateLong(jogo.data)}</div></div>
        <div class="sumula-side"><div class="team">${escapeHtml(adv?.nome || "?")}</div><div class="score">${jogo.placarAdversario ?? "–"}</div></div>
        <div class="sumula-meta"><span>📍 ${escapeHtml(campo?.nome || "—")}</span>${desempateJogo(jogo) ? `<span>⚖️ ${escapeHtml(desempateJogo(jogo).texto)}</span>` : ""}<span>Realizado</span></div>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <h4 style="font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-soft); margin:0;">Gols e assistências</h4>
        <div style="display:flex; gap:14px; font-size:12px; color:var(--ink-soft);">
          <span>🏟️ Campo: <strong style="color:var(--ink);">${fmt1(jogo.avaliacaoCampo?.nota)}</strong></span>
          <span>🆚 Adversário: <strong style="color:var(--ink);">${fmt1(jogo.avaliacaoAdversario?.nota)}</strong></span>
        </div>
      </div>
      ${eventosHtml}

      <div class="sumula-list" style="margin-top:20px;">
        <div>
          <h4>Escalação inicial</h4>
          ${listaEscalacaoHtml(entriesInicial)}
        </div>
        <div>
          <h4>Escalação final</h4>
          ${listaEscalacaoHtml(entriesFinal)}
        </div>
      </div>

      <h4 style="font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-soft); margin:20px 0 8px;">Nota média dos jogadores</h4>
      ${notasHtml}
    </div>
  `, { wide: true });

  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  $("#btn-share-sumula")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    toast("Gerando imagem…", "ok");
    try{
      await compartilharImagemSumula(jogo, adv, campo, eventos, entriesInicial, entriesFinal, mediaPorAtleta, nome);
    } finally {
      btn.disabled = false;
    }
  });
}
