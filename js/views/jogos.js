import { $, $$, escapeHtml, openModal, closeModal, toast, confirmAction, formatDate, formatDateLong, todayISO, fmt1, ratingWidgetHtml, wireRatingWidgets, reRenderKeepingFocus } from "../utils.js";
import { createDoc, saveDoc, removeDoc, updateJogoField } from "../db.js";
import { fieldHtml, collectFormData, POSICOES } from "./cadastros.js";
import { resultadoJogo, normalizeEscalacao, ehJogador, GOL_CONTRA_ID, TIPOS_GOL, TEMPOS_JOGO, jogadoresDaPartida } from "../stats.js";

import { linkPresenca } from "./presenca.js";

export const TIPOS_PARTIDA = ["Amistoso", "Festival", "Campeonato"];

let activeTab = "escalacao-inicial";
let lastJogoId = null;
let searchJogos = "";

// ============================================================================
// Formulário de jogo (criar / editar dados gerais)
// ============================================================================

function jogoFields(state){
  return [
    { key: "data", label: "Data", type: "date", required: true, default: todayISO() },
    { key: "status", label: "Status", type: "select", options: [{ value: "agendado", label: "Agendado" }, { value: "realizado", label: "Realizado" }], default: "agendado" },
    { key: "adversarioId", label: "Adversário", type: "select", required: true, placeholder: "Selecione",
      options: state.adversarios.map(a => ({ value: a.id, label: a.nome })) },
    { key: "campoId", label: "Campo", type: "select", required: true, placeholder: "Selecione",
      options: state.campos.map(c => ({ value: c.id, label: c.nome })) },
    { key: "tipoPartida", label: "Tipo de partida", type: "select", options: TIPOS_PARTIDA, placeholder: "Selecione" },
    { key: "placarNos", label: "Placar — Nós", type: "number", min: 0 },
    { key: "placarAdversario", label: "Placar — Adversário", type: "number", min: 0 },
    { key: "observacoes", label: "Observações", type: "textarea", span2: true },
  ];
}

