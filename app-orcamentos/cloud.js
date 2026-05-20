// =====================================================================
// SERRALVES DECOR — CLOUD LAYER (Firebase Auth + Firestore)
// =====================================================================
// Expõe window.Cloud com toda a lógica de nuvem.
// O index.html chama Cloud.boot() ao arrancar.
// Se FIREBASE_ENABLED for false, o módulo nem inicializa nada e a app
// funciona em modo local (como sempre funcionou).
// =====================================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  collection, getDocs, query, where, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const FB_VERSION = "10.13.2";
// Fixed single-tenant ID. This app serves a single company; one tenant is enough
// and lets the Firestore rules use a stricter `tid == 'main'` constraint.
const TENANT_ID = 'main';

const Cloud = window.Cloud = {
  enabled: !!window.FIREBASE_ENABLED,
  ready: false,
  app: null, auth: null, db: null,
  user: null,          // { uid, email, role, tenantId, name }
  tenantId: null,
  isOwner: () => Cloud.user && Cloud.user.role === 'owner',
  // listeners registered by index.html — called when remote data changes
  onChange: { config: null, produtos: null, tecidos: null, clientes: null, historico: null, contador: null },
  // unsubscribe handles
  _unsubs: [],
  _writeQueue: new Map(),
  _writeTimer: null,
};

// ---------- public boot ----------
Cloud.boot = async function () {
  if (!Cloud.enabled) {
    // hide auth UI, app loads as local-only
    document.getElementById('authOverlay')?.remove();
    document.getElementById('btnLogout')?.remove();
    document.querySelectorAll('[data-tab="equipa"]').forEach(b => b.style.display = 'none');
    return false;
  }

  // Init Firebase
  Cloud.app = getApps()[0] || initializeApp(window.FIREBASE_CONFIG);
  Cloud.db = initializeFirestore(Cloud.app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  Cloud.auth = getAuth(Cloud.app);
  try { await setPersistence(Cloud.auth, browserLocalPersistence); } catch {}

  // Bind auth screen handlers
  bindAuthUI();

  // Watch auth state
  onAuthStateChanged(Cloud.auth, async (fbUser) => {
    if (fbUser) {
      try {
        await onSignedIn(fbUser);
      } catch (err) {
        console.error('Sign-in setup failed', err);
        showAuthScreen('Erro ao carregar conta: ' + (err.message || err));
        try { await signOut(Cloud.auth); } catch {}
      }
    } else {
      showAuthScreen();
      detachListeners();
      Cloud.user = null; Cloud.tenantId = null; Cloud.ready = false;
      document.getElementById('appRoot')?.classList.add('hidden-until-auth');
    }
  });
  return true;
};

// ---------- AUTH SCREEN ----------
function showAuthScreen(errMsg) {
  const ov = document.getElementById('authOverlay');
  if (ov) {
    ov.style.display = 'flex';
    const el = document.getElementById('authError');
    if (el) { el.textContent = errMsg || ''; el.style.display = errMsg ? 'block' : 'none'; }
  }
}
function hideAuthScreen() {
  const ov = document.getElementById('authOverlay');
  if (ov) ov.style.display = 'none';
}

function bindAuthUI() {
  const $ = (s) => document.querySelector(s);
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.toggle('active', x === t));
    const which = t.dataset.auth;
    ['login', 'signup', 'forgot'].forEach(k => {
      const el = $('#authForm-' + k); if (el) el.style.display = (k === which) ? 'block' : 'none';
    });
    const err = $('#authError'); if (err) { err.textContent=''; err.style.display='none'; }
  }));

  $('#btnAuthLogin')?.addEventListener('click', async () => {
    const email = ($('#loginEmail').value || '').trim();
    const pwd = $('#loginPwd').value || '';
    if (!email || !pwd) return setAuthErr('Indica email e palavra-passe.');
    setAuthBusy(true);
    try { await signInWithEmailAndPassword(Cloud.auth, email, pwd); }
    catch (e) { setAuthErr(humanAuthErr(e)); }
    finally { setAuthBusy(false); }
  });

  $('#btnAuthSignup')?.addEventListener('click', async () => {
    const email = ($('#signupEmail').value || '').trim();
    const pwd = $('#signupPwd').value || '';
    const pwd2 = $('#signupPwd2').value || '';
    if (!email || !pwd) return setAuthErr('Indica email e palavra-passe.');
    if (pwd.length < 8) return setAuthErr('Palavra-passe muito curta (mínimo 8).');
    if (pwd !== pwd2) return setAuthErr('As palavras-passe não coincidem.');
    setAuthBusy(true);
    try {
      // First user becomes owner; subsequent signups blocked unless invited by owner.
      const tenantSnap = await getDoc(doc(Cloud.db, 'tenants', TENANT_ID));
      if (tenantSnap.exists()) {
        setAuthErr('Já existe uma conta. Pede ao administrador para criar o teu acesso.');
        setAuthBusy(false);
        return;
      }
      await createUserWithEmailAndPassword(Cloud.auth, email, pwd);
      // onAuthStateChanged will fire onSignedIn which provisions the tenant
    } catch (e) { setAuthErr(humanAuthErr(e)); }
    finally { setAuthBusy(false); }
  });

  $('#btnAuthForgot')?.addEventListener('click', async () => {
    const email = ($('#forgotEmail').value || '').trim();
    if (!email) return setAuthErr('Indica o email.');
    setAuthBusy(true);
    try {
      await sendPasswordResetEmail(Cloud.auth, email);
      setAuthErr('Email enviado. Verifica a caixa de entrada (e spam).', true);
    } catch (e) { setAuthErr(humanAuthErr(e)); }
    finally { setAuthBusy(false); }
  });
}

