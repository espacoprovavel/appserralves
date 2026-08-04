// =====================================================================
// LEGADO DECOR — CLOUD LAYER (Firebase Auth + Firestore)
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
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, addDoc,
  collection, getDocs, query, orderBy, limit, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const TENANT_ID = 'main';

const Cloud = window.Cloud = {
  enabled: !!window.FIREBASE_ENABLED,
  ready: false,
  app: null, auth: null, db: null,
  // user: { uid, email, name, role, tenantId }
  // roles: master > owner > user
  user: null,
  tenantId: null,
  // master: vê tudo, pode gerir funções incluindo master
  // owner: administrador normal, gere equipa e config
  // user: utilizador, cria orçamentos mas não altera config
  isMaster: () => Cloud.user && Cloud.user.role === 'master',
  isOwner: () => Cloud.user && (Cloud.user.role === 'owner' || Cloud.user.role === 'master'),
  onChange: { config: null, produtos: null, tecidos: null, clientes: null, historico: null, contador: null },
  _unsubs: [],
  _writeQueue: new Map(),
  _writeTimer: null,
};

// ---------- public boot ----------
Cloud.boot = async function () {
  if (!Cloud.enabled) {
    document.getElementById('authOverlay')?.remove();
    document.getElementById('btnLogout')?.remove();
    document.querySelectorAll('[data-tab="equipa"]').forEach(b => b.style.display = 'none');
    return false;
  }

  Cloud.app = getApps()[0] || initializeApp(window.FIREBASE_CONFIG);
  Cloud.db = initializeFirestore(Cloud.app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  Cloud.auth = getAuth(Cloud.app);
  try { await setPersistence(Cloud.auth, browserLocalPersistence); } catch {}

  bindAuthUI();

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
    const name = ($('#signupName').value || '').trim();
    const email = ($('#signupEmail').value || '').trim();
    const pwd = $('#signupPwd').value || '';
    const pwd2 = $('#signupPwd2').value || '';
    if (!name) return setAuthErr('Indica o teu nome.');
    if (!email || !pwd) return setAuthErr('Indica email e palavra-passe.');
    if (pwd.length < 8) return setAuthErr('Palavra-passe muito curta (mínimo 8).');
    if (pwd !== pwd2) return setAuthErr('As palavras-passe não coincidem.');
    setAuthBusy(true);
    try {
      const tenantSnap = await getDoc(doc(Cloud.db, 'tenants', TENANT_ID));
      if (tenantSnap.exists()) {
        setAuthErr('Já existe uma conta. Pede ao administrador para criar o teu acesso.');
        setAuthBusy(false);
        return;
      }
      // Bridge name to onSignedIn which fires via auth state change
      window._pendingSignupName = name;
      await createUserWithEmailAndPassword(Cloud.auth, email, pwd);
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
  const userRef = doc(Cloud.db, 'users', fbUser.uid);
  let userSnap = await getDoc(userRef);
  let userDoc = userSnap.exists() ? userSnap.data() : null;

  if (!userDoc) {
    const tenantSnap = await getDoc(doc(Cloud.db, 'tenants', TENANT_ID));
    if (!tenantSnap.exists()) {
      // First user → master (acima de owner, vê tudo)
      const firstName = window._pendingSignupName || fbUser.email.split('@')[0];
      window._pendingSignupName = null;
      await runTransaction(Cloud.db, async (tx) => {
        tx.set(doc(Cloud.db, 'tenants', TENANT_ID), {
          name: 'Legado Decor', createdAt: serverTimestamp(), createdBy: fbUser.uid
        });
        tx.set(doc(Cloud.db, 'tenants', TENANT_ID, 'members', fbUser.uid), {
          email: fbUser.email, name: firstName, role: 'master', active: true, createdAt: serverTimestamp()
        });
        tx.set(doc(Cloud.db, 'users', fbUser.uid), {
          tenantId: TENANT_ID, email: fbUser.email, name: firstName, role: 'master', createdAt: serverTimestamp()
        });
      });
      userDoc = { tenantId: TENANT_ID, email: fbUser.email, name: firstName, role: 'master' };
    } else {
      throw new Error('Conta sem permissão. O administrador tem de criar o teu acesso na secção Equipa.');
    }
  }

  Cloud.tenantId = userDoc.tenantId;
  Cloud.user = {
    uid: fbUser.uid,
    email: fbUser.email,
    name: userDoc.name || '',
    role: userDoc.role || 'user',
    tenantId: userDoc.tenantId
  };

  // Check membership is active and get latest role + name
  const memSnap = await getDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', fbUser.uid));
  if (memSnap.exists()) {
    const m = memSnap.data();
    if (m.active === false) throw new Error('Conta desactivada. Contacta o administrador.');
    Cloud.user.role = m.role || Cloud.user.role;
    Cloud.user.name = m.name || Cloud.user.name;
  }

  // Show app
  hideAuthScreen();
  document.getElementById('appRoot')?.classList.remove('hidden-until-auth');
  const badge = document.getElementById('userBadge');
  if (badge) badge.textContent = Cloud.user.name || Cloud.user.email;
  document.querySelectorAll('[data-tab="equipa"]').forEach(b => b.style.display = Cloud.isOwner() ? '' : 'none');
  document.querySelectorAll('[data-tab="registo"]').forEach(b => b.style.display = Cloud.isMaster() ? '' : 'none');

  await initialSyncAndAttach();
  Cloud.ready = true;
  document.dispatchEvent(new CustomEvent('cloud:ready'));
}

// ---------- DATA SYNC ----------
const KEYS = ['config', 'produtos', 'tecidos', 'clientes', 'historico', 'contador'];
const localKey = (k) => 'sd_' + k;
const dataRef = (k) => doc(Cloud.db, 'tenants', Cloud.tenantId, 'data', k);

async function initialSyncAndAttach() {
  for (const k of KEYS) {
    const ref = dataRef(k);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const raw = localStorage.getItem(localKey(k));
      const value = raw != null ? safeParse(raw) : null;
      if (value != null) {
        await setDoc(ref, { value, updatedAt: serverTimestamp(), updatedBy: Cloud.user.uid });
      }
    } else {
      const v = snap.data().value;
      try { localStorage.setItem(localKey(k), JSON.stringify(v)); } catch {}
      try { Cloud.onChange[k] && Cloud.onChange[k](v); } catch (e) { console.warn(e); }
    }
  }

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
      console.warn('Cloud write failed', k, err);
    }
  }
}