function openJogoForm(state, item, onSaved, prefill){
  if (state.adversarios.length === 0 || state.campos.length === 0){
    toast("Cadastre ao menos 1 adversário e 1 campo antes de criar um jogo.", "err");
    return;
  }
  const fields = jogoFields(state);
  const isEdit = !!item;
  const valores = item || prefill || null;
  openModal(`
    <div class="modal-head">
      <h3>${isEdit ? "Editar jogo" : prefill ? "Duplicar jogo" : "Novo jogo"}</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <form id="jogo-form">
        <div class="form-grid">${fields.map(f => fieldHtml(f, valores)).join("")}</div>
        <div class="form-actions" style="justify-content:space-between;">
          ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-delete-jogo">Excluir jogo</button>` : `<span></span>`}
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>
    </div>
  `, { wide: true });

  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  $("#jogo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = collectFormData(fields, e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try{
      if (isEdit){
        await saveDoc("jogos", item.id, data);
        toast("Jogo atualizado.", "ok");
        closeModal();
      }else{
        const ref = await createDoc("jogos", {
          ...data,
          escalacaoInicial: [], escalacaoFinal: [], golsAssistencias: [], avaliacoesJogadores: {},
          avaliacaoCampo: null, avaliacaoAdversario: null,
        });
        toast("Jogo criado.", "ok");
        closeModal();
        if (onSaved) onSaved(ref.id);
      }
    }catch(err){
      console.error(err);
      toast("Erro ao salvar: " + err.message, "err");
      btn.disabled = false;
    }
  });

  if (isEdit){
    $("#btn-delete-jogo").addEventListener("click", async () => {
      if (!(await confirmAction("Excluir este jogo e todos os dados dele (escalação, gols, avaliações)? Essa ação não pode ser desfeita."))) return;
      try{
        await removeDoc("jogos", item.id);
        toast("Jogo excluído.", "ok");
        closeModal();
        location.hash = "#jogos";
      }catch(err){
        toast("Erro ao excluir: " + err.message, "err");
      }
    });
  }
}

// ============================================================================
// Lista de jogos
// ============================================================================

export function renderJogosList(root, state){
  const nomeAdv = id => state.adversarios.find(a => a.id === id)?.nome || "";
  const nomeCampo = id => state.campos.find(c => c.id === id)?.nome || "";

  const todos = [...state.jogos].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const termo = searchJogos.toLowerCase();
  const jogos = termo
    ? todos.filter(j =>
        nomeAdv(j.adversarioId).toLowerCase().includes(termo) ||
        nomeCampo(j.campoId).toLowerCase().includes(termo) ||
        (j.tipoPartida || "").toLowerCase().includes(termo))
    : todos;

  const rows = jogos.map(j => {
    const placar = j.status === "realizado" && j.placarNos !== null && j.placarNos !== undefined
      ? `<span class="pill-num">${j.placarNos} x ${j.placarAdversario ?? 0}</span>` : "—";
    const statusBadge = j.status === "realizado"
      ? `<span class="badge badge-ok">Realizado</span>`
      : `<span class="badge badge-pending">Agendado</span>`;
    return `
      <tr class="clickable" data-id="${j.id}">
        <td>${formatDate(j.data)}</td>
        <td><strong>${escapeHtml(nomeAdv(j.adversarioId) || "—")}</strong></td>
        <td>${escapeHtml(nomeCampo(j.campoId) || "—")}</td>
        <td>${escapeHtml(j.tipoPartida || "—")}</td>
        <td>${placar}</td>
        <td>${statusBadge}</td>
      </tr>`;
  }).join("");

  const emptyMsg = termo ? `Nenhum jogo encontrado para "${escapeHtml(searchJogos)}".` : "Nenhum jogo cadastrado ainda.";

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Cadastro</div>
        <h1>Partidas</h1>
      </div>
      <button class="btn btn-primary" id="btn-new-jogo">+ Novo jogo</button>
    </div>
    <div class="field" style="max-width:320px; margin-bottom:16px;">
      <label>Buscar por adversário, campo ou tipo</label>
      <input type="text" id="input-busca" placeholder="Digite pra filtrar…" value="${escapeHtml(searchJogos)}">
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Adversário</th><th>Campo</th><th>Tipo</th><th>Placar</th><th>Status</th></tr></thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="6">${emptyMsg}</td></tr>`}</tbody>
      </table>
    </div>
  `;

  $("#input-busca", root)?.addEventListener("input", (e) => {
    searchJogos = e.target.value;
    reRenderKeepingFocus(root, () => renderJogosList(root, state));
  });

  $("#btn-new-jogo").addEventListener("click", () => openJogoForm(state, null, (newId) => { location.hash = `#jogos/${newId}`; }));
  $$("tbody tr[data-id]", root).forEach(tr => {
    tr.addEventListener("click", () => { location.hash = `#jogos/${tr.dataset.id}`; });
  });
}

// ============================================================================
// Detalhe do jogo
// ============================================================================

