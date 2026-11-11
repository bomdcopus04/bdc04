import { $, $$, escapeHtml, fmt1, toast, reRenderKeepingFocus } from "../utils.js";
import { mediaNotaAtleta, notasPorPosicao, jogosRealizados, ehJogador } from "../stats.js";
import { filtrarPorPeriodo, anosDisponiveis, MESES } from "../filters.js";

// Cada formação lista as linhas do campo (do ataque para o goleiro) e, para
// cada linha, as vagas da esquerda para a direita. Cada vaga diz quais posições
// jogadas podem ocupá-la: laterais nas pontas da defesa, zagueiros no centro,
// etc. Linhas com `ordenar` misturam volantes e meias; depois de escolhidos,
// os meias vão para as pontas e os volantes para o centro.
const ATA = ["Atacante"], MEIO = ["Volante", "Meia"], ZAG = ["Zagueiro"], LAT = ["Lateral"], GOL = ["Goleiro"], SEG = ["Meia", "Atacante"];
const FORMATIONS = {
  "4-3-3": [
    { label: "Ataque", slots: [ATA, ATA, ATA] },
    { label: "Meio-campo", slots: [MEIO, MEIO, MEIO], ordenar: true },
    { label: "Defesa", slots: [LAT, ZAG, ZAG, LAT] },
    { label: "Goleiro", slots: [GOL] },
  ],
  "4-4-2": [
    { label: "Ataque", slots: [ATA, ATA] },
    { label: "Meio-campo", slots: [MEIO, MEIO, MEIO, MEIO], ordenar: true },
    { label: "Defesa", slots: [LAT, ZAG, ZAG, LAT] },
    { label: "Goleiro", slots: [GOL] },
  ],
  "3-5-2": [
    { label: "Ataque", slots: [ATA, ATA] },
    { label: "Meio-campo", slots: [MEIO, MEIO, MEIO, MEIO, MEIO], ordenar: true },
    { label: "Defesa", slots: [ZAG, ZAG, ZAG] },
    { label: "Goleiro", slots: [GOL] },
  ],
  "4-3-2-1": [
    { label: "Ataque", slots: [ATA] },
    { label: "Segunda linha", slots: [SEG, SEG] },
    { label: "Meio-campo", slots: [MEIO, MEIO, MEIO], ordenar: true },
    { label: "Defesa", slots: [LAT, ZAG, ZAG, LAT] },
    { label: "Goleiro", slots: [GOL] },
  ],
  "3-4-3": [
    { label: "Ataque", slots: [ATA, ATA, ATA] },
    { label: "Meio-campo", slots: [MEIO, MEIO, MEIO, MEIO], ordenar: true },
    { label: "Defesa", slots: [ZAG, ZAG, ZAG] },
    { label: "Goleiro", slots: [GOL] },
  ],
};

// Abreviações usadas no campo (mais legíveis no espaço apertado dos "dots" de jogador).
export const POSICAO_ABREV = {
  "Goleiro": "GOL", "Zagueiro": "ZAG", "Lateral": "LAT",
  "Volante": "VOL", "Meia": "MEI", "Atacante": "ATA",
};
export const abrevPosicao = (pos) => POSICAO_ABREV[pos] || pos;

let formacaoAtual = "4-3-3";
let filtroAno = "";
let filtroMes = "";
const excluidos = new Set();

// Arranjo manual dos jogadores em campo: um array com 1 posição por vaga do
// campo (mesma ordem/linhas da formação), guardando o id do atleta (ou null
// pra vaga em aberto). Começa como null — nesse caso é preenchido com a
// sugestão automática. Depois que o usuário troca dois jogadores de lugar,
// esse arranjo passa a mandar na exibição, até a formação/filtro/seleção
// mudar (aí é reiniciado) ou o usuário pedir pra restaurar a sugestão.
let ordem = null;
let selecionadoIdx = null;

function resetArranjoManual(){
  ordem = null;
  selecionadoIdx = null;
}