// ---------- AUDIT LOG ----------
Cloud.logAction = async function (action, detail) {
  if (!Cloud.ready) return;
  try {
    await addDoc(collection(Cloud.db, 'tenants', Cloud.tenantId, 'auditLog'), {
      action,
      detail: detail || '',
      userId: Cloud.user.uid,
      userName: Cloud.user.name || Cloud.user.email,
      ts: serverTimestamp()
    });
  } catch (e) { console.warn('auditLog write failed', e); }
};

Cloud.getAuditLog = async function (n) {
  const col = collection(Cloud.db, 'tenants', Cloud.tenantId, 'auditLog');
  const q = query(col, orderBy('ts', 'desc'), limit(n || 200));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

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

// ---------- MEMBERS ----------
Cloud.listMembers = async function () {
  const col = collection(Cloud.db, 'tenants', Cloud.tenantId, 'members');
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
};

Cloud.inviteMember = async function (email, password, role, name) {
  const secApp = initializeApp(window.FIREBASE_CONFIG, 'secondary-' + Date.now());
  const secAuth = getAuth(secApp);
  let newUid;
  try {
    try {
      const cred = await createUserWithEmailAndPassword(secAuth, email, password);
      newUid = cred.user.uid;
    } catch (err) {
      if (err && err.code === 'auth/email-already-in-use') {
        try {
          const cred = await signInWithEmailAndPassword(secAuth, email, password);
          newUid = cred.user.uid;
        } catch {
          throw new Error('Este email já tem conta Firebase. Indica a palavra-passe atual desse utilizador para o re-adicionar à equipa, ou usa outro email.');
        }
      } else { throw err; }
    }
    const memberName = name || email.split('@')[0];
    await Promise.all([
      setDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', newUid), {
        email, name: memberName, role: role || 'user', active: true,
        createdAt: serverTimestamp(), createdBy: Cloud.user.uid
      }, { merge: true }),
      setDoc(doc(Cloud.db, 'users', newUid), {
        tenantId: Cloud.tenantId, email, name: memberName, role: role || 'user', createdAt: serverTimestamp()
      }, { merge: true })
    ]);
    try { await signOut(secAuth); } catch {}
    return newUid;
  } finally {
    try { await secApp.delete(); } catch {}
  }
};

Cloud.setMemberRole = async function (uid, role) {
  // Só master pode atribuir/alterar para o papel master
  if (role === 'master' && !Cloud.isMaster())
    throw new Error('Só o Administrador Master pode atribuir esse papel.');
  if (uid === Cloud.user.uid && role !== Cloud.user.role)
    throw new Error('Não te podes alterar o papel a ti próprio.');
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
  await Promise.all([
    deleteDoc(doc(Cloud.db, 'tenants', Cloud.tenantId, 'members', uid)),
    deleteDoc(doc(Cloud.db, 'users', uid))
  ]);
};

// Don't auto-boot here — index.html calls Cloud.boot() after DOM ready.
