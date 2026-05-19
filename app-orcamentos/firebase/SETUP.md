# Activar a sincronização na nuvem — Serralves Decor

**Tempo:** ~5 minutos. **O que vais precisar:** uma conta Google (Gmail ou Google Workspace).

---

## Passo 1 — Criar o projecto Firebase

1. Abre: <https://console.firebase.google.com>
2. Faz login com a tua conta Google (a que queres que seja a "dona" do projecto).
3. Clica em **"Adicionar projecto"** (ou **"Criar um projecto"**).
4. Nome do projecto: `serralves-decor` (ou outro à tua escolha) → **Continuar**.
5. Quando perguntar **Google Analytics**: podes desligar (não é preciso) → **Criar projecto** → espera 30s → **Continuar**.

---

## Passo 2 — Activar Email/Password

1. No menu da esquerda: **Build → Authentication → Get started**.
2. No separador **Sign-in method**, clica em **Email/Password** na lista.
3. Activa o primeiro toggle (**Email/Password**) → **Save**.

> O segundo toggle (Email link) deixa desligado.

---

## Passo 3 — Criar a base de dados Firestore

1. No menu da esquerda: **Build → Firestore Database → Create database**.
2. **Localização:** escolhe `eur3 (europe-west)` ou `europe-west1 (Belgium)` — qualquer um na Europa.
3. **Modo de regras:** escolhe **"Start in production mode"** → **Enable**.
4. Espera 30 segundos a aprovisionar.

### Colar as regras de segurança

1. No Firestore, separador **Rules**.
2. **Apaga tudo** o que lá está.
3. Cola o conteúdo completo do ficheiro `firebase/firestore.rules` (no repositório).
4. **Publish**.

---

## Passo 4 — Registar a app web e obter as chaves

1. No menu da esquerda: **Project settings** (ícone de roda dentada, em cima).
2. No separador **General**, rola até **Your apps**.
3. Clica no ícone **`</>`** (Web).
4. **App nickname:** `Serralves Decor Orçamentos` → **Register app** (deixa "Firebase Hosting" desligado).
5. Aparece um bloco de código com um objecto `firebaseConfig`. Tem este aspecto:

```js
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "serralves-decor.firebaseapp.com",
  projectId: "serralves-decor",
  storageBucket: "serralves-decor.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123..."
};
```

**Copia esse bloco inteiro** (basta clicar no ícone de copiar) e cola-o numa mensagem aqui para mim.

---

## Passo 5 — Autorizar o domínio onde a app vai correr

1. Ainda em **Authentication → Settings → Authorized domains**.
2. Por padrão já lá estão `localhost` e o domínio do projecto.
3. Clica **Add domain** e adiciona o domínio onde a app vai estar publicada — por exemplo:
   - Se for GitHub Pages: `<o-teu-utilizador>.github.io`
   - Se for um domínio próprio: `app.serralvesdecor.com` (ou o que for)
   - Se ainda não souberes, posso fazer este passo contigo depois.

---

## O que acontece a seguir (eu trato)

Assim que me mandares o `firebaseConfig`:

1. Eu cola-o em `firebase-config.js`.
2. Faço commit, push, e a app passa a usar a nuvem.
3. Tu vais à URL da app, vês o ecrã de **login** → carrega em **Criar conta** → primeiro registo torna-te automaticamente o administrador (owner) do sistema.
4. Os dados que já tinhas localmente são automaticamente carregados para a nuvem.
5. Vais à aba **Equipa** e podes criar contas para os teus colegas (cada um com email + password própria). Cada colega tem o seu telemóvel/computador, login próprio, e vê os mesmos orçamentos em tempo real.

---

## Notas técnicas

- **Plano usado:** *Spark* (gratuito do Firebase). Para o volume desta app (cortinas/orçamentos para PME) está MUITO abaixo dos limites — não precisa de cartão de crédito.
- **Privacidade:** os dados ficam no Firestore na região Europa que escolheste. Só a tua equipa (utilizadores que tu criares) tem acesso.
- **Backup:** continuas a poder usar o botão "Exportar dados (JSON)" para teres uma cópia local periodicamente.
- **Offline:** a app continua a funcionar sem internet — sincroniza automaticamente quando voltares a ter ligação.