// Acha a melhor posição/nota de um atleta dentro do "pool" de posições de
// uma linha específica — usado tanto na sugestão automática quanto pra
// recalcular o rótulo de um jogador que foi movido manualmente pra outra linha.
function melhorParaLinha(atletaId, linha, notasPos, atletasConsiderados, jogosFiltrados){
  const porPosicao = notasPos[atletaId];
  let best = null;
  if (porPosicao){
    linha.positions.forEach(pos => {
      const stat = porPosicao[pos];
      if (stat && (!best || stat.media > best.media)){
        best = { posicaoJogada: pos, media: stat.media, qtd: stat.qtd };
      }
    });
  }
  if (best) return best;
  // Sem estatística nessa linha (ex: jogador movido manualmente pra uma linha
  // em que nunca atuou) — cai pra média geral do atleta, com a posição de cadastro.
  const atleta = atletasConsiderados.find(a => a.id === atletaId);
  const overall = mediaNotaAtleta(atletaId, jogosFiltrados);
  return { posicaoJogada: atleta?.posicao || "—", media: overall.media, qtd: overall.qtd };
}

// Gera uma imagem (PNG) do campo com a escalação ideal e compartilha (Web
// Share API, quando disponível) ou baixa o arquivo. Renderiza numa cópia
// fora da tela, forçando o layout "desktop" (windowWidth maior) pra imagem
// sair sempre nítida e legível, mesmo se o usuário estiver no celular.
async function compartilharImagemEscalacao(linhasHtml, formacao){
  if (typeof html2canvas !== "function"){
    toast("Não foi possível gerar a imagem (recurso indisponível).", "err");
    return;
  }
  const card = document.createElement("div");
  card.style.cssText = "position:fixed; left:-9999px; top:0; width:520px; background:#fff; padding:22px; font-family:'Inter',system-ui,sans-serif;";
  card.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <img src="assets/logo-bomdcopus.png" crossorigin="anonymous" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
      <div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:.03em; color:#141414; line-height:1;">BOM D' COPUS</div>
        <div style="font-size:11px; color:#5B6470; margin-top:2px;">Escalação ideal — formação ${escapeHtml(formacao)}</div>
      </div>
    </div>
    <div class="pitch-board" style="min-height:auto;">${linhasHtml}</div>
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
      const file = new File([blob], `escalacao-ideal-${formacao}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        try{
          await navigator.share({ files: [file], title: "Escalação ideal", text: `Escalação ideal — Bom D' Copus (${formacao})` });
          return;
        }catch(err){
          if (err?.name === "AbortError") return; // usuário cancelou o compartilhamento
          console.error(err);
        }
      }
      // Sem suporte a compartilhar arquivos (ou falhou) — baixa a imagem direto.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `escalacao-ideal-${formacao}.png`;
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

