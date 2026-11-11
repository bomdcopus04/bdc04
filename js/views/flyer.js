import { $, $$, escapeHtml, openModal, closeModal, toast, formatDateLong, formatDate, avg, fmt1 } from "../utils.js";
import { saveDoc } from "../db.js";
import { notasDoAtletaNoJogo, resultadoJogo, GOL_CONTRA_ID, posicaoJogadaNoJogo, normalizeEscalacao } from "../stats.js";

// Imagem (flyer) da partida pra compartilhar no WhatsApp: modelo "Convite"
// (antes do jogo) e "Resultado" (depois). O escudo do adversário é enviado
// uma vez (da galeria do celular), reduzido no navegador e guardado no
// cadastro do adversário pra ser reaproveitado nos próximos jogos.

const DOURADO = "#E4B62B";
// Fundos disponíveis (preto e amarelo): cores usadas em todo o flyer.
const TEMAS = {
  noite: { nome: "Preto clássico", bg: "linear-gradient(180deg,#0d0d0d 0%,#1d1d1d 100%)", fg: "#ffffff", accent: DOURADO, muted: "#a9a9a9", muted2: "#cfcfcf", faint: "#5f5f5f", border: "none", ring: "transparent" },
  listras: { nome: "Preto com listras e moldura", bg: "repeating-linear-gradient(135deg,#0e0e0e 0,#0e0e0e 70px,#191919 70px,#191919 140px)", fg: "#ffffff", accent: DOURADO, muted: "#b5b5b5", muted2: "#d8d8d8", faint: "#6a6a6a", border: `16px solid ${DOURADO}`, ring: "transparent" },
  arte: { nome: "Preto com moldura (estilo do time)", bg: "#000000", fg: "#ffffff", accent: DOURADO, muted: "#b5b5b5", muted2: "#d8d8d8", faint: "#6a6a6a", border: "none", ring: "transparent", decor: true },
};

const ESCUDO_MAX = 192; // px — pequeno de propósito (vai dentro do documento do adversário)

