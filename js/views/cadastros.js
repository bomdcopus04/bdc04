import { $, $$, escapeHtml, openModal, closeModal, toast, confirmAction, fmt1, sortRows, sortableTh, wireSortableHeaders, reRenderKeepingFocus } from "../utils.js";
import { createDoc, saveDoc, removeDoc, setPrivateDoc, getPrivateDoc } from "../db.js";
import { mediaNotaAtleta, mediaCampo, mediaAdversario, contagemJogosPorCampo, contagemJogosPorAdversario, POSICAO_TECNICO } from "../stats.js";

// ============================================================================
// Motor genérico de CRUD (usado por Atletas, Adversários e Campos)
// ============================================================================

export function fieldHtml(f, item){
  const val = item ? item[f.key] : (f.default ?? "");
  const req = f.required ? "required" : "";
  const spanCls = f.span2 ? "field span-2" : "field";

  if (f.type === "select"){
    const opts = f.options.map(o => {
      const ov = typeof o === "string" ? o : o.value;
      const ol = typeof o === "string" ? o : o.label;
      return `<option value="${escapeHtml(ov)}" ${val === ov ? "selected" : ""}>${escapeHtml(ol)}</option>`;
    }).join("");
    return `<div class="${spanCls}"><label>${f.label}${f.required ? " *" : ""}</label>
      <select name="${f.key}" ${req}>${f.placeholder ? `<option value="">${escapeHtml(f.placeholder)}</option>` : ""}${opts}</select></div>`;
  }
  if (f.type === "textarea"){
    return `<div class="${spanCls}"><label>${f.label}</label>
      <textarea name="${f.key}" placeholder="${escapeHtml(f.placeholder || "")}">${escapeHtml(val)}</textarea></div>`;
  }
  if (f.type === "checkbox"){
    return `<div class="${spanCls}" style="flex-direction:row; align-items:center; gap:8px; padding-top:18px;">
      <input type="checkbox" name="${f.key}" id="chk-${f.key}" ${val ? "checked" : ""} style="width:16px;height:16px;">
      <label for="chk-${f.key}" style="margin:0;">${f.label}</label></div>`;
  }
  if (f.type === "number"){
    return `<div class="${spanCls}"><label>${f.label}${f.required ? " *" : ""}</label>
      <input type="number" name="${f.key}" value="${val ?? ""}" ${req} ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.max !== undefined ? `max="${f.max}"` : ""}></div>`;
  }
  if (f.type === "time"){
    return `<div class="${spanCls}"><label>${f.label}${f.required ? " *" : ""}</label>
      <input type="time" name="${f.key}" value="${escapeHtml(val)}" ${req}></div>`;
  }
  if (f.type === "month"){
    return `<div class="${spanCls}"><label>${f.label}</label>
      <input type="month" name="${f.key}" value="${escapeHtml(val)}"></div>`;
  }
  if (f.type === "date"){
    return `<div class="${spanCls}"><label>${f.label}${f.required ? " *" : ""}</label>
      <input type="date" name="${f.key}" value="${escapeHtml(val)}" ${req}></div>`;
  }
  return `<div class="${spanCls}"><label>${f.label}${f.required ? " *" : ""}</label>
    <input type="text" name="${f.key}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.placeholder || "")}" ${req}></div>`;
}

export function collectFormData(fields, formEl){
  const data = {};
  fields.forEach(f => {
    const el = formEl.elements[f.key];
    if (!el) return;
    if (f.type === "checkbox") data[f.key] = el.checked;
    else if (f.type === "number") data[f.key] = el.value === "" ? null : Number(el.value);
    else data[f.key] = el.value;
  });
  return data;
}

// Separa os campos marcados como `private:true` (ex: CPF, data de nascimento)
// dos campos públicos — os privados vão para uma coleção à parte, com leitura
// restrita a e-mails autorizados nas regras do Firestore.
function splitPublicPrivate(fields, data){
  const pub = {}, priv = {};
  fields.forEach(f => {
    if (f.private) priv[f.key] = data[f.key];
    else pub[f.key] = data[f.key];
  });
  return { pub, priv };
}