export function renderJogoDetail(root, state, jogoId){
  if (jogoId !== lastJogoId){ activeTab = "escalacao-inicial"; lastJogoId = jogoId; }

  const jogo = state.jogos.find(j => j.id === jogoId);
  if (!jogo){
    root.innerHTML = `<div class="empty-state"><h3>Jogo não encontrado</h3><p>Ele pode ter sido excluído.</p>
      <button class="btn btn-primary" id="btn-back">Voltar para Partidas</button></div>`;
    $("#btn-back").addEventListener("click", () => location.hash = "#jogos");
    return;
  }
  const adv = state.adversarios.find(a => a.id === jogo.adversarioId);
  const campo = state.campos.find(c => c.id === jogo.campoId);
  const resultado = resultadoJogo(jogo);

  root.innerHTML = `
    <div class="topbar">
      <div>
        <a href="#jogos" style="font-size:12px; color:var(--pitch); font-weight:600; text-decoration:none;">&larr; Partidas</a>
        <h1 style="margin-top:4px;">Bom D' Copus vs ${escapeHtml(adv?.nome || "?")}</h1>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost" id="btn-presenca-link">Copiar link de presença</button>
        <button class="btn btn-ghost" id="btn-presenca">Ver presença</button>
        <button class="btn btn-ghost" id="btn-dup-jogo">Duplicar</button>
        <button class="btn btn-ghost" id="btn-edit-jogo">Editar dados</button>
      </div>
    </div>

    <div class="sumula">
      <div class="sumula-side"><div class="team">Bom D' Copus</div><div class="score">${jogo.placarNos ?? "–"}</div></div>
      <div class="sumula-mid"><div class="vs">VS</div><div class="date">${formatDateLong(jogo.data)}</div></div>
      <div class="sumula-side"><div class="team">${escapeHtml(adv?.nome || "?")}</div><div class="score">${jogo.placarAdversario ?? "–"}</div></div>
      <div class="sumula-meta">
        <span>📍 ${escapeHtml(campo?.nome || "Campo não definido")}</span>
        ${jogo.tipoPartida ? `<span>🏷️ ${escapeHtml(jogo.tipoPartida)}</span>` : ""}
        <span>${jogo.status === "realizado" ? (resultado ? { vitoria: "🏆 Vitória", empate: "➖ Empate", derrota: "❌ Derrota" }[resultado] : "Realizado") : "🗓️ Agendado"}</span>
      </div>
    </div>

    <div class="tabbar">
      <button class="tab-btn" data-tab="escalacao-inicial">Escalação inicial</button>
      <button class="tab-btn" data-tab="escalacao-final">Escalação final</button>
      <button class="tab-btn" data-tab="gols">Gols &amp; assistências</button>
      <button class="tab-btn" data-tab="avaliacoes">Campo &amp; adversário</button>
    </div>

    <div class="tab-panel" data-panel="escalacao-inicial">
      ${renderEscalacaoPanel(jogo, state.atletas, "escalacaoInicial")}
    </div>
    <div class="tab-panel" data-panel="escalacao-final">
      ${renderEscalacaoPanel(jogo, state.atletas, "escalacaoFinal")}
    </div>
    <div class="tab-panel" data-panel="gols">
      ${renderGolsPanel(jogo, state.atletas)}
    </div>
    <div class="tab-panel" data-panel="avaliacoes">
      ${renderAvaliacoesPanel(jogo)}
    </div>
  `;

  // tabs
  $$(".tab-btn", root).forEach(btn => btn.classList.toggle("active", btn.dataset.tab === activeTab));
  $$(".tab-panel", root).forEach(p => p.classList.toggle("active", p.dataset.panel === activeTab));
  $$(".tab-btn", root).forEach(btn => btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    $$(".tab-btn", root).forEach(b => b.classList.toggle("active", b === btn));
    $$(".tab-panel", root).forEach(p => p.classList.toggle("active", p.dataset.panel === btn.dataset.tab));
  }));

  $("#btn-edit-jogo").addEventListener("click", () => openJogoForm(state, jogo));
  $("#btn-presenca").addEventListener("click", () => { location.hash = `#presenca/${jogo.id}`; });
  $("#btn-presenca-link").addEventListener("click", async () => {
    try{ await navigator.clipboard.writeText(linkPresenca(jogo.id)); toast("Link de presença copiado.", "ok"); }
    catch(e){ toast("Não foi possível copiar.", "err"); }
  });
  // Duplicar: reaproveita adversário, campo, tipo e observações; o resto
  // (placar, escalação, gols, notas) começa vazio, como um jogo novo agendado.
  $("#btn-dup-jogo").addEventListener("click", () => openJogoForm(state, null, (newId) => { location.hash = `#jogos/${newId}`; }, {
    data: todayISO(), status: "agendado", adversarioId: jogo.adversarioId, campoId: jogo.campoId,
    tipoPartida: "Amistoso", observacoes: jogo.observacoes || "",
  }));

  wireEscalacaoPanel(root, jogo, "escalacaoInicial", "[data-panel='escalacao-inicial']");
  wireEscalacaoPanel(root, jogo, "escalacaoFinal", "[data-panel='escalacao-final']");
  wireGolsPanel(root, jogo, state.atletas);
  wireAvaliacoesPanel(root, jogo);
}

