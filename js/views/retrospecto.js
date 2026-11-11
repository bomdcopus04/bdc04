import { $, $$, escapeHtml, fmt1 } from "../utils.js";
import { jogosRealizados } from "../stats.js";
import { anosDisponiveis } from "../filters.js";

// Retrospecto: campanha do Bom D' Copus contra cada adversário e em cada campo
// (jogos, V/E/D, gols pró/contra, saldo e aproveitamento), com filtro por ano.

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

export function renderRetrospecto(root, state){
  const realizados = jogosRealizados(state.jogos).filter(j => j.placarNos !== null && j.placarNos !== undefined);
  const anos = anosDisponiveis(realizados);
  if (filtroAno && !anos.includes(filtroAno)) filtroAno = "";
  const jogos = realizados.filter(j => !filtroAno || (j.data || "").startsWith(filtroAno));

  const porAdv = aba === "adversario";
  const lista = agrupar(jogos, porAdv ? "adversarioId" : "campoId");
  const nomes = porAdv ? state.adversarios : state.campos;
  const nome = (id) => nomes.find(x => x.id === id)?.nome || "?";
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

  const rows = lista.map(g => `
    <tr>
      <td><strong>${escapeHtml(nome(g.id))}</strong></td>
      <td class="pill-num">${g.jogos}</td>
      <td class="pill-num" style="color:var(--ok);">${g.v}</td>
      <td class="pill-num">${g.e}</td>
      <td class="pill-num" style="color:var(--danger);">${g.d}</td>
      <td class="pill-num">${g.gp}</td>
      <td class="pill-num">${g.gc}</td>
      <td class="pill-num">${sgFmt(g.sg)}</td>
      <td class="pill-num">${Math.round(g.aprov)}%</td>
    </tr>`).join("");

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h1>Retrospecto</h1>
      </div>
    </div>

    <div class="tabbar">
      <button class="tab-btn ${porAdv ? "active" : ""}" data-aba="adversario">Por adversário</button>
      <button class="tab-btn ${porAdv ? "" : "active"}" data-aba="campo">Por campo</button>
    </div>

    <div class="form-grid" style="margin-bottom:16px; max-width:480px;">
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

    <div class="kpi-grid">
      <div class="kpi-tile"><div class="kpi-label">Jogos</div><div class="kpi-value">${tot.jogos}</div></div>
      <div class="kpi-tile"><div class="kpi-label">V / E / D</div><div class="kpi-value">${tot.v}/${tot.e}/${tot.d}</div></div>
      <div class="kpi-tile"><div class="kpi-label">Gols (pró x contra)</div><div class="kpi-value">${tot.gp} x ${tot.gc}</div></div>
      <div class="kpi-tile"><div class="kpi-label">Aproveitamento</div><div class="kpi-value">${Math.round(aprovTot)}%</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>${porAdv ? "Adversário" : "Campo"}</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Aprov.</th></tr></thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="9">Nenhuma partida com placar para esse filtro.</td></tr>`}</tbody>
      </table>
    </div>
    <p class="field-hint" style="margin-top:10px;">J = jogos · V/E/D = vitórias, empates, derrotas · GP/GC = gols pró/contra · SG = saldo · Aprov. = pontos conquistados (3 por vitória, 1 por empate) sobre o total possível.</p>
  `;

  $$(".tab-btn[data-aba]", root).forEach(b => b.addEventListener("click", () => { aba = b.dataset.aba; renderRetrospecto(root, state); }));
  $("#rt-ano", root).addEventListener("change", (e) => { filtroAno = e.target.value; renderRetrospecto(root, state); });
  $("#rt-ordem", root).addEventListener("change", (e) => { ordem = e.target.value; renderRetrospecto(root, state); });
}