function openCrudForm(opts, item){
  const isEdit = !!item;
  const fieldsHtml = opts.fields.map(f => fieldHtml(f, item)).join("");
  openModal(`
    <div class="modal-head">
      <h3>${isEdit ? "Editar" : "Novo(a)"} ${opts.singular}</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <form id="crud-form">
        <div class="form-grid">${fieldsHtml}</div>
        <div class="form-actions" style="justify-content:space-between;">
          ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-delete-item">Excluir</button>` : `<span></span>`}
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  $("#crud-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = collectFormData(opts.fields, e.target);
    const { pub, priv } = opts.privateCollectionName ? splitPublicPrivate(opts.fields, data) : { pub: data, priv: null };
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try{
      if (isEdit){
        await saveDoc(opts.collectionName, item.id, pub);
        if (opts.privateCollectionName) await setPrivateDoc(opts.privateCollectionName, item.id, priv);
      } else {
        const ref = await createDoc(opts.collectionName, pub);
        if (opts.privateCollectionName) await setPrivateDoc(opts.privateCollectionName, ref.id, priv);
      }
      toast(`${opts.singular} salvo.`, "ok");
      closeModal();
    }catch(err){
      console.error(err);
      toast("Erro ao salvar: " + err.message, "err");
      btn.disabled = false;
    }
  });

  if (isEdit){
    $("#btn-delete-item").addEventListener("click", async () => {
      if (!(await confirmAction(`Excluir "${item[opts.fields[0].key] || ""}"? Essa ação não pode ser desfeita.`))) return;
      try{
        await removeDoc(opts.collectionName, item.id);
        if (opts.privateCollectionName) await removeDoc(opts.privateCollectionName, item.id);
        toast(`${opts.singular} excluído.`, "ok");
        closeModal();
      }catch(err){
        toast("Erro ao excluir: " + err.message, "err");
      }
    });
  }
}

// Estado de ordenação de cada tabela (uma entrada por coleção) — variável de
// módulo pra sobreviver entre re-renders (a tela inteira é recriada a cada
// clique de cabeçalho ou atualização do Firestore).
const sortStates = {};
function getSortState(collectionName){
  if (!sortStates[collectionName]) sortStates[collectionName] = { key: null, dir: "asc" };
  return sortStates[collectionName];
}

// Busca por nome (uma entrada por coleção, mesma ideia do sortStates acima).
// Todas as 3 telas que usam esse motor genérico (Atletas/Adversários/Campos)
// têm um campo "nome", então a busca funciona igual pras três sem precisar
// de configuração por tela.
const searchStates = {};
function getSearchState(collectionName){
  return searchStates[collectionName] || "";
}

// Visibilidade de colunas (só usada nas telas com `columnToggle: true`, hoje
// só Atletas) — persistida no localStorage do navegador pra lembrar a
// preferência entre sessões.
function colsStorageKey(collectionName){ return `bdc_cols_${collectionName}`; }

function getVisibleColumns(opts){
  if (!opts.columnToggle) return opts.columns;
  let visibleKeys = null;
  try{
    const raw = localStorage.getItem(colsStorageKey(opts.collectionName));
    if (raw){
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) visibleKeys = arr;
    }
  }catch(err){ /* localStorage indisponível ou dado corrompido — ignora e usa o padrão */ }
  if (!visibleKeys) visibleKeys = opts.columns.filter(c => c.default !== false).map(c => c.key);
  const cols = opts.columns.filter(c => visibleKeys.includes(c.key));
  return cols.length ? cols : opts.columns.filter(c => c.default !== false);
}

function openColumnEditor(opts, onSave){
  const visible = new Set(getVisibleColumns(opts).map(c => c.key));
  const checksHtml = opts.columns.map(c => `
    <label style="display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--line);">
      <input type="checkbox" data-col="${c.key}" ${visible.has(c.key) ? "checked" : ""} style="width:16px; height:16px;">
      ${escapeHtml(c.label)}
    </label>`).join("");
  openModal(`
    <div class="modal-head">
      <h3>Editar colunas</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <p style="font-size:12.5px; color:var(--ink-faint); margin-bottom:6px;">Escolha quais colunas aparecem na tabela.</p>
      <div id="col-checks">${checksHtml}</div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn-primary" id="btn-save-cols">Salvar</button>
      </div>
    </div>
  `);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  $("#btn-save-cols").addEventListener("click", () => {
    const checked = $$("#col-checks input[type=checkbox]:checked").map(i => i.dataset.col);
    if (checked.length === 0){ toast("Selecione ao menos uma coluna.", "err"); return; }
    try{
      localStorage.setItem(colsStorageKey(opts.collectionName), JSON.stringify(checked));
    }catch(err){ /* localStorage indisponível — a preferência só vale pra essa sessão */ }
    closeModal();
    onSave();
  });
}