// ----------------------------------------------------------------------------
// Escalação (inicial / final)
// ----------------------------------------------------------------------------

function renderEscalacaoPanel(jogo, atletas, field){
  const escalacao = normalizeEscalacao(jogo[field]);
  const posicaoPorId = Object.fromEntries(escalacao.map(e => [e.atletaId, e.posicao]));
  const selecionados = new Set(escalacao.map(e => e.atletaId));
  // Mantém na lista qualquer atleta já escalado neste jogo, mesmo que hoje esteja marcado como inativo —
  // assim uma partida antiga não perde jogadores que saíram do elenco depois. Técnicos não entram
  // na escalação (não jogam em campo).
  const disponiveis = atletas.filter(a => ehJogador(a) && (a.ativo !== false || selecionados.has(a.id)));
  if (disponiveis.length === 0){
    return `<div class="empty-state"><p>Cadastre atletas ativos para montar a escalação.</p></div>`;
  }
  const posOptions = (selecionada) => POSICOES.map(p =>
    `<option value="${p}" ${p === selecionada ? "selected" : ""}>${p}</option>`).join("");

  return `
    <div class="card card-pad">
      <div class="card-title">${field === "escalacaoInicial" ? "Escalação inicial" : "Escalação final"}</div>
      <div class="card-sub">Selecione os atletas que jogaram e a posição em que atuaram nesta partida.</div>
      <div class="player-grid player-grid-escalacao">
        ${disponiveis.map(a => {
          const checked = selecionados.has(a.id);
          const posicaoAtual = posicaoPorId[a.id] || a.posicao || "";
          return `
          <label class="player-chip ${checked ? "selected" : ""}" data-chip="${a.id}">
            <input type="checkbox" value="${a.id}" ${checked ? "checked" : ""}>
            <span class="player-num">${a.numero ?? "–"}</span>
            <span style="flex:1;">${escapeHtml(a.nome)}</span>
            <select class="chip-posicao" ${checked ? "" : "disabled"}>
              <option value="">Posição…</option>
              ${posOptions(posicaoAtual)}
            </select>
          </label>`;
        }).join("")}
      </div>
      <div class="form-actions"><button class="btn btn-primary" data-save-escalacao="${field}">Salvar</button></div>
    </div>
  `;
}

function wireEscalacaoPanel(root, jogo, field, panelSel){
  const panel = $(panelSel, root);
  if (!panel) return;
  $$(".player-chip", panel).forEach(chip => {
    const cb = chip.querySelector('input[type="checkbox"]');
    const sel = chip.querySelector("select");
    const sync = () => {
      chip.classList.toggle("selected", cb.checked);
      if (sel) sel.disabled = !cb.checked;
    };
    chip.addEventListener("click", (e) => {
      if (e.target === sel || e.target.tagName === "OPTION") return; // deixa o select funcionar normalmente
      if (e.target === cb) return; // clique direto no checkbox já alterna nativamente
      // Clique em qualquer outra parte do chip (nome, número): evita que o navegador
      // dispare também o encaminhamento nativo do <label> para o checkbox (o que
      // duplicaria a alternância e cancelaria a seleção), e faz o toggle manual.
      e.preventDefault();
      cb.checked = !cb.checked;
      sync();
    });
    cb.addEventListener("change", sync);
  });
  const btn = $(`[data-save-escalacao="${field}"]`, panel);
  btn?.addEventListener("click", async () => {
    const entries = $$(".player-chip", panel)
      .map(chip => {
        const cb = chip.querySelector('input[type="checkbox"]');
        if (!cb.checked) return null;
        const sel = chip.querySelector("select");
        return { atletaId: cb.value, posicao: sel?.value || null };
      })
      .filter(Boolean);
    btn.disabled = true;
    try{
      await updateJogoField(jogo.id, { [field]: entries });
      toast("Escalação salva.", "ok");
    }catch(err){
      toast("Erro ao salvar: " + err.message, "err");
    }
    btn.disabled = false;
  });
}

