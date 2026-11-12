import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../auth.js";
import { $, toast, escapeHtml, todayISO } from "../utils.js";

// ============================================================================
// Backup completo (só leitura): baixa um arquivo .json com todos os dados do
// time. Esse arquivo é o que o app "Gestão na Várzea" importa para trazer o
// Bom D' Copus para dentro dele. Nada é alterado aqui.
// ============================================================================

const COLECOES = ["adversarios", "campos", "atletas", "atletas_privado", "jogos", "financeiro", "configuracoes", "presencas"];

const NOMES = {
  adversarios: "Adversários", campos: "Campos", atletas: "Atletas",
  atletas_privado: "Atletas (dados privados)", jogos: "Jogos", financeiro: "Financeiro",
  configuracoes: "Configurações", presencas: "Confirmações de presença",
};

// Datas do Firestore viram { __ts: milissegundos } para caber no arquivo JSON.
function codificar(v){
  if (v === null || v === undefined) return v;
  if (typeof v.toMillis === "function") return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(codificar);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, codificar(x)]));
  return v;
}

async function gerarBackup(){
  const colecoes = {}, contagens = {}, falhas = [];
  for (const nome of COLECOES){
    try{
      const snap = await getDocs(collection(db, nome));
      colecoes[nome] = snap.docs.map(d => ({ id: d.id, dados: codificar(d.data()) }));
      contagens[nome] = colecoes[nome].length;
    }catch(err){
      console.error("Backup — falha em", nome, err);
      falhas.push(nome);
    }
  }
  return {
    backup: { formato: "gestao-time-backup", versao: 1, origem: "bdc04", geradoEm: new Date().toISOString(), contagens, colecoes },
    contagens, falhas,
  };
}

function baixar(objeto, nomeArquivo){
  const blob = new Blob([JSON.stringify(objeto)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function renderBackup(root){
  root.innerHTML = `
    <div class="topbar"><div><div class="eyebrow">Gestão</div><h1>Backup dos dados</h1></div></div>
    <div class="card card-pad">
      <div class="card-title">Baixar backup completo</div>
      <div class="card-sub">Gera um arquivo com atletas (inclusive CPF e nascimento), adversários, campos, jogos, financeiro e presenças. Guarde o arquivo em lugar seguro: ele tem dados pessoais. Este botão só lê os dados, não altera nada.</div>
      <div class="form-actions" style="justify-content:flex-start;"><button class="btn btn-primary" id="btn-baixar-backup">Baixar backup</button></div>
      <div id="backup-resultado" style="margin-top:14px;"></div>
    </div>`;

  $("#btn-baixar-backup", root).addEventListener("click", async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = "Gerando…";
    const { backup, contagens, falhas } = await gerarBackup();
    if (falhas.length){
      toast("Não consegui ler: " + falhas.map(f => NOMES[f]).join(", ") + ". Confira se você está logado com um e-mail autorizado.", "err");
    } else {
      baixar(backup, `backup-bomdcopus-${todayISO()}.json`);
      toast("Backup baixado.", "ok");
    }
    const linhas = COLECOES.map(n => `<tr><td>${escapeHtml(NOMES[n])}</td><td style="text-align:right;">${n in contagens ? contagens[n] : "erro"}</td></tr>`).join("");
    $("#backup-resultado", root).innerHTML = `
      <div class="card-sub" style="margin-bottom:6px;">Registros no arquivo (confira depois na importação):</div>
      <div class="table-wrap"><table><thead><tr><th>Coleção</th><th style="text-align:right;">Registros</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
    btn.disabled = false; btn.textContent = "Baixar backup";
  });
}