function renderCrudView(root, opts, state){
  const items = state[opts.collectionName] || [];
  const sortState = getSortState(opts.collectionName);
  const searchTerm = getSearchState(opts.collectionName);
  const visibleCols = getVisibleColumns(opts);
  const sortFns = Object.fromEntries(opts.columns.map(c => [c.key, c.sort]));

  const itemsFiltrados = searchTerm
    ? items.filter(item => (item.nome || "").toLowerCase().includes(searchTerm.toLowerCase()))
    : items;
  const sortedItems = sortRows(itemsFiltrados, sortState, sortFns, state);

  const rows = sortedItems.map(item => `
    <tr class="clickable" data-id="${item.id}">
      ${visibleCols.map(c => `<td>${c.render(item, state)}</td>`).join("")}
    </tr>
  `).join("");

  const emptyMsg = searchTerm
    ? `Nenhum(a) ${opts.singular.toLowerCase()} encontrado(a) para "${escapeHtml(searchTerm)}".`
    : `Nenhum(a) ${opts.singular.toLowerCase()} cadastrado(a) ainda.`;

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Cadastro</div>
        <h1>${opts.plural}</h1>
      </div>
      <div style="display:flex; gap:8px;">
        ${opts.columnToggle ? `<button class="btn btn-ghost" id="btn-edit-cols">Editar colunas</button>` : ""}
        <button class="btn btn-primary" id="btn-new">+ Novo(a) ${opts.singular}</button>
      </div>
    </div>
    ${opts.manchete ? (() => { const m = opts.manchete(items, state); return `
    <div class="manchete">
      <div class="manchete-eyebrow">${escapeHtml(m.eyebrow)}</div>
      <div class="manchete-titulo">${escapeHtml(m.titulo)}</div>
      <div class="manchete-sub">${escapeHtml(m.sub)}</div>
    </div>`; })() : ""}
    <div class="field" style="max-width:320px; margin-bottom:16px;">
      <label>Buscar por nome</label>
      <input type="text" id="input-busca" placeholder="Digite pra filtrar…" value="${escapeHtml(searchTerm)}">
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${visibleCols.map(c => sortableTh(c.label, c.key, sortState)).join("")}</tr></thead>
        <tbody>
          ${rows || `<tr class="empty-row"><td colspan="${visibleCols.length}">${emptyMsg}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  wireSortableHeaders(root, sortState, () => renderCrudView(root, opts, state));

  $("#input-busca", root)?.addEventListener("input", (e) => {
    searchStates[opts.collectionName] = e.target.value;
    reRenderKeepingFocus(root, () => renderCrudView(root, opts, state));
  });

  $("#btn-new").addEventListener("click", () => openCrudForm(opts, null));
  $("#btn-edit-cols")?.addEventListener("click", () => openColumnEditor(opts, () => reRenderKeepingFocus(root, () => renderCrudView(root, opts, state))));
  $$("tbody tr[data-id]", root).forEach(tr => {
    tr.addEventListener("click", async () => {
      const item = items.find(i => i.id === tr.dataset.id);
      if (!item) return;
      if (!opts.privateCollectionName){
        openCrudForm(opts, item);
        return;
      }
      try{
        const priv = await getPrivateDoc(opts.privateCollectionName, item.id);
        openCrudForm(opts, { ...item, ...priv });
      }catch(err){
        // Mesmo se a leitura dos dados privados (CPF/nascimento) falhar — por
        // exemplo, se as regras do Firestore ainda não tiverem sido publicadas
        // no console —, abre o formulário com os dados públicos mesmo assim,
        // em vez de travar sem abrir nada.
        console.error(err);
        toast("Não foi possível carregar CPF/nascimento (dado protegido). Abrindo com os demais dados.", "err");
        openCrudForm(opts, item);
      }
    });
  });
}

// ============================================================================
// Configurações específicas
// ============================================================================

// Posições de linha — usadas na escalação de partida (posição jogada em campo).
export const POSICOES = ["Goleiro", "Zagueiro", "Lateral", "Volante", "Meia", "Atacante"];

// Categorias do cadastro do atleta — inclui "Técnico" além das posições de
// linha, pra cadastrar comissão técnica. "Técnico" não é uma posição jogada
// em campo, por isso não entra nas opções de POSICOES (usada na escalação).
export const CATEGORIAS_ATLETA = [...POSICOES, POSICAO_TECNICO];

// Hub que agrupa Atletas/Adversários/Campos numa tela só — no mobile isso
// substitui 3 ícones separados no menu inferior por 1 só (evita menu apertado).
export function renderCadastrosHub(root, state){
  const ativos = state.atletas.filter(a => a.ativo !== false);
  const semPos = ativos.filter(a => !a.posicao).length;
  const agendados = state.jogos.filter(j => j.status !== "realizado").length;
  const realizados = state.jogos.length - agendados;
  const contAdv = contagemJogosPorAdversario(state.jogos);
  const contCampo = contagemJogosPorCampo(state.jogos);
  const advSem = state.adversarios.filter(a => !contAdv[a.id]).length;
  const campoSem = state.campos.filter(c => !contCampo[c.id]).length;

  const itens = [
    {
      route: "jogos", label: "Partidas", desc: `${agendados} agendada${agendados === 1 ? "" : "s"} · ${realizados} realizada${realizados === 1 ? "" : "s"}`,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>`,
    },
    {
      route: "atletas", label: "Atletas", desc: `${ativos.length} ativo${ativos.length === 1 ? "" : "s"}${semPos ? ` · ${semPos} sem posição` : " · elenco completo"}`,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/></svg>`,
    },
    {
      route: "adversarios", label: "Adversários", desc: `${state.adversarios.length} cadastrado${state.adversarios.length === 1 ? "" : "s"}${advSem ? ` · ${advSem} sem jogos` : ""}`,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V4l8 4 8-4v17"/><path d="M4 21h16"/></svg>`,
    },
    {
      route: "campos", label: "Campos", desc: `${state.campos.length} cadastrado${state.campos.length === 1 ? "" : "s"}${campoSem ? ` · ${campoSem} sem jogos` : ""}`,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="12" cy="12" r="2.4"/><path d="M12 6v12M3 9h3v6H3M18 9h3v6h-3"/></svg>`,
    },
  ];

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Gestão</div>
        <h1>Cadastros</h1>
      </div>
    </div>
    <div class="manchete">
      <div class="manchete-eyebrow">A base do time</div>
      <div class="manchete-titulo">${ativos.length} atletas, ${state.adversarios.length} adversários e ${state.campos.length} campos</div>
      <div class="manchete-sub">${realizados} partida${realizados === 1 ? "" : "s"} realizada${realizados === 1 ? "" : "s"} e ${agendados} agendada${agendados === 1 ? "" : "s"}${semPos ? ` · atenção: ${semPos} atleta${semPos === 1 ? "" : "s"} sem posição definida` : ""}</div>
    </div>
    <div class="dashboard-grid-3">
      ${itens.map(it => `
        <a href="#${it.route}" class="card card-pad" style="display:flex; align-items:center; gap:14px; text-decoration:none;">
          <div style="width:44px; height:44px; border-radius:50%; background:var(--pitch-light); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--pitch);">${it.icon}</div>
          <div style="min-width:0;">
            <div class="card-title" style="margin-bottom:2px;">${it.label}</div>
            <div class="card-sub" style="margin-bottom:0;">${escapeHtml(it.desc)}</div>
          </div>
        </a>`).join("")}
    </div>
  `;
}

export function renderAtletas(root, state){
  renderCrudView(root, {
    collectionName: "atletas",
    privateCollectionName: "atletas_privado",
    singular: "Atleta",
    plural: "Atletas",
    columnToggle: true,
    manchete: (items) => {
      const ativos = items.filter(a => a.ativo !== false);
      const por = {};
      ativos.forEach(a => { if (POSICOES.includes(a.posicao)) por[a.posicao] = (por[a.posicao] || 0) + 1; });
      const plur = { Goleiro: "goleiros", Zagueiro: "zagueiros", Lateral: "laterais", Volante: "volantes", Meia: "meias", Atacante: "atacantes" };
      const sem = ativos.filter(a => !a.posicao).length;
      const dist = POSICOES.filter(p => por[p]).map(p => `${por[p]} ${plur[p]}`).join(", ");
      return {
        eyebrow: "Elenco",
        titulo: `${ativos.length} atleta${ativos.length === 1 ? "" : "s"} ativo${ativos.length === 1 ? "" : "s"}${items.length > ativos.length ? ` (${items.length - ativos.length} inativo${items.length - ativos.length === 1 ? "" : "s"})` : ""}`,
        sub: `${ativos.filter(a => a.pagante).length} pagantes · ${ativos.filter(a => a.podeVotar).length} com direito a voto${dist ? ` · ${dist}` : ""}${sem ? ` · ${sem} sem posição definida` : ""}`,
      };
    },
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true, span2: true },
      { key: "nomeCompleto", label: "Nome completo", type: "text", span2: true },
      { key: "telefone", label: "Telefone", type: "text", placeholder: "(00) 00000-0000", private: true },
      { key: "posicao", label: "Posição / categoria", type: "select", options: CATEGORIAS_ATLETA, placeholder: "Selecione" },
      { key: "numero", label: "Número da camisa", type: "number", min: 0 },
      { key: "cpf", label: "CPF (opcional)", type: "text", placeholder: "000.000.000-00", private: true },
      { key: "dataNascimento", label: "Data de nascimento (opcional)", type: "date", private: true },
      { key: "ativo", label: "Atleta ativo no elenco", type: "checkbox", default: true },
      { key: "podeVotar", label: "Direito a voto (diretor/capitão)", type: "checkbox", default: false },
      { key: "pagante", label: "Pagante (paga mensalidade)", type: "checkbox", default: false },
      { key: "pagoDesde", label: "Paga mensalidade desde (mês — opcional; vazio = desde o início)", type: "month" },
      { key: "observacoes", label: "Observações", type: "textarea", span2: true },
    ],
    // "Nome completo" fica disponível no cadastro mas não
    // entra na tabela por padrão (default:false) — o usuário liga essa
    // coluna pelo botão "Editar colunas" se quiser vê-la. O telefone é privado (só no formulário).
    columns: [
      { key: "numero", label: "#", render: a => `<span class="pill-num">${a.numero ?? "—"}</span>`, sort: a => a.numero ?? null, default: true },
      { key: "nome", label: "Nome", render: a => `<strong>${escapeHtml(a.nome)}</strong>`, sort: a => (a.nome || "").toLowerCase(), default: true },
      { key: "nomeCompleto", label: "Nome completo", render: a => escapeHtml(a.nomeCompleto || "—"), sort: a => (a.nomeCompleto || "").toLowerCase(), default: false },
      { key: "posicao", label: "Posição", render: a => escapeHtml(a.posicao || "—"), sort: a => a.posicao || "", default: true },
      { key: "status", label: "Status", render: a => a.ativo === false
        ? `<span class="badge badge-off">Inativo</span>`
        : `<span class="badge badge-ok">Ativo</span>`, sort: a => a.ativo === false ? 0 : 1, default: true },
      { key: "votante", label: "Votante", render: a => a.podeVotar
        ? `<span class="badge badge-pending">Vota</span>`
        : `<span style="color:var(--ink-faint);">—</span>`, sort: a => a.podeVotar ? 1 : 0, default: true },
      { key: "pagante", label: "Pagante", render: a => a.pagante
        ? `<span class="badge badge-ok">Pagante</span>`
        : `<span style="color:var(--ink-faint);">—</span>`, sort: a => a.pagante ? 1 : 0, default: false },
      { key: "notaMedia", label: "Nota média", render: (a, state) => {
        const { media, qtd } = mediaNotaAtleta(a.id, state.jogos);
        return media === null ? "—" : `${fmt1(media)} <span style="color:var(--ink-faint); font-size:11px;">(${qtd})</span>`;
      }, sort: (a, state) => mediaNotaAtleta(a.id, state.jogos).media, default: true },
    ],
  }, state);
}