export function renderEscalacaoIdeal(root, state){
  const realizados = jogosRealizados(state.jogos);
  const anos = anosDisponiveis(realizados);
  const jogosFiltrados = filtrarPorPeriodo(realizados, { ano: filtroAno, mes: filtroMes });

  const atletasElenco = state.atletas.filter(a => a.ativo !== false && ehJogador(a));
  const atletasConsiderados = atletasElenco.filter(a => !excluidos.has(a.id));

  const notasPos = notasPorPosicao(atletasConsiderados, jogosFiltrados);
  const linhas = FORMATIONS[formacaoAtual] || FORMATIONS["4-3-3"];

  // Lista plana de vagas, na ordem do campo (linha a linha, esquerda p/ direita).
  const vagas = [];
  linhas.forEach((linha, li) => linha.slots.forEach(pos => vagas.push({ linhaIdx: li, pos })));
  const geral = {};
  atletasConsiderados.forEach(a => { geral[a.id] = mediaNotaAtleta(a.id, jogosFiltrados).media; });
  const porGeral = (a, b) => {
    const ma = geral[a.id], mb = geral[b.id];
    if (ma !== null && mb !== null) return mb - ma;
    if (ma !== null) return -1;
    if (mb !== null) return 1;
    return (a.numero ?? 999) - (b.numero ?? 999) || a.nome.localeCompare(b.nome);
  };

  const atribuido = new Array(vagas.length).fill(null); // id do atleta por vaga
  const usados = new Set();

  // 1ª regra: nota na posição em que o jogador foi escalado nos jogos. Todos
  // os pares (vaga, jogador) com nota nessa posição, do melhor para o pior.
  const pares = [];
  vagas.forEach((v, vi) => atletasConsiderados.forEach(a => {
    const porPosicao = notasPos[a.id];
    if (!porPosicao) return;
    let melhor = null;
    v.pos.forEach(p => { const st = porPosicao[p]; if (st && (!melhor || st.media > melhor)) melhor = st.media; });
    if (melhor !== null) pares.push({ vi, id: a.id, media: melhor });
  }));
  pares.sort((x, y) => y.media - x.media);
  pares.forEach(p => {
    if (atribuido[p.vi] || usados.has(p.id)) return;
    atribuido[p.vi] = p.id; usados.add(p.id);
  });

  // 2ª regra: vagas que sobraram vão para quem tem aquela posição no cadastro.
  vagas.forEach((v, vi) => {
    if (atribuido[vi]) return;
    const cand = atletasConsiderados.filter(a => !usados.has(a.id) && v.pos.includes(a.posicao)).sort(porGeral)[0];
    if (cand){ atribuido[vi] = cand.id; usados.add(cand.id); }
  });

  // 3ª regra: ainda sobrou vaga? Entra quem restou (fora de posição), pelo
  // melhor desempenho geral. Só fica "Vaga em aberto" se houver menos de 11 jogadores.
  const sobrando = atletasConsiderados.filter(a => !usados.has(a.id)).sort(porGeral);
  vagas.forEach((v, vi) => {
    if (atribuido[vi] || sobrando.length === 0) return;
    const a = sobrando.shift();
    atribuido[vi] = a.id; usados.add(a.id);
  });

  // Linhas de meio-campo: meias nas pontas, volantes no centro.
  let inicio = 0;
  linhas.forEach(linha => {
    const n = linha.slots.length;
    if (linha.ordenar){
      const ids = atribuido.slice(inicio, inicio + n);
      const rotulo = (id) => id ? melhorParaLinha(id, { positions: linha.slots[0] }, notasPos, atletasConsiderados, jogosFiltrados).posicaoJogada : "";
      const meias = ids.filter(id => rotulo(id) === "Meia");
      const outros = ids.filter(id => id && rotulo(id) !== "Meia");
      const vazios = ids.filter(id => !id);
      let novo;
      if (meias.length >= 2) novo = [meias[0], ...outros, ...meias.slice(2), ...vazios, meias[1]];
      else novo = [...meias, ...outros, ...vazios];
      novo.forEach((id, i) => { atribuido[inicio + i] = id; });
    }
    inicio += n;
  });

  const temDados = Object.keys(notasPos).length > 0;

  // O arranjo manual (ordem) guarda 1 entrada por vaga do campo — se ainda
  // não existe (primeira vez, ou formação/filtro/seleção acabou de mudar),
  // começa igual à sugestão automática calculada acima.
  if (!ordem) ordem = [...atribuido];
  const linhasHtml = (() => {
    let cursor = 0;
    return linhas.map(linha => {
      const cards = [];
      for (let i = 0; i < linha.slots.length; i++){
        const slotIdx = cursor + i;
        const atletaId = ordem[slotIdx];
        const selecionada = selecionadoIdx === slotIdx;
        if (atletaId){
          const atleta = atletasConsiderados.find(a => a.id === atletaId) || atletasElenco.find(a => a.id === atletaId);
          const info = melhorParaLinha(atletaId, { positions: linha.slots[i] }, notasPos, atletasConsiderados, jogosFiltrados);
          cards.push(`
            <div class="pitch-player${selecionada ? " selecionado" : ""}" data-slot-idx="${slotIdx}" title="Toque pra trocar de posição">
              <div class="dot">${atleta?.numero ?? "•"}</div>
              <div class="nm">${escapeHtml(atleta?.nome || "?")} <span style="opacity:.65; font-weight:400;">(${escapeHtml(abrevPosicao(info.posicaoJogada))})</span></div>
              <div class="nota">${fmt1(info.media)}</div>
            </div>`);
        } else {
          cards.push(`
            <div class="pitch-player${selecionada ? " selecionado" : ""}" data-slot-idx="${slotIdx}" title="Toque pra trocar de posição">
              <div class="dot" style="background:transparent; border-style:dashed; color:rgba(255,255,255,.6);">?</div>
              <div class="nm" style="color:rgba(255,255,255,.5);">Vaga em aberto</div>
            </div>`);
        }
      }
      cursor += linha.slots.length;
      return `<div class="pitch-line-players">${cards.join("")}</div>`;
    }).join("");
  })();

  // Tabela geral: nota média por atleta (independente de posição) + a posição
  // em que ele mais atuou, considerando só os jogadores/período selecionados.
  const rankingCompleto = atletasConsiderados
    .map(a => {
      const overall = mediaNotaAtleta(a.id, jogosFiltrados);
      const porPosicao = notasPos[a.id];
      let posicaoMaisJogada = null;
      if (porPosicao){
        posicaoMaisJogada = Object.entries(porPosicao)
          .sort((x, y) => y[1].qtd - x[1].qtd || y[1].media - x[1].media)[0]?.[0] || null;
      }
      return { atleta: a, media: overall.media, qtd: overall.qtd, posicao: posicaoMaisJogada || a.posicao };
    })
    .filter(x => x.media !== null)
    .sort((a, b) => b.media - a.media);

  root.innerHTML = `
    <div class="topbar">
      <div><div class="eyebrow">Visão geral</div><h1>Escalação ideal</h1></div>
      <button class="btn-icon-share" id="btn-print-escalacao" type="button" title="Compartilhar imagem da escalação" aria-label="Compartilhar imagem da escalação" ${!temDados ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
    </div>
    <p style="font-size:13px; color:var(--ink-soft); margin:-14px 0 20px; max-width:640px;">
      Calculada pela nota média de cada atleta na posição em que ele foi escalado nas partidas (não a posição
      cadastrada). Cada vaga usa primeiro quem tem nota jogando naquela posição; se sobrar vaga, usa a posição
      cadastrada no elenco; e, por último, preenche com quem restar — só fica vaga em aberto se você
      selecionar menos de 11 jogadores. Laterais ficam nas pontas da defesa e zagueiros no centro.
    </p>

    <div class="form-grid" style="margin-bottom:20px; max-width:680px;">
      <div class="field">
        <label>Formação</label>
        <select id="sel-formacao">
          ${Object.keys(FORMATIONS).map(f => `<option value="${f}" ${f === formacaoAtual ? "selected" : ""}>${f}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Ano</label>
        <select id="filtro-ano">
          <option value="">Todos</option>
          ${anos.map(a => `<option value="${a}" ${a === filtroAno ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Mês</label>
        <select id="filtro-mes">
          <option value="">Todos</option>
          ${MESES.map((m, idx) => {
            const val = String(idx + 1).padStart(2, "0");
            return `<option value="${val}" ${val === filtroMes ? "selected" : ""}>${m}</option>`;
          }).join("")}
        </select>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:20px;">
      <div class="card-title">Jogadores considerados</div>
      <div class="card-sub">Desmarque quem você não quer considerar no cálculo da escalação ideal. Por padrão, todos entram.</div>
      <div class="player-grid">
        ${atletasElenco.map(a => `
          <label class="player-chip ${excluidos.has(a.id) ? "" : "selected"}">
            <input type="checkbox" data-excluir="${a.id}" ${excluidos.has(a.id) ? "" : "checked"}>
            <span class="player-num">${a.numero ?? "•"}</span>
            <span style="flex:1;">${escapeHtml(a.nome)}</span>
          </label>`).join("")}
      </div>
    </div>

    ${!temDados ? `
      <div class="empty-state">
        <h3>Sem dados para essa seleção</h3>
        <p>Ajuste o período ou os jogadores considerados, ou registre a escalação (com posição) e as avaliações pós-jogo.</p>
      </div>
    ` : `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <p style="font-size:12px; color:var(--ink-soft); margin:0;">
          ${selecionadoIdx !== null ? "Agora toque em outro jogador (ou vaga) pra trocar." : "Toque em dois jogadores (ou numa vaga) pra trocar as posições."}
        </p>
        <button class="btn btn-ghost btn-sm" id="btn-reset-arranjo" type="button">↺ Restaurar sugestão automática</button>
      </div>
      <div class="pitch-board">${linhasHtml}</div>

      <div class="card card-pad" style="margin-top:22px;">
        <div class="card-title">Notas médias — jogadores considerados</div>
        <div class="card-sub">"Posição" = a posição em que o atleta mais jogou nas partidas avaliadas, no período selecionado.</div>
        <div class="table-wrap" style="border:none; margin-top:10px;">
          <table>
            <thead><tr><th>Atleta</th><th>Posição</th><th>Nota média</th><th>Avaliações</th></tr></thead>
            <tbody>
              ${rankingCompleto.map(x => `
                <tr>
                  <td><strong>${escapeHtml(x.atleta.nome)}</strong></td>
                  <td>${escapeHtml(x.posicao || "—")}</td>
                  <td class="pill-num">${fmt1(x.media)}</td>
                  <td>${x.qtd}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `}
  `;

  // Trocar formação, período ou a seleção de jogadores invalida qualquer
  // arranjo manual feito até então — a sugestão automática é recalculada do zero.
  $("#sel-formacao", root)?.addEventListener("change", (e) => { formacaoAtual = e.target.value; resetArranjoManual(); reRenderKeepingFocus(root, () => renderEscalacaoIdeal(root, state)); });
  $("#filtro-ano", root)?.addEventListener("change", (e) => { filtroAno = e.target.value; resetArranjoManual(); reRenderKeepingFocus(root, () => renderEscalacaoIdeal(root, state)); });
  $("#filtro-mes", root)?.addEventListener("change", (e) => { filtroMes = e.target.value; resetArranjoManual(); reRenderKeepingFocus(root, () => renderEscalacaoIdeal(root, state)); });
  $$("[data-excluir]", root).forEach(chk => {
    chk.addEventListener("change", (e) => {
      const id = e.target.dataset.excluir;
      if (e.target.checked) excluidos.delete(id); else excluidos.add(id);
      resetArranjoManual();
      reRenderKeepingFocus(root, () => renderEscalacaoIdeal(root, state));
    });
  });

  $("#btn-reset-arranjo", root)?.addEventListener("click", () => {
    resetArranjoManual();
    reRenderKeepingFocus(root, () => renderEscalacaoIdeal(root, state));
    toast("Escalação restaurada para a sugestão automática.", "ok");
  });

  // Trocar jogadores de posição: toca num jogador (ou vaga) pra selecionar,
  // toca num segundo pra trocar os dois de lugar. Tocar de novo no mesmo cancela.
  $$(".pitch-player[data-slot-idx]", root).forEach(el => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.slotIdx);
      if (selecionadoIdx === null){
        selecionadoIdx = idx;
      } else if (selecionadoIdx === idx){
        selecionadoIdx = null;
      } else {
        [ordem[selecionadoIdx], ordem[idx]] = [ordem[idx], ordem[selecionadoIdx]];
        selecionadoIdx = null;
      }
      reRenderKeepingFocus(root, () => renderEscalacaoIdeal(root, state));
    });
  });

  $("#btn-print-escalacao", root)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    toast("Gerando imagem…", "ok");
    try{
      await compartilharImagemEscalacao(linhasHtml, formacaoAtual);
    } finally {
      btn.disabled = false;
    }
  });
}
