import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, where, serverTimestamp, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "./auth.js";

// ----------------------------------------------------------------------------
// Generic collection helpers (adversarios, campos, atletas, jogos)
// ----------------------------------------------------------------------------

export function listenCollection(name, orderField, cb){
  const q = query(collection(db, name), orderBy(orderField, orderField === "data" ? "desc" : "asc"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    cb(items);
  }, (err) => {
    console.error(`Erro ao ouvir ${name}:`, err);
    cb([], err);
  });
}

export async function createDoc(name, data){
  return addDoc(collection(db, name), { ...data, criadoEm: serverTimestamp() });
}

export async function saveDoc(name, id, data){
  return updateDoc(doc(db, name, id), data);
}

export async function removeDoc(name, id){
  return deleteDoc(doc(db, name, id));
}

// Cria (ou sobrescreve) um documento com um id escolhido por quem chama, em
// vez de deixar o Firestore gerar um id aleatório — usado pra mensalidades
// (id = mês + atleta), onde marcar/desmarcar "pago" precisa ser uma
// operação idempotente (criar de novo com o mesmo id só atualiza o valor).
export async function createDocWithId(name, id, data){
  return setDoc(doc(db, name, id), { ...data, criadoEm: serverTimestamp() });
}

// Ouve um único documento em tempo real (diferente de listenCollection, que
// ouve uma coleção inteira) — usado pra configurações gerais, como o valor
// atual da mensalidade.
export function listenDoc(name, id, cb){
  return onSnapshot(doc(db, name, id), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => {
    console.error(`Erro ao ouvir ${name}/${id}:`, err);
    cb(null, err);
  });
}

// ----------------------------------------------------------------------------
// Presenças (confirmação de presença por jogo) — coleção pública: qualquer
// pessoa com o link do jogo pode marcar. Doc id = `${jogoId}_${atletaId}`,
// então responder de novo só sobrescreve a resposta anterior.
// ----------------------------------------------------------------------------

export function listenPresencas(jogoId, cb){
  const q = query(collection(db, "presencas"), where("jogoId", "==", jogoId));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    cb(items);
  }, (err) => {
    console.error("Erro ao ouvir presencas:", err);
    cb([], err);
  });
}

export async function setPresenca(jogoId, atletaId, resposta){
  return setDoc(doc(db, "presencas", `${jogoId}_${atletaId}`), {
    jogoId, atletaId, resposta, atualizadoEm: serverTimestamp(),
  });
}

// ----------------------------------------------------------------------------
// Documentos "privados" (ex: atletas_privado) — mesmo id do documento
// público correspondente, leitura/escrita restrita a e-mails autorizados
// pelas regras do Firestore.
// ----------------------------------------------------------------------------

export async function setPrivateDoc(name, id, data){
  return setDoc(doc(db, name, id), data, { merge: true });
}

export async function getPrivateDoc(name, id){
  const snap = await getDoc(doc(db, name, id));
  return snap.exists() ? snap.data() : {};
}

// ----------------------------------------------------------------------------
// Jogo — campos aninhados (escalação, gols/assistências, avaliações)
// Tudo fica dentro do próprio documento do jogo para manter a consulta simples.
// ----------------------------------------------------------------------------

export async function updateJogoField(jogoId, fields){
  return updateDoc(doc(db, "jogos", jogoId), fields);
}
