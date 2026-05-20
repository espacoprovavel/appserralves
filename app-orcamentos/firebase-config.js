// =====================================================================
// SERRALVES DECOR — CONFIGURAÇÃO FIREBASE
// =====================================================================
// Quando a apiKey deixar de começar por "PASTE", a app passa a usar a
// nuvem (login, sync entre dispositivos). Caso contrário, modo local.
// =====================================================================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSNrnw4CLnIRV9KFHk4si9KyyesSixV9k",
  authDomain: "serralves-decor.firebaseapp.com",
  projectId: "serralves-decor",
  storageBucket: "serralves-decor.firebasestorage.app",
  messagingSenderId: "607466651313",
  appId: "1:607466651313:web:18afc8e6ea93359be92c90",
  measurementId: "G-RFGJMM01F4"
};

window.FIREBASE_ENABLED = !window.FIREBASE_CONFIG.apiKey.startsWith("PASTE");
