// =====================================================================
// LEGADO DECOR — CONFIGURAÇÃO FIREBASE
// =====================================================================
// Quando a apiKey deixar de começar por "PASTE", a app passa a usar a
// nuvem (login, sync entre dispositivos). Caso contrário, modo local.
// =====================================================================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyA4q4U6aLrIN_xd4Wwa0Kw5H9Kj8NqCEhA",
  authDomain: "legado-decor.firebaseapp.com",
  projectId: "legado-decor",
  storageBucket: "legado-decor.firebasestorage.app",
  messagingSenderId: "987945512908",
  appId: "1:987945512908:web:d1a1a9d00fd7d5e2f27769",
  measurementId: "G-23GGMSHL3Z"
};

window.FIREBASE_ENABLED = !window.FIREBASE_CONFIG.apiKey.startsWith("PASTE");
