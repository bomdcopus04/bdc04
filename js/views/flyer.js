import { $, $$, escapeHtml, openModal, closeModal, toast, formatDateLong, avg, fmt1 } from "../utils.js";
import { saveDoc } from "../db.js";
import { notasDoAtletaNoJogo, resultadoJogo, GOL_CONTRA_ID } from "../stats.js";

// Imagem (flyer) da partida pra compartilhar no WhatsApp: modelo "Convite"
// (antes do jogo) e "Resultado" (depois). O escudo do adversário é enviado
// uma vez (da galeria do celular), reduzido no navegador e guardado no
// cadastro do adversário pra ser reaproveitado nos próximos jogos.

const DOURADO = "#E4B62B";
const ESCUDO_MAX = 192; // px — pequeno de propósito (vai dentro do documento do adversário)

function iniciais(nome){
  return (nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function escudoHtml(src, nome, tam){
  if (src){
    return `<img src="${src}" style="width:${tam}px; height:${tam}px; object-fit:contain;">`;
  }
  return `<div style="width:${tam}px; height:${tam}px; border-radius:50%; border:6px solid ${DOURADO}; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:${Math.round(tam * 0.4)}px; color:${DOURADO};">${escapeHtml(iniciais(nome))}</div>`;
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
    return max > 0 ? { max, nomes: Object.keys(m).filter(id => m[id] === max).map(nome) } : null;
  };
  let melhorNota = null;
  Object.keys(jogo.avaliacoesJogadores || {}).forEach(id => {
    const n = avg(notasDoAtletaNoJogo(jogo, id));
    if (n !== null && (!melhorNota || n > melhorNota.nota)) melhorNota = { nota: n, nome: nome(id) };
  });
  return { gols, artilheiro: conta("atletaGolId"), garcom: conta("atletaAssistId"), melhorNota };
}

function flyerHtml({ modelo, formato, jogo, adv, campo, escudo, resumo }){
  const W = 1080;
  const H = formato === "story" ? 1920 : 1350;
  const base = `width:${W}px; height:${H}px; box-sizing:border-box; padding:80px 70px; background:linear-gradient(180deg,#0d0d0d 0%,#1d1d1d 100%); color:#fff; font-family:'Inter',system-ui,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:space-between; position:relative; overflow:hidden;`;
  const topo = `
    <div style="display:flex; align-items:center; gap:22px;">
      <img src="assets/logo-bomdcopus.png" style="width:96px; height:96px; border-radius:50%; object-fit:cover;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:72px; letter-spacing:.04em; line-height:1;">BOM D' COPUS</div>
    </div>`;
  const tipo = jogo.tipoPartida ? `<div style="font-family:'Bebas Neue',sans-serif; font-size:50px; letter-spacing:.2em; color:${DOURADO};">${escapeHtml(String(jogo.tipoPartida).toUpperCase())}</div>` : "<div></div>";
  const data = formatDateLong(jogo.data);
  const rodape = `<div style="font-size:26px; color:#8a8a8a; letter-spacing:.12em;">BOM D' COPUS · GESTÃO DO TIME</div>`;
  const faixa = `<div style="width:220px; height:6px; background:${DOURADO}; border-radius:3px;"></div>`;
  const bdc = `<img src="assets/logo-bomdcopus.png" style="width:__T__px; height:__T__px; border-radius:50%; object-fit:cover;">`;

  if (modelo === "convite"){
    const t = 330;
    return `<div style="${base}">
      ${topo}
      ${tipo}
      <div style="display:flex; align-items:center; justify-content:center; gap:40px;">
        ${bdc.replace(/__T__/g, t)}
        <div style="font-family:'Bebas Neue',sans-serif; font-size:130px; color:${DOURADO}; line-height:1;">VS</div>
        ${escudoHtml(escudo, adv?.nome, t)}
      </div>
      <div style="text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:104px; line-height:1.05; letter-spacing:.02em;">${escapeHtml((adv?.nome || "Adversário").toUpperCase())}</div>
      </div>
      ${faixa}
      <div style="text-align:center; font-size:46px; line-height:1.5;">
        <div style="font-weight:700; text-transform:uppercase;">${escapeHtml(data)}</div>
        ${jogo.horario ? `<div style="color:${DOURADO}; font-weight:700;">${escapeHtml(jogo.horario)}</div>` : ""}
        ${campo ? `<div style="color:#d6d6d6; font-size:40px;">${escapeHtml(campo.nome)}</div>` : ""}
      </div>
      ${rodape}
    </div>`;
  }

  // Resultado
  const t = 240;
  const placar = `${jogo.placarNos ?? "–"} x ${jogo.placarAdversario ?? "–"}`;
  const res = resultadoJogo(jogo);
  const rotulo = res === "vitoria" ? "VITÓRIA" : res === "derrota" ? "DERROTA" : res === "empate" ? "EMPATE" : "";
  const maxGols = formato === "story" ? 14 : 8;
  const gols = resumo.gols.slice(0, maxGols).map(g =>
    `<div style="font-size:40px; line-height:1.35;">⚽ <strong>${escapeHtml(g.gol)}</strong>${g.assist ? ` <span style="color:#a9a9a9; font-size:34px;">(assist. ${escapeHtml(g.assist)})</span>` : ""}</div>`).join("");
  const extra = resumo.gols.length > maxGols ? `<div style="font-size:30px; color:#a9a9a9;">+ ${resumo.gols.length - maxGols} gols</div>` : "";
  const dest = [];
  if (resumo.artilheiro) dest.push(["ARTILHEIRO", `${resumo.artilheiro.nomes.join(", ")}${resumo.artilheiro.max > 1 ? ` (${resumo.artilheiro.max})` : ""}`]);
  if (resumo.garcom) dest.push(["GARÇOM", `${resumo.garcom.nomes.join(", ")}${resumo.garcom.max > 1 ? ` (${resumo.garcom.max})` : ""}`]);
  if (resumo.melhorNota) dest.push(["MELHOR NOTA", `${resumo.melhorNota.nome} (${fmt1(resumo.melhorNota.nota)})`]);
  const destHtml = dest.length ? `
    <div style="display:flex; gap:20px; justify-content:center; flex-wrap:wrap;">
      ${dest.map(([l, v]) => `<div style="border:3px solid ${DOURADO}; border-radius:18px; padding:16px 26px; text-align:center;"><div style="font-size:24px; letter-spacing:.14em; color:${DOURADO};">${l}</div><div style="font-size:38px; font-weight:700;">${escapeHtml(v)}</div></div>`).join("")}
    </div>` : "";

  return `<div style="${base}">
    ${topo}
    <div style="text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:56px; letter-spacing:.2em; color:${DOURADO};">${rotulo ? `${rotulo} · ` : ""}${escapeHtml(String(jogo.tipoPartida || "Amistoso").toUpperCase())}</div>
    </div>
    <div style="display:flex; align-items:center; justify-content:center; gap:30px;">
      ${bdc.replace(/__T__/g, t)}
      <div style="font-family:'Bebas Neue',sans-serif; font-size:230px; line-height:1; letter-spacing:.02em;">${escapeHtml(placar)}</div>
      ${escudoHtml(escudo, adv?.nome, t)}
    </div>
    <div style="text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:64px; line-height:1.1;">BOM D' COPUS x ${escapeHtml((adv?.nome || "Adversário").toUpperCase())}</div>
      <div style="font-size:32px; color:#cfcfcf; margin-top:10px;">${escapeHtml(data)}${campo ? ` · ${escapeHtml(campo.nome)}` : ""}</div>
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
          </select></div>
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
      <div id="fl-prev-wrap" style="width:100%; max-width:420px; margin:0 auto; overflow:hidden; border-radius:10px; background:#111;"><div id="fl-prev" style="transform-origin:top left;"></div></div>
      <div class="form-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-ghost" data-close>Fechar</button>
        <button type="button" class="btn btn-ghost" id="fl-baixar">Baixar</button>
        <button type="button" class="btn btn-primary" id="fl-compartilhar">Compartilhar</button>
      </div>
    </div>
  `, { wide: true });

  $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  $("#fl-modelo").value = modelo;

  const montar = () => flyerHtml({ modelo, formato, jogo, adv, campo, escudo, resumo });

  const desenhar = () => {
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
      const canvas = await html2canvas(box.firstElementChild, { backgroundColor: "#111111", scale: 1, useCORS: true, windowWidth: 1200 });
      return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("Falha ao gerar a imagem.")), "image/png"));
    } finally {
      box.remove();
    }
  };
  const nomeArquivo = `${modelo}-bom-d-copus-${jogo.data || "jogo"}.png`;

  $("#fl-baixar").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try{
      const blob = await gerarBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo;
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
      const file = new File([blob], nomeArquivo, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        try{ await navigator.share({ files: [file], title: "Bom D' Copus" }); }
        catch(err){ if (err?.name !== "AbortError") throw err; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = nomeArquivo;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast("Seu navegador não abre o compartilhar; a imagem foi baixada.", "ok");
      }
    }catch(err){ console.error(err); toast("Erro ao compartilhar: " + err.message, "err"); }
    btn.disabled = false;
  });
}