export function renderAdversarios(root, state){
  renderCrudView(root, {
    collectionName: "adversarios",
    singular: "Adversário",
    plural: "Adversários",
    manchete: (items, state) => {
      const cont = contagemJogosPorAdversario(state.jogos);
      const top = [...items].sort((a, b) => (cont[b.id] || 0) - (cont[a.id] || 0))[0];
      const sem = items.filter(a => !cont[a.id]).length;
      return {
        eyebrow: "Rivais",
        titulo: `${items.length} adversário${items.length === 1 ? "" : "s"} cadastrado${items.length === 1 ? "" : "s"}`,
        sub: `${top && cont[top.id] ? `Mais enfrentado: ${top.nome} (${cont[top.id]} jogo${cont[top.id] === 1 ? "" : "s"})` : "Nenhum jogo registrado ainda"}${sem ? ` · ${sem} ainda sem jogos` : ""}`,
      };
    },
    fields: [
      { key: "nome", label: "Nome do time", type: "text", required: true, span2: true },
      { key: "cidade", label: "Cidade", type: "text" },
      { key: "observacoes", label: "Observações", type: "textarea", span2: true },
    ],
    columns: [
      { key: "nome", label: "Nome", render: a => `<strong>${escapeHtml(a.nome)}</strong>`, sort: a => (a.nome || "").toLowerCase() },
      { key: "cidade", label: "Cidade", render: a => escapeHtml(a.cidade || "—"), sort: a => a.cidade || "" },
      { key: "jogos", label: "Jogos", render: (a, state) => contagemJogosPorAdversario(state.jogos)[a.id] || 0, sort: (a, state) => contagemJogosPorAdversario(state.jogos)[a.id] || 0 },
      { key: "notaMedia", label: "Nota média", render: (a, state) => {
        const { media, qtd } = mediaAdversario(a.id, state.jogos);
        return media === null ? "—" : `${fmt1(media)} <span style="color:var(--ink-faint); font-size:11px;">(${qtd})</span>`;
      }, sort: (a, state) => mediaAdversario(a.id, state.jogos).media },
    ],
  }, state);
}

