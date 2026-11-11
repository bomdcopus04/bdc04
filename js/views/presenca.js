import { $, $$, escapeHtml, toast, formatDateLong } from "../utils.js";
import { listenPresencas, setPresenca } from "../db.js";
import { ehJogador } from "../stats.js";

// Confirmação de presença — tela pública (sem login). O jogador abre o link
// do jogo, acha o próprio nome e toca em Vou / Talvez / Não vou.

const RESPOSTAS = [
  { key: "vou", label: "Vou", icon: "✅" },
  { key: "talvez", label: "Talvez", icon: "🤔" },
  { key: "nao", label: "Não vou", icon: "❌" },
];

let unsub = null;
let jogoAtual = null;
let presencas = [];
let erroLeitura = false;

function pararEscuta(){
  if (unsub){ unsub(); unsub = null; }
  jogoAtual = null; presencas = []; erroLeitura = false;
}

export function linkPresenca(jogoId){
  return `${location.origin}${location.pathname}#presenca/${jogoId}`;
}

export function renderPresenca(root, state, jogoId){
  const jogo = state.jogos.find(j => j.id === jogoId);
  if (!jogo){
    pararEscuta();
    root.innerHTML = `<div class="empty-state"><h3>Jogo não encontrado</h3><p>O link pode estar incorreto ou o jogo foi excluído.</p></div>`;
    return;
  }

  if (jogoAtual !== jogoId){
    pararEscuta();
    jogoAtual = jogoId;
    unsub = listenPresencas(jogoId, (items, err) => {
      presencas = items; erroLeitura = !!err;
      // Só redesenha se o usuário ainda está nessa tela; senão, para de ouvir.
      if (location.hash.startsWith(`#presenca/${jogoId}`)) desenhar(root, state, jogoId);
      else pararEscuta();
    });
  }
  desenhar(root, state, jogoId);
}

function desenhar(root, state, jogoId){
  const jogo = state.jogos.find(j => j.id === jogoId);
  if (!jogo) return;
  const adv = state.adversarios.find(a => a.id === jogo.adversarioId)?.nome || "?";
  const campo = state.campos.find(c => c.id === jogo.campoId)?.nome || "";
  const aberto = jogo.status === "agendado";

  const jogadores = state.atletas.filter(a => ehJogador(a) && a.ativo !== false)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const respostaDe = new Map(presencas.map(p => [p.atletaId, p.resposta]));

  const cont = { vou: 0, talvez: 0, nao: 0, sem: 0 };
  jogadores.forEach(a => { const r = respostaDe.get(a.id); if (cont[r] !== undefined) cont[r]++; else cont.sem++; });

  const nomesDe = (resp) => jogadores.filter(a => respostaDe.get(a.id) === resp).map(a => escapeHtml(a.nome)).join(", ");

  const linhas = jogadores.map(a => {
    const atual = respostaDe.get(a.id);
    const botoes = RESPOSTAS.map(r => `
      <button class="btn btn-sm ${atual === r.key ? "btn-primary" : "btn-ghost"}" data-atleta="${a.id}" data-resp="${r.key}" ${aberto ? "" : "disabled"}>${r.icon} ${r.label}</button>`).join("");
    return `
      <div class="card card-pad" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <strong>${escapeHtml(a.nome)}</strong>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">${botoes}</div>
      </div>`;
  }).join("");

  const chip = (label, n) => `<div class="kpi-tile"><div class="kpi-label">${label}</div><div class="kpi-value">${n}</div></div>`;

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="eyebrow">Confirmação de presença</div>
        <h1>Bom D' Copus vs ${escapeHtml(adv)}</h1>
        <div style="font-size:13px; color:var(--ink-soft); margin-top:4px;">🗓️ ${formatDateLong(jogo.data)}${jogo.horario ? ` · ⏰ ${escapeHtml(jogo.horario)}` : ""}${campo ? ` · 📍 ${escapeHtml(campo)}` : ""}${jogo.tipoPartida ? ` · 🏷️ ${escapeHtml(jogo.tipoPartida)}` : ""}</div>
      </div>
    </div>

    ${erroLeitura ? `<div class="card card-pad" style="margin-bottom:12px;">Não foi possível carregar as confirmações agora. Tente novamente mais tarde.</div>` : ""}
    ${aberto ? `<p style="font-size:13px; color:var(--ink-soft); margin:0 0 12px;">Ache seu nome e toque em uma opção. Você pode mudar de ideia quando quiser.</p>`
      : `<p style="font-size:13px; color:var(--ink-soft); margin:0 0 12px;">Esse jogo já foi realizado — as confirmações estão fechadas.</p>`}

    <div class="kpi-grid">${chip("Vou", cont.vou)}${chip("Talvez", cont.talvez)}${chip("Não vou", cont.nao)}${chip("Sem resposta", cont.sem)}</div>

    ${cont.vou ? `<p style="font-size:13px; margin:0 0 6px;"><strong>✅ Vão:</strong> ${nomesDe("vou")}</p>` : ""}
    ${cont.talvez ? `<p style="font-size:13px; margin:0 0 6px;"><strong>🤔 Talvez:</strong> ${nomesDe("talvez")}</p>` : ""}
    ${cont.nao ? `<p style="font-size:13px; margin:0 0 6px;"><strong>❌ Não vão:</strong> ${nomesDe("nao")}</p>` : ""}

    ${state.isAuthorized ? `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:14px 0;">
        <button class="btn btn-ghost btn-sm" id="btn-copiar-convite">Copiar convite (WhatsApp)</button>
        <button class="btn btn-ghost btn-sm" id="btn-copiar-pendentes">Copiar lista de quem não respondeu</button>
      </div>` : ""}

    <h2 style="font-size:18px; margin:14px 0 10px;">Jogadores</h2>
    ${linhas || `<p style="color:var(--ink-faint); font-style:italic;">Nenhum jogador ativo cadastrado.</p>`}
  `;

  $$("button[data-resp]", root).forEach(btn => btn.addEventListener("click", async () => {
    const atletaId = btn.dataset.atleta;
    const nome = jogadores.find(a => a.id === atletaId)?.nome || "";
    btn.disabled = true;
    try{
      await setPresenca(jogoId, atletaId, btn.dataset.resp);
      toast(`${nome}: ${RESPOSTAS.find(r => r.key === btn.dataset.resp).label}`, "ok");
    }catch(err){
      console.error(err);
      toast("Não foi possível salvar sua resposta. Tente de novo.", "err");
      btn.disabled = false;
    }
  }));

  const copiar = async (texto, msg) => {
    try{ await navigator.clipboard.writeText(texto); toast(msg, "ok"); }
    catch(e){ toast("Não foi possível copiar.", "err"); }
  };
  $("#btn-copiar-convite", root)?.addEventListener("click", () => copiar(
    `⚽ *Bom D' Copus vs ${adv}*\n🗓️ ${formatDateLong(jogo.data)}${jogo.horario ? `\n⏰ ${jogo.horario}` : ""}${campo ? `\n📍 ${campo}` : ""}\n\nConfirme sua presença pelo link:\n${linkPresenca(jogoId)}`,
    "Convite copiado."));
  $("#btn-copiar-pendentes", root)?.addEventListener("click", () => {
    const pend = jogadores.filter(a => !respostaDe.has(a.id)).map(a => `• ${a.nome}`);
    copiar(pend.length
      ? `⚽ Falta confirmar presença (Bom D' Copus vs ${adv}):\n${pend.join("\n")}\n\n${linkPresenca(jogoId)}`
      : "Todo mundo já respondeu!", "Lista copiada.");
  });
}
