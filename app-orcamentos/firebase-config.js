// =====================================================================
// SERRALVES DECOR — CONFIGURAÇÃO FIREBASE
// =====================================================================
// Este ficheiro contém as chaves do projecto Firebase.
// Para activar a sincronização na nuvem, edita os valores abaixo
// com os dados que o Firebase Console te dá ao criar a app web.
//
// Vê o ficheiro firebase/SETUP.md para o guia passo-a-passo.
// =====================================================================

window.FIREBASE_CONFIG = {
  apiKey: "PASTE_AQUI",
  authDomain: "PASTE_AQUI.firebaseapp.com",
  projectId: "PASTE_AQUI",
  storageBucket: "PASTE_AQUI.appspot.com",
  messagingSenderId: "PASTE_AQUI",
  appId: "PASTE_AQUI"
};

// Quando preencheres acima e fizeres reload, a app passa a usar a nuvem.
// Enquanto estiver "PASTE_AQUI", a app funciona em modo local (como antes).
window.FIREBASE_ENABLED = !window.FIREBASE_CONFIG.apiKey.startsWith("PASTE");