function setAuthErr(msg, ok) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.style.color = ok ? 'var(--ok)' : 'var(--err)';
}
function setAuthBusy(busy) {
  document.querySelectorAll('#authOverlay button, #authOverlay input').forEach(el => { el.disabled = !!busy; });
}
function humanAuthErr(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found')
    return 'Email ou palavra-passe incorrectos.';
  if (c === 'auth/email-already-in-use') return 'Esse email já está registado.';
  if (c === 'auth/weak-password') return 'Palavra-passe demasiado fraca.';
  if (c === 'auth/invalid-email') return 'Email inválido.';
  if (c === 'auth/too-many-requests') return 'Demasiadas tentativas. Tenta daqui a pouco.';
  if (c === 'auth/network-request-failed') return 'Sem ligação. Verifica a internet.';
  return (e && e.message) || 'Erro inesperado.';
}

// ---------- POST-LOGIN ----------
async function onSignedIn(fbUser) {
  // Look up user doc — has tenantId + role
  const userRef = doc(Cloud.db, 'users', fbUser.uid);
  let userSnap = await getDoc(userRef);
  let userDoc = userSnap.exists() ? userSnap.data() : null;

  if (!userDoc) {
    // No user record. Two cases:
    //  (a) Brand-new install — this user is the first signup. Provision tenant + owner.
    //  (b) Account exists but wasn't properly provisioned (e.g. self-signup on
    //      an already-bootstrapped system). Refuse — owner must invite them.
    const tenantSnap = await getDoc(doc(Cloud.db, 'tenants', TENANT_ID));
    if (!tenantSnap.exists()) {
      await runTransaction(Cloud.db, async (tx) => {
        tx.set(doc(Cloud.db, 'tenants', TENANT_ID), {
          name: 'Serralves Decor', createdAt: serverTimestamp(), createdBy: fbUser.uid
        });
        tx.set(doc(Cloud.db, 'tenants', TENANT_ID, 'members', fbUser.uid), {
          email: fbUser.email, role: 'owner', active: true, createdAt: serverTimestamp()
        });
        tx.set(doc(Cloud.db, 'users', fbUser.uid), {
          tenantId: TENANT_ID, email: fbUser.email, role: 'owner', createdAt: serverTimestamp()
        });
      });
      userDoc = { tenantId: TENANT_ID, email: fbUser.email, role: 'owner' };
    } else {
      throw new Error('Conta sem permissão. O administrador tem de criar o teu acesso na secção Equipa.');
    }
  }

  Cloud.tenantId = userDoc.tenantId;
  Cloud.user = { uid: fbUser.uid, email: fbUser.email, role: userDoc.role || 'user', tenantId: userDoc.tenantId };

  // Check membership is active
  const memSnap = await getDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', fbUser.uid));
  if (memSnap.exists()) {
    const m = memSnap.data();
    if (m.active === false) throw new Error('Conta desactivada. Contacta o administrador.');
    Cloud.user.role = m.role || Cloud.user.role;
  }

  // Show app
  hideAuthScreen();
  document.getElementById('appRoot')?.classList.remove('hidden-until-auth');
  document.getElementById('userBadge') && (document.getElementById('userBadge').textContent = Cloud.user.email);
  document.querySelectorAll('[data-tab="equipa"]').forEach(b => b.style.display = Cloud.isOwner() ? '' : 'none');

  // Initial load: pull cloud data; if absent, push local data (migration).
  await initialSyncAndAttach();
  Cloud.ready = true;
  // Tell the app the first paint can happen
  document.dispatchEvent(new CustomEvent('cloud:ready'));
}

// ---------- DATA SYNC ----------
// Mapping localStorage key → Firestore doc path under /tenants/{tid}/data/
const KEYS = ['config', 'produtos', 'tecidos', 'clientes', 'historico', 'contador'];
const localKey = (k) => 'sd_' + k;
const dataRef = (k) => doc(Cloud.db, 'tenants', Cloud.tenantId, 'data', k);