function iniciais(nome){
  return (nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function escudoHtml(src, nome, tam, cor = DOURADO){
  if (src){
    return `<img src="${src}" style="width:${tam}px; height:${tam}px; object-fit:contain;">`;
  }
  return `<div style="width:${tam}px; height:${tam}px; border-radius:50%; border:6px solid ${cor}; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:${Math.round(tam * 0.4)}px; color:${cor};">${escapeHtml(iniciais(nome))}</div>`;
}

// Reduz a imagem escolhida pra no máximo ESCUDO_MAX px (mantém proporção e
// transparência) e devolve uma data URL leve.
function reduzirImagem(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, ESCUDO_MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

// Foto do jogador (não é salva): reduz para no máximo 1000 px e comprime.
function reduzirFoto(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

// Gols da partida agrupados por jogador ("Guguinha ×2") + destaques.
function resumoJogo(jogo, atletas){
  const nome = (id) => id === GOL_CONTRA_ID ? "Gol contra" : (atletas.find(a => a.id === id)?.nome || "?");
  const eventos = (jogo.golsAssistencias || []);
  const gols = eventos.map(e => ({
    gol: nome(e.atletaGolId),
    assist: e.atletaAssistId && e.atletaAssistId !== GOL_CONTRA_ID ? nome(e.atletaAssistId) : null,
  }));
  const conta = (campo, ignorarContra) => {
    const m = {};
    eventos.forEach(e => {
      const id = e[campo];
      if (!id || id === GOL_CONTRA_ID) return;
      m[id] = (m[id] || 0) + 1;
    });
    const max = Math.max(0, ...Object.values(m));
    // Todo mundo empatado com 1 não é "destaque" — só mostra se for único ou tiver mais de 1.
    if (max === 1 && Object.keys(m).length > 1) return null;
    return max > 0 ? { max, nomes: Object.keys(m).filter(id => m[id] === max).map(nome) } : null;
  };
  let melhorNota = null;
  Object.keys(jogo.avaliacoesJogadores || {}).forEach(id => {
    const n = avg(notasDoAtletaNoJogo(jogo, id));
    if (n !== null && (!melhorNota || n > melhorNota.nota)) melhorNota = { nota: n, nome: nome(id) };
  });
  // Jogadores com nota na partida (melhor primeiro); sem nota nenhuma, cai pra
  // quem foi escalado, só pra poder escolher o jogador do flyer.
  let ranking = Object.keys(jogo.avaliacoesJogadores || {})
    .map(id => ({ id, nome: nome(id), nota: avg(notasDoAtletaNoJogo(jogo, id)) }))
    .filter(x => x.nota !== null)
    .sort((a, b) => b.nota - a.nota);
  if (ranking.length === 0){
    const ids = new Set([...normalizeEscalacao(jogo.escalacaoInicial), ...normalizeEscalacao(jogo.escalacaoFinal)].map(e => e.atletaId));
    ranking = [...ids].map(id => ({ id, nome: nome(id), nota: null })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  const infoJogador = (id) => ({
    gols: eventos.filter(e => e.atletaGolId === id).length,
    assists: eventos.filter(e => e.atletaAssistId === id).length,
    posicao: posicaoJogadaNoJogo(jogo, id) || atletas.find(a => a.id === id)?.posicao || "",
  });
  return { gols, artilheiro: conta("atletaGolId"), garcom: conta("atletaAssistId"), melhorNota, ranking, infoJogador };
}

// Legenda pronta pra colar na postagem (convite ou resultado).
const HASHTAGS = "#bdc04\n#futeboldevarzea\n#somosbdc";
function legendaTexto(modelo, { jogo, adv, campo, resumo }){
  const advNome = adv?.nome || "Adversário";
  const linhas = [];
  const dados = [`🆚 Bom D' Copus x ${advNome}`, `📅 ${formatDateLong(jogo.data)}`];
  if (modelo === "convite"){
    linhas.push("Partida Confirmada! ⚽🔥", "");
    if (jogo.horario) dados.push(`⏰ ${jogo.horario}`);
    if (campo) dados.push(`📍 ${campo.nome}`);
    if (jogo.tipoPartida) dados.push(`🏷️ ${jogo.tipoPartida}`);
    linhas.push(...dados);
  } else {
    linhas.push("Partida Encerrada! 🏁", "");
    const res = resultadoJogo(jogo);
    const rotulo = res === "vitoria" ? " — Vitória 🏆" : res === "derrota" ? " — Derrota" : res === "empate" ? " — Empate 🤝" : "";
    if (jogo.placarNos !== null && jogo.placarNos !== undefined) dados.push(`🔢 Placar: Bom D' Copus ${jogo.placarNos} x ${jogo.placarAdversario ?? 0} ${advNome}${rotulo}`);
    if (campo) dados.push(`📍 ${campo.nome}`);
    if (jogo.tipoPartida) dados.push(`🏷️ ${jogo.tipoPartida}`);
    linhas.push(...dados);
    if (resumo.gols.length){
      linhas.push("", "⚽ Gols e assistências:");
      resumo.gols.forEach(g => linhas.push(`• ${g.gol}${g.assist ? ` (assist. ${g.assist})` : ""}`));
    }
    if (resumo.melhorNota) linhas.push("", `⭐ Melhor do jogo: ${resumo.melhorNota.nome} — nota ${fmt1(resumo.melhorNota.nota)}`);
  }
  linhas.push("", HASHTAGS);
  return linhas.join("\n");
}

function flyerHtml({ modelo, formato, tema, jogo, adv, campo, escudo, resumo, jogadorId, foto }){
  const T = TEMAS[tema] || TEMAS.noite;
  const DOURADO = T.accent;
  const W = 1080;
  const H = formato === "story" ? 1920 : 1350;
  const base = `width:${W}px; height:${H}px; box-sizing:border-box; padding:80px 70px; background:${T.bg}; color:${T.fg}; border:${T.border}; font-family:'Inter',system-ui,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:space-between; position:relative; overflow:hidden;`;
  // Detalhes do tema "arte": riscos diagonais amarelos nos cantos.
  const risco = (css) => `<div style="position:absolute; height:6px; background:${DOURADO}; ${css}"></div>`;
  const cantos = T.decor ? [
    risco("left:-60px; top:140px; width:260px; transform:rotate(-45deg); transform-origin:left center;"),
    risco("left:-60px; top:215px; width:380px; transform:rotate(-45deg); transform-origin:left center;"),
    risco("left:-60px; top:290px; width:260px; transform:rotate(-45deg); transform-origin:left center;"),
    risco("right:-60px; bottom:140px; width:260px; transform:rotate(-45deg); transform-origin:right center;"),
    risco("right:-60px; bottom:215px; width:380px; transform:rotate(-45deg); transform-origin:right center;"),
    risco("right:-60px; bottom:290px; width:260px; transform:rotate(-45deg); transform-origin:right center;"),
  ].join("") : "";
  const topo = `
    <div style="display:flex; align-items:center; gap:22px;">
      <img src="assets/logo-bomdcopus.png" style="width:96px; height:96px; border-radius:50%; object-fit:cover; box-shadow:0 0 0 4px ${T.ring};">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:72px; letter-spacing:.04em; line-height:1;">BOM D' COPUS</div>
    </div>`;
  const tipo = jogo.tipoPartida ? `<div style="font-family:'Bebas Neue',sans-serif; font-size:50px; letter-spacing:.2em; color:${DOURADO};">${escapeHtml(String(jogo.tipoPartida).toUpperCase())}</div>` : "<div></div>";
  const data = formatDateLong(jogo.data);
  const rodape = `<div style="font-size:20px; color:${T.faint}; letter-spacing:.06em;">Imagem gerada pelo app Bom D' Copus</div>`;
  const faixa = `<div style="width:220px; height:6px; background:${DOURADO}; border-radius:3px;"></div>`;
  const bdc = `<img src="assets/logo-bomdcopus.png" style="width:__T__px; height:__T__px; border-radius:50%; object-fit:cover; box-shadow:0 0 0 8px ${T.ring};">`;

  if (modelo === "convite" && T.decor){
    const t = 320;
    const icone = (svg) => `<svg viewBox="0 0 24 24" width="92" height="92" fill="none" stroke="${DOURADO}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
    const col = (ic, rot, val, tam) => `<div style="flex:1; text-align:center; padding:0 12px;">${ic}<div style="font-size:26px; letter-spacing:.3em; margin-top:14px;">${rot}</div><div style="font-size:${tam}px; font-weight:800; line-height:1.15; margin-top:6px;">${escapeHtml(val)}</div></div>`;
    const div = `<div style="width:4px; align-self:stretch; background:${DOURADO};"></div>`;
    const nome = (n) => `<div style="text-align:center; width:380px;"><div style="font-size:40px; letter-spacing:.16em; padding-bottom:14px; border-bottom:4px solid ${DOURADO};">${escapeHtml(n)}</div></div>`;
    return `<div style="${base}">${cantos}
      <div style="border:5px solid ${DOURADO}; padding:10px; margin-top:20px;">
        <div style="border:2px solid ${DOURADO}; padding:14px 90px; font-size:104px; font-weight:900; font-style:italic; letter-spacing:.08em;">${escapeHtml(String(jogo.tipoPartida || "Amistoso").toUpperCase())}</div>
      </div>
      <div style="display:flex; align-items:center; justify-content:center; gap:36px;">
        ${bdc.replace(/__T__/g, t)}
        <div style="font-family:'Bebas Neue',sans-serif; font-size:150px; color:${DOURADO}; line-height:1;">VS</div>
        ${escudoHtml(escudo, adv?.nome, t, T.accent)}
      </div>
      <div style="display:flex; justify-content:center; gap:60px;">
        ${nome("BOM D' COPUS 04")}${nome((adv?.nome || "Adversário").toUpperCase())}
      </div>
      <div style="width:100%; display:flex; align-items:stretch; border-top:0;">
        ${col(icone('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7 14h2M11 14h2M15 14h2M7 17.5h2M11 17.5h2"/>'), "DATA", formatDate(jogo.data), 52)}
        ${div}
        ${col(icone('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'), "HORÁRIO", jogo.horario || "—", 52)}
        ${div}
        ${col(icone('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'), "LOCAL", campo?.nome || "A definir", 40)}
      </div>
      <div style="width:100%; text-align:center;">
        <div style="display:flex; align-items:center; gap:20px;"><div style="flex:1; height:3px; background:${DOURADO};"></div><div style="width:46px; height:46px; border-radius:50%; border:3px solid ${DOURADO};"></div><div style="flex:1; height:3px; background:${DOURADO};"></div></div>
        <div style="font-size:26px; letter-spacing:.34em; margin-top:22px;">RAÇA &nbsp;•&nbsp; UNIÃO &nbsp;•&nbsp; RESPEITO &nbsp;•&nbsp; VONTADE</div>
        <div style="font-size:18px; color:${T.faint}; letter-spacing:.06em; margin-top:16px;">Imagem gerada pelo app Bom D' Copus</div>
      </div>
    </div>`;
  }

  if (modelo === "convite"){
    const t = 330;
    return `<div style="${base}">${cantos}
      ${topo}
      ${tipo}
      <div style="display:flex; align-items:center; justify-content:center; gap:40px;">
        ${bdc.replace(/__T__/g, t)}
        <div style="font-family:'Bebas Neue',sans-serif; font-size:130px; color:${DOURADO}; line-height:1;">VS</div>
        ${escudoHtml(escudo, adv?.nome, t, T.accent)}
      </div>
      <div style="text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:104px; line-height:1.05; letter-spacing:.02em;">${escapeHtml((adv?.nome || "Adversário").toUpperCase())}</div>
      </div>
      ${faixa}
      <div style="text-align:center; font-size:46px; line-height:1.5;">
        <div style="font-weight:700; text-transform:uppercase;">${escapeHtml(data)}</div>
        ${jogo.horario ? `<div style="color:${DOURADO}; font-weight:700;">${escapeHtml(jogo.horario)}</div>` : ""}
        ${campo ? `<div style="color:${T.muted2}; font-size:40px;">${escapeHtml(campo.nome)}</div>` : ""}
      </div>
      ${rodape}
    </div>`;
  }

  if (modelo === "melhor"){
    const j = resumo.ranking.find(x => x.id === jogadorId) || resumo.ranking[0] || null;
    const info = j ? resumo.infoJogador(j.id) : { gols: 0, assists: 0, posicao: "" };
    const ph = formato === "story" ? 700 : 470;
    const placar = jogo.placarNos !== null && jogo.placarNos !== undefined ? `${jogo.placarNos} x ${jogo.placarAdversario ?? "–"}` : "";
    const feitos = [info.gols ? `${info.gols} gol${info.gols > 1 ? "s" : ""}` : "", info.assists ? `${info.assists} assistência${info.assists > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
    const quadro = foto
      ? `<img src="${foto}" style="width:${ph}px; height:${ph}px; object-fit:cover; border-radius:44px; border:10px solid ${DOURADO};">`
      : `<div style="width:${ph}px; height:${ph}px; border-radius:44px; border:10px solid ${DOURADO}; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:${Math.round(ph * 0.4)}px; color:${DOURADO};">${escapeHtml(iniciais(j?.nome))}</div>`;
    return `<div style="${base}">${cantos}
      ${topo}
      <div style="font-family:'Bebas Neue',sans-serif; font-size:76px; letter-spacing:.2em; color:${DOURADO};">MELHOR DO JOGO</div>
      ${quadro}
      <div style="text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:116px; line-height:1; letter-spacing:.02em;">${escapeHtml((j?.nome || "Jogador").toUpperCase())}</div>
        <div style="font-size:36px; color:${T.muted2}; margin-top:8px;">${escapeHtml([info.posicao, feitos].filter(Boolean).join(" · "))}</div>
      </div>
      ${j && j.nota !== null ? `<div style="border:4px solid ${DOURADO}; border-radius:26px; padding:10px 46px; text-align:center;"><div style="font-size:24px; letter-spacing:.16em; color:${DOURADO};">NOTA</div><div style="font-family:'Bebas Neue',sans-serif; font-size:100px; line-height:1;">${fmt1(j.nota)}</div></div>` : "<div></div>"}
      <div style="text-align:center; font-size:30px; color:${T.muted2}; line-height:1.4;">
        Bom D' Copus${placar ? ` ${escapeHtml(placar)}` : ""} ${escapeHtml(adv?.nome || "")}<br>${escapeHtml(data)}${campo ? ` · ${escapeHtml(campo.nome)}` : ""}
      </div>
      ${rodape}
    </div>`;
  }

  // Resultado
  const t = 210;
  const placar = `${jogo.placarNos ?? "–"} x ${jogo.placarAdversario ?? "–"}`;
  const res = resultadoJogo(jogo);
  const rotulo = res === "vitoria" ? "VITÓRIA" : res === "derrota" ? "DERROTA" : res === "empate" ? "EMPATE" : "";
  const maxGols = formato === "story" ? 14 : 8;
  const gols = resumo.gols.slice(0, maxGols).map(g =>
    `<div style="font-size:32px; line-height:1.35;">⚽ <strong>${escapeHtml(g.gol)}</strong>${g.assist ? ` <span style="color:${T.muted}; font-size:27px;">(assist. ${escapeHtml(g.assist)})</span>` : ""}</div>`).join("");
  const extra = resumo.gols.length > maxGols ? `<div style="font-size:26px; color:${T.muted};">+ ${resumo.gols.length - maxGols} gols</div>` : "";
  const dest = [];
  if (resumo.artilheiro) dest.push(["ARTILHEIRO", `${resumo.artilheiro.nomes.join(", ")}${resumo.artilheiro.max > 1 ? ` (${resumo.artilheiro.max})` : ""}`]);
  if (resumo.garcom) dest.push(["GARÇOM", `${resumo.garcom.nomes.join(", ")}${resumo.garcom.max > 1 ? ` (${resumo.garcom.max})` : ""}`]);
  if (resumo.melhorNota) dest.push(["MELHOR NOTA", `${resumo.melhorNota.nome} (${fmt1(resumo.melhorNota.nota)})`]);
  const destHtml = dest.length ? `
    <div style="display:flex; gap:20px; justify-content:center; flex-wrap:wrap;">
      ${dest.map(([l, v]) => `<div style="border:3px solid ${DOURADO}; border-radius:18px; padding:16px 26px; text-align:center;"><div style="font-size:24px; letter-spacing:.14em; color:${DOURADO};">${l}</div><div style="font-size:38px; font-weight:700;">${escapeHtml(v)}</div></div>`).join("")}
    </div>` : "";

  return `<div style="${base}">${cantos}
    ${topo}
    <div style="text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:56px; letter-spacing:.2em; color:${DOURADO};">${rotulo ? `${rotulo} · ` : ""}${escapeHtml(String(jogo.tipoPartida || "Amistoso").toUpperCase())}</div>
    </div>
    <div style="display:flex; align-items:center; justify-content:center; gap:24px;">
      ${bdc.replace(/__T__/g, t)}
      <div style="font-family:'Bebas Neue',sans-serif; font-size:200px; line-height:1; letter-spacing:.02em; white-space:nowrap;">${escapeHtml(placar)}</div>
      ${escudoHtml(escudo, adv?.nome, t, T.accent)}
    </div>
    <div style="text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:64px; line-height:1.1;">BOM D' COPUS x ${escapeHtml((adv?.nome || "Adversário").toUpperCase())}</div>
      <div style="font-size:32px; color:${T.muted2}; margin-top:10px;">${escapeHtml(data)}${campo ? ` · ${escapeHtml(campo.nome)}` : ""}</div>
    </div>
    ${gols ? `<div style="width:100%; text-align:left; padding:0 40px; box-sizing:border-box;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:44px; letter-spacing:.14em; color:${DOURADO}; margin-bottom:6px;">GOLS</div>
      ${gols}${extra}
    </div>` : "<div></div>"}
    ${destHtml || "<div></div>"}
    ${rodape}
  </div>`;
}

export function openFlyerModal(state, jogo){
  const adv = state.adversarios.find(a => a.id === jogo.adversarioId);
  const campo = state.campos.find(c => c.id === jogo.campoId);
  const resumo = resumoJogo(jogo, state.atletas);
  let escudo = adv?.escudo || "";
  let modelo = jogo.status === "realizado" && jogo.placarNos !== null && jogo.placarNos !== undefined ? "resultado" : "convite";
  let formato = "feed";
  let tema = "noite";

  openModal(`
    <div class="modal-head">
      <h3>Imagem do jogo</h3>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-grid" style="margin-bottom:12px;">
        <div class="field"><label>Modelo</label>
          <select id="fl-modelo">
            <option value="convite">Convite (antes do jogo)</option>
            <option value="resultado">Resultado (depois do jogo)</option>
            <option value="melhor">Melhor do jogo (jogador)</option>
          </select></div>
        <div class="field"><label>Fundo</label>
          <select id="fl-tema">${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}">${t.nome}</option>`).join("")}</select></div>
        <div class="field"><label>Formato</label>
          <select id="fl-formato">
            <option value="feed">Feed (4:5)</option>
            <option value="story">Story (9:16)</option>
          </select></div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer; margin:0;">
          <span id="fl-escudo-label"></span>
          <input type="file" id="fl-escudo" accept="image/*" style="display:none;">
        </label>
        <span style="font-size:12px; color:var(--ink-soft);">O escudo fica salvo no cadastro do adversário para os próximos jogos.</span>
      </div>
      <div id="fl-melhor-box" style="display:none; margin-bottom:12px;">
        <div class="form-grid">
          <div class="field"><label>Jogador</label><select id="fl-jogador"></select></div>
          <div class="field"><label>Foto do jogador</label><input type="file" id="fl-foto" accept="image/*"></div>
        </div>
        <span style="font-size:12px; color:var(--ink-soft);">Por padrão vem o jogador de maior nota do jogo. A foto não é salva: só vale para esta imagem.</span>
      </div>
      <div id="fl-prev-wrap" style="width:100%; max-width:420px; margin:0 auto; overflow:hidden; border-radius:10px; background:#111;"><div id="fl-prev" style="transform-origin:top left;"></div></div>
      <div class="form-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-ghost" data-close>Fechar</button>
        <button type="button" class="btn btn-ghost" id="fl-legenda">Copiar legenda</button>
        <button type="button" class="btn btn-ghost" id="fl-baixar">Baixar</button>
        <button type="button" class="btn btn-primary" id="fl-compartilhar">Compartilhar</button>
      </div>
    </div>
  `, { wide: true });

  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  $("#fl-modelo").value = modelo;

  let jogadorId = resumo.ranking[0]?.id || "";
  let foto = "";
  $("#fl-jogador").innerHTML = resumo.ranking.length
    ? resumo.ranking.map(x => `<option value="${x.id}">${escapeHtml(x.nome)}${x.nota !== null ? ` — ${fmt1(x.nota)}` : ""}</option>`).join("")
    : `<option value="">Nenhum jogador com nota ou escalação</option>`;
  const montar = () => flyerHtml({ modelo, formato, tema, jogo, adv, campo, escudo, resumo, jogadorId, foto });

  const desenhar = () => {
    $("#fl-melhor-box").style.display = modelo === "melhor" ? "" : "none";
    $("#fl-escudo-label").textContent = escudo ? "Trocar escudo do adversário" : "Adicionar escudo do adversário";
    const prev = $("#fl-prev");
    prev.innerHTML = montar();
    const wrap = $("#fl-prev-wrap");
    const k = wrap.clientWidth / 1080;
    prev.style.transform = `scale(${k})`;
    wrap.style.height = `${(formato === "story" ? 1920 : 1350) * k}px`;
  };
  desenhar();

  $("#fl-modelo").addEventListener("change", (e) => { modelo = e.target.value; desenhar(); });
  $("#fl-jogador").addEventListener("change", (e) => { jogadorId = e.target.value; foto = ""; $("#fl-foto").value = ""; desenhar(); });
  $("#fl-foto").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try{ foto = await reduzirFoto(f); desenhar(); }
    catch(err){ console.error(err); toast("Não foi possível usar essa foto.", "err"); }
  });
  $("#fl-tema").addEventListener("change", (e) => { tema = e.target.value; desenhar(); });
  $("#fl-formato").addEventListener("change", (e) => { formato = e.target.value; desenhar(); });

  $("#fl-escudo").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      escudo = await reduzirImagem(file);
      desenhar();
      if (adv){
        await saveDoc("adversarios", adv.id, { escudo });
        toast("Escudo salvo no cadastro do adversário.", "ok");
      }
    }catch(err){
      console.error(err);
      toast("Não foi possível usar essa imagem.", "err");
    }
  });

  // Gera o PNG em tamanho real (1080 de largura) numa cópia fora da tela.
  const gerarBlob = async () => {
    if (typeof html2canvas !== "function") throw new Error("Recurso de imagem indisponível.");
    const box = document.createElement("div");
    box.style.cssText = "position:fixed; left:-12000px; top:0;";
    box.innerHTML = montar();
    document.body.appendChild(box);
    try{
      const canvas = await html2canvas(box.firstElementChild, { backgroundColor: null, scale: 1, useCORS: true, windowWidth: 1200 });
      return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("Falha ao gerar a imagem.")), "image/png"));
    } finally {
      box.remove();
    }
  };
  const nomeArquivo = () => `${modelo}-bom-d-copus-${jogo.data || "jogo"}.png`;

  $("#fl-legenda").addEventListener("click", async () => {
    const texto = legendaTexto(modelo === "convite" ? "convite" : "resultado", { jogo, adv, campo, resumo });
    try{ await navigator.clipboard.writeText(texto); toast(`Legenda ${modelo === "convite" ? "do convite" : "do resultado"} copiada.`, "ok"); }
    catch(err){ toast("Não foi possível copiar a legenda.", "err"); }
  });

  $("#fl-baixar").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try{
      const blob = await gerarBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo();
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast("Imagem salva!", "ok");
    }catch(err){ console.error(err); toast("Erro ao gerar a imagem: " + err.message, "err"); }
    btn.disabled = false;
  });

  $("#fl-compartilhar").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try{
      const blob = await gerarBlob();
      const file = new File([blob], nomeArquivo(), { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        try{ await navigator.share({ files: [file], title: "Bom D' Copus" }); }
        catch(err){ if (err?.name !== "AbortError") throw err; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = nomeArquivo();
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast("Seu navegador não abre o compartilhar; a imagem foi baixada.", "ok");
      }
    }catch(err){ console.error(err); toast("Erro ao compartilhar: " + err.message, "err"); }
    btn.disabled = false;
  });
}