export function renderCampos(root, state){
  renderCrudView(root, {
    collectionName: "campos",
    singular: "Campo",
    plural: "Campos",
    manchete: (items, state) => {
      const cont = contagemJogosPorCampo(state.jogos);
      const top = [...items].sort((a, b) => (cont[b.id] || 0) - (cont[a.id] || 0))[0];
      const sem = items.filter(c => !cont[c.id]).length;
      return {
        eyebrow: "Onde jogamos",
        titulo: `${items.length} campo${items.length === 1 ? "" : "s"} cadastrado${items.length === 1 ? "" : "s"}`,
        sub: `${top && cont[top.id] ? `Mais usado: ${top.nome} (${cont[top.id]} jogo${cont[top.id] === 1 ? "" : "s"})` : "Nenhum jogo registrado ainda"}${sem ? ` · ${sem} ainda sem jogos` : ""}`,
      };
    },
    fields: [
      { key: "nome", label: "Nome do campo", type: "text", required: true, span2: true },
      { key: "endereco", label: "Endereço", type: "text", span2: true },
      { key: "tipo", label: "Tipo de gramado", type: "select", options: ["Gramado natural", "Gramado sintético", "Society", "Quadra"], placeholder: "Selecione" },
      { key: "observacoes", label: "Observações", type: "textarea", span2: true },
    ],
    columns: [
      { key: "nome", label: "Nome", render: c => `<strong>${escapeHtml(c.nome)}</strong>`, sort: c => (c.nome || "").toLowerCase() },
      { key: "tipo", label: "Tipo", render: c => escapeHtml(c.tipo || "—"), sort: c => c.tipo || "" },
      { key: "jogos", label: "Jogos", render: (c, state) => contagemJogosPorCampo(state.jogos)[c.id] || 0, sort: (c, state) => contagemJogosPorCampo(state.jogos)[c.id] || 0 },
      { key: "notaMedia", label: "Nota média", render: (c, state) => {
        const { media, qtd } = mediaCampo(c.id, state.jogos);
        return media === null ? "—" : `${fmt1(media)} <span style="color:var(--ink-faint); font-size:11px;">(${qtd})</span>`;
      }, sort: (c, state) => mediaCampo(c.id, state.jogos).media },
    ],
  }, state);
}
