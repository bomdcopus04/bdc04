// Hub "Relatórios" — agrupa as telas de consulta (Ranking, Escalação ideal,
// Histórico, Extrato, Retrospecto e Premiações) num item só do menu, no mesmo molde do hub
// de Cadastros. O Dashboard continua separado por ser a tela inicial.
export function renderRelatoriosHub(root, state){
  const itens = [
    {
      route: "ranking", label: "Ranking", desc: "Artilharia, assistências e notas",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10l-1 8a4 4 0 0 1-8 0L7 4z"/><path d="M5 6H3a2 2 0 0 0 0 4h1M19 6h2a2 2 0 0 1 0 4h-1"/></svg>`,
    },
    {
      route: "extrato", label: "Extrato do jogador", desc: "Jogos, gols, assistências e notas de cada atleta",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>`,
    },
    {
      route: "retrospecto", label: "Retrospecto", desc: "Campanha contra cada adversário e em cada campo",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
    },
    {
      route: "premiacoes", label: "Premiações", desc: "Temporada e destaque do mês, com imagem pra compartilhar",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg>`,
    },
    {
      route: "escalacao-ideal", label: "Escalação ideal", desc: "Melhor time por formação",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="2.4"/><circle cx="5" cy="14" r="2.4"/><circle cx="19" cy="14" r="2.4"/><circle cx="9" cy="20" r="2.4"/><circle cx="15" cy="20" r="2.4"/></svg>`,
    },
    {
      route: "historico", label: "Histórico", desc: `${state.jogos.filter(j => j.status === "realizado").length} partida(s) realizada(s)`,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
    },
  ];

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Visão geral</div>
        <h1>Relatórios</h1>
      </div>
    </div>
    <div class="dashboard-grid-3">
      ${itens.map(it => `
        <a href="#${it.route}" class="card card-pad" style="display:flex; align-items:center; gap:14px; text-decoration:none;">
          <div style="width:44px; height:44px; border-radius:50%; background:var(--pitch-light); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--pitch);">${it.icon}</div>
          <div style="min-width:0;">
            <div class="card-title" style="margin-bottom:2px;">${it.label}</div>
            <div class="card-sub" style="margin-bottom:0;">${it.desc}</div>
          </div>
        </a>`).join("")}
    </div>
  `;
}
