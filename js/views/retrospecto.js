import { $, $$, escapeHtml, formatDate } from "../utils.js";
import { jogosRealizados } from "../stats.js";
import { anosDisponiveis } from "../filters.js";

// Retrospecto: campanha do Bom D' Copus contra cada adversário e em cada campo,
// com manchete, destaques (freguês, carrasco, melhor campo, maior goleada) e
// uma barrinha de vitórias/empates/derrotas em cada linha.

let aba = "adversario"; // adversario | campo
let filtroAno = "";
let ordem = "jogos";    // jogos | aproveitamento | saldo | vitorias

function agrupar(jogos, chaveId){
  const m = new Map();
  jogos.forEach(j => {
    const id = j[chaveId];
    if (!id) return;
    if (!m.has(id)) m.set(id, { id, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 });
    const g = m.get(id);
    const nos = Number(j.placarNos), eles = Number(j.placarAdversario);
    if (isNaN(nos) || isNaN(eles)) return;
    g.jogos++; g.gp += nos; g.gc += eles;
    if (nos > eles) g.v++; else if (nos < eles) g.d++; else g.e++;
  });
  return [...m.values()].filter(g => g.jogos > 0).map(g => ({
    ...g, sg: g.gp - g.gc, aprov: (g.v * 3 + g.e) / (g.jogos * 3) * 100,
  }));
}

function plural(n, um, varios){ return `${n} ${n === 1 ? um : varios}`; }