async function initialSyncAndAttach() {
  // Read each doc; if missing, push the local copy (one-time migration).
  for (const k of KEYS) {
    const ref = dataRef(k);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // Migrate from localStorage if present
      const raw = localStorage.getItem(localKey(k));
      const value = raw != null ? safeParse(raw) : null;
      if (value != null) {
        await setDoc(ref, { value, updatedAt: serverTimestamp(), updatedBy: Cloud.user.uid });
      }
    } else {
      // Cloud wins on startup — overwrite local cache
      const v = snap.data().value;
      try { localStorage.setItem(localKey(k), JSON.stringify(v)); } catch {}
      // Notify the app to refresh its in-memory state
      try { Cloud.onChange[k] && Cloud.onChange[k](v); } catch (e) { console.warn(e); }
    }
  }

  // Attach realtime listeners
  for (const k of KEYS) {
    const u = onSnapshot(dataRef(k), (snap) => {
      if (!snap.exists()) return;
      const v = snap.data().value;
      try { localStorage.setItem(localKey(k), JSON.stringify(v)); } catch {}
      try { Cloud.onChange[k] && Cloud.onChange[k](v); } catch (e) { console.warn(e); }
    }, (err) => console.warn('Listener', k, err));
    Cloud._unsubs.push(u);
  }
}

function detachListeners() {
  Cloud._unsubs.forEach(u => { try { u(); } catch {} });
  Cloud._unsubs = [];
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// ---------- WRITE (debounced) ----------
// Called by the app whenever local state changes.
Cloud.push = function (key, value) {
  if (!Cloud.ready || !KEYS.includes(key)) return;
  Cloud._writeQueue.set(key, value);
  if (Cloud._writeTimer) clearTimeout(Cloud._writeTimer);
  Cloud._writeTimer = setTimeout(flushQueue, 350);
};

async function flushQueue() {
  if (!Cloud.ready) return;
  const items = Array.from(Cloud._writeQueue.entries());
  Cloud._writeQueue.clear();
  for (const [k, value] of items) {
    try {
      await setDoc(dataRef(k), { value, updatedAt: serverTimestamp(), updatedBy: Cloud.user.uid }, { merge: true });
    } catch (err) {
      // Firestore SDK queues writes offline automatically; this catch is for
      // permission/network shape errors. Keep the local copy and warn.
      console.warn('Cloud write failed', k, err);
    }
  }
}

// ---------- SESSION ----------
Cloud.logout = async function () {
  try { detachListeners(); } catch {}
  try { await signOut(Cloud.auth); } catch (e) { console.warn(e); }
};

Cloud.changePassword = async function (currentPwd, newPwd) {
  const user = Cloud.auth.currentUser;
  if (!user) throw new Error('Sem sessão.');
  const cred = EmailAuthProvider.credential(user.email, currentPwd);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPwd);
};

// ---------- MEMBERS (owner only) ----------
Cloud.listMembers = async function () {
  const col = collection(Cloud.db, 'tenants', Cloud.tenantId, 'members');
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
};

Cloud.inviteMember = async function (email, password, role) {
  // Create a *secondary* Firebase app instance so we don't lose the owner session.
  const secApp = initializeApp(window.FIREBASE_CONFIG, 'secondary-' + Date.now());
  const secAuth = getAuth(secApp);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    const newUid = cred.user.uid;
    await Promise.all([
      setDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', newUid), {
        email, role: role || 'user', active: true, createdAt: serverTimestamp(), createdBy: Cloud.user.uid
      }),
      setDoc(doc(Cloud.db, 'users', newUid), {
        tenantId: Cloud.tenantId, email, role: role || 'user', createdAt: serverTimestamp()
      })
    ]);
    try { await signOut(secAuth); } catch {}
    return newUid;
  } finally {
    // Clean up the secondary app (it's leaked otherwise)
    try { await secApp.delete(); } catch {}
  }
};

Cloud.setMemberRole = async function (uid, role) {
  if (uid === Cloud.user.uid && role !== 'owner') throw new Error('Não te podes despromover a ti próprio.');
  await Promise.all([
    updateDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', uid), { role }),
    updateDoc(doc(Cloud.db, 'users', uid), { role })
  ]);
};

Cloud.setMemberActive = async function (uid, active) {
  if (uid === Cloud.user.uid && !active) throw new Error('Não te podes desactivar a ti próprio.');
  await updateDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', uid), { active: !!active });
};

Cloud.removeMember = async function (uid) {
  if (uid === Cloud.user.uid) throw new Error('Não te podes remover a ti próprio.');
  // Note: this only removes Firestore records. To delete the actual Auth user
  // requires the Firebase Admin SDK (server side). We leave them as "inactive".
  await Promise.all([
    deleteDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', uid)),
    deleteDoc(doc(Cloud.db, 'users', uid))
  ]);
};

// ---------- boot ----------
// Don't auto-boot here — index.html calls Cloud.boot() after DOM ready
// to give the auth overlay time to render.
