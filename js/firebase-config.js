// ============================================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================================
// 1. Crie um projeto em https://console.firebase.google.com
// 2. Ative "Authentication" > método "Google"
// 3. Ative "Firestore Database" (modo produção) e cole as regras do README
// 4. Em "Configurações do projeto" > "Seus apps" > Web, copie o objeto de
//    config e cole abaixo, substituindo os valores de exemplo.
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyA1nJrPpSq57MDJPRWgd1g8fo3qD18a2Yg",
  authDomain: "bom-d--copus-04.firebaseapp.com",
  projectId: "bom-d--copus-04",
  storageBucket: "bom-d--copus-04.firebasestorage.app",
  messagingSenderId: "744696807209",
  appId: "1:744696807209:web:e7b05bfc9cd541f0d18138",
  measurementId: "G-9Q1DTLY0GR"
};

// E-mails autorizados a acessar o app (deixe [] para liberar qualquer conta
// Google — mas o ideal é restringir aos e-mails do time/comissão técnica).
// Isso é só uma checagem de conveniência na tela; a segurança de verdade
// vem das regras do Firestore (veja README.md).
export const ALLOWED_EMAILS = [
  "lucas.rf.nascimento@gmail.com",
  "diogohenrique1334@gmail.com",
  "vitorsds6@gmail.com",
  "juniorpereirasilas@gmail.com",
  "naty16br@gmail.com",
  "vinipp7365@gmail.com"
];