export function renderRetrospecto(root, state){
  const realizados = jogosRealizados(state.jogos).filter(j => j.placarNos !== null && j.placarNos !== undefined);
  const anos = anosDisponiveis(realizados);
  if (filtroAno && !anos.includes(filtroAno)) filtroAno = "";
  const jogos = realizados.filter(j => !filtroAno || (j.data || "").startsWith(filtroAno));

  const porAdv = aba === "adversario";
  const nomeAdv = (id) => state.adversarios.find(x => x.id === id)?.nome || "?";
  const nomeCampo = (id) => state.campos.find(x => x.id === id)?.nome || "?";
  const lista = agrupar(jogos, porAdv ? "adversarioId" : "campoId");
  const nome = porAdv ? nomeAdv : nomeCampo;

  // Destaques: sempre calculados sobre adversários e campos do período.
  const advs = agrupar(jogos, "adversarioId");
  const campos = agrupar(jogos, "campoId");
  const elegiveis = (arr) => { const e = arr.filter(g => g.jogos >= 2); return e.length >= 2 ? e : arr; };
  const melhor = (arr) => [...elegiveis(arr)].sort((a, b) => b.aprov - a.aprov || b.sg - a.sg || b.jogos - a.jogos)[0];
  const pior = (arr) => [...elegiveis(arr)].sort((a, b) => a.aprov - b.aprov || a.sg - b.sg || b.jogos - a.jogos)[0];
  const fregues = advs.length >= 2 ? melhor(advs) : null;
  const carrasco = advs.length >= 2 ? pior(advs) : null;
  const melhorCampo = campos.length >= 1 ? melhor(campos) : null;
  const goleada = [...jogos].filter(j => Number(j.placarNos) > Number(j.placarAdversario))
    .sort((a, b) => (b.placarNos - b.placarAdversario) - (a.placarNos - a.placarAdversario) || b.placarNos - a.placarNos || (b.data || "").localeCompare(a.data || ""))[0];

  const cmp = {
    jogos: (a, b) => b.jogos - a.jogos || b.aprov - a.aprov,
    aproveitamento: (a, b) => b.aprov - a.aprov || b.jogos - a.jogos,
    saldo: (a, b) => b.sg - a.sg || b.jogos - a.jogos,
    vitorias: (a, b) => b.v - a.v || b.jogos - a.jogos,
  }[ordem];
  lista.sort(cmp);

  const tot = lista.reduce((t, g) => ({ jogos: t.jogos + g.jogos, v: t.v + g.v, e: t.e + g.e, d: t.d + g.d, gp: t.gp + g.gp, gc: t.gc + g.gc }), { jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 });
  const aprovTot = tot.jogos ? (tot.v * 3 + tot.e) / (tot.jogos * 3) * 100 : 0;
  const sgFmt = (n) => (n > 0 ? "+" : "") + n;
  const periodo = filtroAno ? `em ${filtroAno}` : "na história";

  const manchete = tot.jogos ? `
    <div class="manchete">
      <div class="manchete-eyebrow">Retrospecto ${porAdv ? "por adversário" : "por campo"} · ${filtroAno || "toda a história"}</div>
      <div class="manchete-titulo">${plural(lista.length, porAdv ? "adversário enfrentado" : "campo visitado", porAdv ? "adversários enfrentados" : "campos visitados")} ${periodo}</div>
      <div class="manchete-sub">${plural(tot.v, "vitória", "vitórias")}, ${plural(tot.e, "empate", "empates")} e ${plural(tot.d, "derrota", "derrotas")} em ${plural(tot.jogos, "jogo", "jogos")} · ${tot.gp} gols a favor e ${tot.gc} contra · aproveitamento de ${Math.round(aprovTot)}%</div>
    </div>` : "";

  const cartao = (rotulo, titulo, detalhe, extra = "") => `
    <div class="card card-pad rt-dest" ${extra}>
      <div class="dash-section-title" style="margin:0 0 4px;">${rotulo}</div>
      <div class="rt-dest-nome">${escapeHtml(titulo)}</div>
      <div class="card-sub" style="margin:2px 0 0;">${detalhe}</div>
    </div>`;
  const resumoG = (g) => `${g.v}V ${g.e}E ${g.d}D · ${Math.round(g.aprov)}% de aproveitamento`;
  const destaques = [
    fregues ? cartao("Freguês", nomeAdv(fregues.id), escapeHtml(resumoG(fregues))) : "",
    carrasco && carrasco.id !== (fregues && fregues.id) ? cartao("Carrasco", nomeAdv(carrasco.id), escapeHtml(resumoG(carrasco))) : "",
    melhorCampo ? cartao("Melhor campo", nomeCampo(melhorCampo.id), escapeHtml(resumoG(melhorCampo))) : "",
    goleada ? cartao("Maior goleada", `${goleada.placarNos} x ${goleada.placarAdversario}`, `contra ${escapeHtml(nomeAdv(goleada.adversarioId))} · ${formatDate(goleada.data)}`, `style="cursor:pointer;" data-sumula="${goleada.id}"`) : "",
  ].join("");

  const barra = (g) => `
    <div class="rt-bar" title="${g.v}V ${g.e}E ${g.d}D">
      ${g.v ? `<span class="v" style="flex:${g.v}"></span>` : ""}${g.e ? `<span class="e" style="flex:${g.e}"></span>` : ""}${g.d ? `<span class="d" style="flex:${g.d}"></span>` : ""}
    </div>`;
  const linhas = lista.map(g => `
    <div class="hist-card" style="cursor:default;">
      <div class="hist-info">
        <div class="hist-adv">${escapeHtml(nome(g.id))}</div>
        <div class="hist-meta">${plural(g.jogos, "jogo", "jogos")} · ${g.v}V ${g.e}E ${g.d}D · gols ${g.gp} x ${g.gc} (${sgFmt(g.sg)})</div>
        ${barra(g)}
      </div>
      <div class="hist-placar">
        <div class="hist-placar-val">${Math.round(g.aprov)}%</div>
        <div class="hist-nota">aproveitamento</div>
      </div>
    </div>`).join("");

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h1>Retrospecto</h1>
      </div>
    </div>

    ${manchete}
    ${destaques ? `<div class="rt-destaques">${destaques}</div>` : ""}

    <div class="rank-chips">
      <button class="rank-chip ${porAdv ? "active" : ""}" data-aba="adversario" type="button">Por adversário</button>
      <button class="rank-chip ${porAdv ? "" : "active"}" data-aba="campo" type="button">Por campo</button>
    </div>

    <div class="rank-filtros" style="max-width:520px;">
      <div class="field">
        <label>Ano</label>
        <select id="rt-ano">
          <option value="">Todos</option>
          ${anos.map(a => `<option value="${a}" ${a === filtroAno ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Ordenar por</label>
        <select id="rt-ordem">
          <option value="jogos" ${ordem === "jogos" ? "selected" : ""}>Mais jogos</option>
          <option value="aproveitamento" ${ordem === "aproveitamento" ? "selected" : ""}>Aproveitamento</option>
          <option value="vitorias" ${ordem === "vitorias" ? "selected" : ""}>Mais vitórias</option>
          <option value="saldo" ${ordem === "saldo" ? "selected" : ""}>Saldo de gols</option>
        </select>
      </div>
    </div>

    ${linhas || `<div class="empty-state"><h3>Sem partidas</h3><p>Nenhuma partida com placar para esse filtro.</p></div>`}
    <p class="field-hint" style="margin-top:10px;">A barrinha mostra vitórias (verde), empates (cinza) e derrotas (vermelho). Aproveitamento = pontos conquistados (3 por vitória, 1 por empate) sobre o total possível. Freguês e carrasco consideram adversários com pelo menos 2 jogos.</p>
  `;

  $$(".rank-chip[data-aba]", root).forEach(b => b.addEventListener("click", () => { aba = b.dataset.aba; renderRetrospecto(root, state); }));
  $$("[data-sumula]", root).forEach(el => el.addEventListener("click", () => { location.hash = `#historico/${el.dataset.sumula}`; }));
  $("#rt-ano", root).addEventListener("change", (e) => { filtroAno = e.target.value; renderRetrospecto(root, state); });
  $("#rt-ordem", root).addEventListener("change", (e) => { ordem = e.target.value; renderRetrospecto(root, state); });
}