// ----------------------------------------------------------------------------
// Gols & assistências
// ----------------------------------------------------------------------------

function renderGolsPanel(jogo, atletas){
  const eventos = jogo.golsAssistencias || [];
  const nome = id => id === GOL_CONTRA_ID ? "Gol contra (adversário)" : escapeHtml(atletas.find(a => a.id === id)?.nome || "?");
  const rows = eventos.map((e, idx) => {
    const meta = [e.tipoGol, e.tempo].filter(Boolean).map(escapeHtml).join(" · ");
    return `
    <div class="event-row">
      <span class="event-min">${e.minuto ?? "–"}'</span>
      <span>⚽ ${nome(e.atletaGolId)}${e.atletaAssistId ? ` <span style="color:var(--ink-soft);">(assist. ${nome(e.atletaAssistId)})</span>` : ""}${meta ? ` <span style="color:var(--ink-faint); font-size:11px;">— ${meta}</span>` : ""}</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto;" data-remove-evt="${idx}">Remover</button>
    </div>`;
  }).join("");

  // Só oferece os jogadores escalados nessa partida (inicial ou final) — evita
  // rolar a lista inteira do elenco pra achar quem jogou. Se a escalação ainda
  // não foi preenchida, cai pro elenco completo pra não travar o cadastro do gol.
  const escalados = jogadoresDaPartida(jogo, atletas);
  const poolJogadores = escalados.length > 0 ? escalados : atletas.filter(ehJogador);
  const options = poolJogadores.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`).join("");
  const tipoGolOptions = TIPOS_GOL.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  const tempoOptions = TEMPOS_JOGO.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  return `
    <div class="card card-pad">
      <div class="card-title">Gols e assistências</div>
      <div class="card-sub">${eventos.length} evento(s) registrado(s)</div>
      ${rows || `<p style="color:var(--ink-faint); font-size:13px;">Nenhum gol registrado ainda.</p>`}
      <div class="form-grid" style="margin-top:18px; padding-top:16px; border-top:1px solid var(--line);">
        <div class="field"><label>Gol de</label><select id="evt-gol"><option value="">Selecione</option><option value="${GOL_CONTRA_ID}">⚽ Gol contra (adversário)</option>${options}</select></div>
        <div class="field"><label>Assistência de (opcional)</label><select id="evt-assist"><option value="">Sem assistência</option>${options}</select></div>
        <div class="field"><label>Minuto</label><input type="number" id="evt-min" min="0" max="150" placeholder="ex: 34"></div>
        <div class="field"><label>Como foi o gol (opcional)</label><select id="evt-tipo"><option value="">Selecione</option>${tipoGolOptions}</select></div>
        <div class="field"><label>Qual tempo (opcional)</label><select id="evt-tempo"><option value="">Selecione</option>${tempoOptions}</select></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-add-evt">+ Adicionar evento</button></div>
    </div>
  `;
}

function wireGolsPanel(root, jogo, atletas){
  const panel = $("[data-panel='gols']", root);
  if (!panel) return;
  $$("[data-remove-evt]", panel).forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.removeEvt);
      const eventos = [...(jogo.golsAssistencias || [])];
      eventos.splice(idx, 1);
      try{
        await updateJogoField(jogo.id, { golsAssistencias: eventos });
        toast("Evento removido.", "ok");
      }catch(err){ toast("Erro: " + err.message, "err"); }
    });
  });
  // Gol contra não tem assistência do próprio time — desabilita o campo pra evitar dado inconsistente.
  const golSel = $("#evt-gol", panel);
  const assistSel = $("#evt-assist", panel);
  golSel?.addEventListener("change", () => {
    const isContra = golSel.value === GOL_CONTRA_ID;
    if (assistSel){
      assistSel.disabled = isContra;
      if (isContra) assistSel.value = "";
    }
  });
  $("#btn-add-evt", panel)?.addEventListener("click", async () => {
    const golId = $("#evt-gol", panel).value;
    const assistId = $("#evt-assist", panel).value;
    const minuto = $("#evt-min", panel).value;
    const tipoGol = $("#evt-tipo", panel).value;
    const tempo = $("#evt-tempo", panel).value;
    if (!golId){ toast("Selecione quem fez o gol.", "err"); return; }
    if (assistId && assistId === golId){ toast("O autor do gol e da assistência não podem ser o mesmo atleta.", "err"); return; }
    if (golId === GOL_CONTRA_ID && assistId){ toast("Gol contra não tem assistência.", "err"); return; }
    const eventos = [...(jogo.golsAssistencias || []), {
      atletaGolId: golId, atletaAssistId: assistId || null, minuto: minuto ? Number(minuto) : null,
      tipoGol: tipoGol || null, tempo: tempo || null,
    }];
    try{
      await updateJogoField(jogo.id, { golsAssistencias: eventos });
      toast("Evento adicionado.", "ok");
    }catch(err){ toast("Erro: " + err.message, "err"); }
  });
}

// ----------------------------------------------------------------------------
// Avaliações (campo, adversário) — a avaliação dos jogadores agora fica numa
// página isolada (Avaliação), porque suporta vários votantes por partida.
// ----------------------------------------------------------------------------

function renderAvaliacoesPanel(jogo){
  return `
    <div class="card card-pad" style="margin-bottom:16px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <div style="flex:1; min-width:200px;">
        <div class="card-title">Avaliação dos jogadores</div>
        <div class="card-sub" style="margin-bottom:0;">Diretores e capitão avaliam os jogadores escalados nesta partida numa página própria, com voto individual de cada um.</div>
      </div>
      <a href="#avaliacao" class="btn btn-gold btn-sm">Avaliar jogadores →</a>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card-title">Avaliação do campo</div>
      <div class="card-sub">${escapeHtml("Como estava o campo nesta partida?")}</div>
      ${ratingWidgetHtml("campo", jogo.avaliacaoCampo?.nota)}
      <div class="field" style="margin-top:12px;"><label>Observações</label><textarea id="obs-campo" placeholder="Opcional">${escapeHtml(jogo.avaliacaoCampo?.obs || "")}</textarea></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-save-campo">Salvar avaliação do campo</button></div>
    </div>

    <div class="card card-pad">
      <div class="card-title">Avaliação do adversário</div>
      <div class="card-sub">Nível técnico / fair play do time adversário.</div>
      ${ratingWidgetHtml("adversario", jogo.avaliacaoAdversario?.nota)}
      <div class="field" style="margin-top:12px;"><label>Observações</label><textarea id="obs-adversario" placeholder="Opcional">${escapeHtml(jogo.avaliacaoAdversario?.obs || "")}</textarea></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-save-adversario">Salvar avaliação do adversário</button></div>
    </div>
  `;
}

function wireAvaliacoesPanel(root, jogo){
  const panel = $("[data-panel='avaliacoes']", root);
  if (!panel) return;
  wireRatingWidgets(panel);

  $("#btn-save-campo", panel)?.addEventListener("click", async (e) => {
    const hidden = $(`input[data-rating="campo"]`, panel);
    const nota = hidden?.value !== "" && hidden?.value != null ? Number(hidden.value) : null;
    const obs = $("#obs-campo", panel).value;
    e.target.disabled = true;
    try{
      await updateJogoField(jogo.id, { avaliacaoCampo: nota !== null ? { nota, obs } : null });
      toast("Avaliação do campo salva.", "ok");
    }catch(err){ toast("Erro: " + err.message, "err"); }
    e.target.disabled = false;
  });

  $("#btn-save-adversario", panel)?.addEventListener("click", async (e) => {
    const hidden = $(`input[data-rating="adversario"]`, panel);
    const nota = hidden?.value !== "" && hidden?.value != null ? Number(hidden.value) : null;
    const obs = $("#obs-adversario", panel).value;
    e.target.disabled = true;
    try{
      await updateJogoField(jogo.id, { avaliacaoAdversario: nota !== null ? { nota, obs } : null });
      toast("Avaliação do adversário salva.", "ok");
    }catch(err){ toast("Erro: " + err.message, "err"); }
    e.target.disabled = false;
  });
}
