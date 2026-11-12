import { $, $$, escapeHtml, formatDate, formatDateLong, openModal, closeModal, fmt1, avg, sortRows, sortableTh, wireSortableHeaders, reRenderKeepingFocus, toast } from "../utils.js";
import { resultadoJogo, normalizeEscalacao, notasDoAtletaNoJogo, jogosRealizados, GOL_CONTRA_ID } from "../stats.js";
import { getFiltroPeriodo, setFiltroPeriodo, filtrarPorPeriodo, anosDisponiveis, MESES } from "../filters.js";
import { abrevPosicao } from "./escalacao-ideal.js";

const RESULTADO_BADGE = {
  vitoria: `<span class="badge badge-vit">Vitória</span>`,
  empate: `<span class="badge badge-pending">Empate</span>`,
  derrota: `<span class="badge badge-danger">Derrota</span>`,
};

const RESULTADO_ORDEM = { vitoria: 2, empate: 1, derrota: 0 };

// Ordem das posições no campo, usada pra ordenar a lista de escalação na
// súmula (GOL, ZAG, LAT, VOL, MEI, ATA) — posições fora dessa lista (ou não
// informadas) vão pro final.
const ORDEM_POSICAO = { "Goleiro": 0, "Zagueiro": 1, "Lateral": 2, "Volante": 3, "Meia": 4, "Atacante": 5 };

const sortState = { key: null, dir: "asc" };
let searchHistorico = "";

export function renderHistorico(root, state){
  const filtro = getFiltroPeriodo();
  const todosRealizados = [...jogosRealizados(state.jogos)].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const anos = anosDisponiveis(todosRealizados);
  const doPeriodo = filtrarPorPeriodo(todosRealizados, filtro);

  const nomeAdv = id => state.adversarios.find(a => a.id === id)?.nome || "?";
  const nomeCampo = id => state.campos.find(c => c.id === id)?.nome || "?";

  const termo = searchHistorico.toLowerCase();
  const realizados = termo
    ? doPeriodo.filter(j => nomeAdv(j.adversarioId).toLowerCase().includes(termo) || nomeCampo(j.campoId).toLowerCase().includes(termo))
    : doPeriodo;

  const sortFns = {
    data: j => j.data || "",
    adversario: j => nomeAdv(j.adversarioId).toLowerCase(),
    campo: j => nomeCampo(j.campoId).toLowerCase(),
    placar: j => (j.placarNos ?? 0) - (j.placarAdversario ?? 0),
    resultado: j => { const r = resultadoJogo(j); return r ? RESULTADO_ORDEM[r] : -1; },
  };
  const listaOrdenada = sortRows(realizados, sortState, sortFns);

  const rows = listaOrdenada.map(j => {
    const r = resultadoJogo(j);
    return `
      <tr class="clickable" data-id="${j.id}">
        <td>${formatDate(j.data)}</td>
        <td><strong>${escapeHtml(nomeAdv(j.adversarioId))}</strong></td>
        <td>${escapeHtml(nomeCampo(j.campoId))}</td>
        <td class="pill-num">${j.placarNos ?? "–"} x ${j.placarAdversario ?? "–"}</td>
        <td>${r ? RESULTADO_BADGE[r] : "—"}</td>
      </tr>`;
  }).join("");

  root.innerHTML = `
    <div class="topbar">
      <div><div class="eyebrow">Visão geral</div><h1>Histórico</h1></div>
    </div>

    <div class="form-grid" style="margin-bottom:20px; max-width:680px;">
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
        <label>Buscar por adversário/campo</label>
        <input type="text" id="input-busca" placeholder="Digite pra filtrar…" value="${escapeHtml(searchHistorico)}">
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortableTh("Data", "data", sortState)}
          ${sortableTh("Adversário", "adversario", sortState)}
          ${sortableTh("Campo", "campo", sortState)}
          ${sortableTh("Placar", "placar", sortState)}
          ${sortableTh("Resultado", "resultado", sortState)}
        </tr></thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="5">${termo ? `Nenhuma partida encontrada para "${escapeHtml(searchHistorico)}".` : "Nenhuma partida realizada para o período selecionado."}</td></tr>`}</tbody>
      </table>
    </div>
  `;

  wireSortableHeaders(root, sortState, () => renderHistorico(root, state));

  $("#input-busca", root)?.addEventListener("input", (e) => {
    searchHistorico = e.target.value;
    reRenderKeepingFocus(root, () => renderHistorico(root, state));
  });

  $$("tbody tr[data-id]", root).forEach(tr => {
    tr.addEventListener("click", () => {
      const jogo = listaOrdenada.find(j => j.id === tr.dataset.id);
      openSumulaModal(jogo, state);
    });
  });

  $("#filtro-ano", root)?.addEventListener("change", (e) => { setFiltroPeriodo({ ano: e.target.value }); reRenderKeepingFocus(root, () => renderHistorico(root, state)); });
  $("#filtro-mes", root)?.addEventListener("change", (e) => { setFiltroPeriodo({ mes: e.target.value }); reRenderKeepingFocus(root, () => renderHistorico(root, state)); });
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
    <div style="font-size:11px; color:#5B6470; margin-bottom:16px;">📍 ${escapeHtml(campo?.nome || "—")}${resultadoLabel ? ` · ${resultadoLabel}` : ""}</div>

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
        <div class="sumula-meta"><span>📍 ${escapeHtml(campo?.nome || "—")}</span><span>Realizado</span></div>
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
