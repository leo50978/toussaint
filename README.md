# Next.js Reusable Template

Template local pour demarrer vite des projets Next.js avec une base propre:

- Next.js (App Router)
- Tailwind CSS
- Google Fonts via `next/font`
- GSAP
- Lucide React
- Firebase (web SDK + admin SDK)

---

## 1) Objectif du dossier

Ce dossier `nextjs-app` est un template source.

Il sert a:
- garder une base moderne prete a copier
- creer de nouveaux projets rapidement
- ne pas melanger tous tes projets dans un seul depot Git

Il ne sert pas a:
- contenir plusieurs apps en production en meme temps
- pousser tous tes projets vers le meme repository

---

## 2) Prerequis

- Node.js 18.19+ (20+ recommande)
- npm 9+
- Git
- Un projet Firebase

Verifier:

```bash
node -v
npm -v
git --version
```

---

## 3) Arborescence importante

```txt
nextjs-app/
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
    components/
      template-showcase.tsx
    lib/
      firebase/
        config.ts
        client.ts
        server.ts
        admin.ts
        index.ts
  .env.example
  package.json
```

Description rapide:
- `src/app/page.tsx`: route `/` (affiche le template visuel)
- `src/components/template-showcase.tsx`: UI principale et animation GSAP
- `src/lib/firebase/config.ts`: lit la config Firebase publique depuis les env vars
- `src/lib/firebase/client.ts`: initialise Firebase cote navigateur
- `src/lib/firebase/server.ts`: initialise une app Firebase cote serveur
- `src/lib/firebase/admin.ts`: initialise Firebase Admin avec service account
- `.env.example`: variables a renseigner par projet

---

## 4) Demarrage local

```bash
npm install
npm run dev
```

Puis ouvre `http://localhost:3000`.

Scripts utiles:

```bash
npm run lint
npm run build
npm run start
```

---

## 5) Setup Firebase

### 5.1 Config web

Copie `.env.example` vers `.env.local`:

```bash
cp .env.example .env.local
```

Les variables publiques deja preparees pour le projet `vitchly`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=vitchly.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=vitchly
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=vitchly.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=378250858782
NEXT_PUBLIC_FIREBASE_APP_ID=1:378250858782:web:98e69022f7baf3e3cdb90f
```

### 5.2 Config admin (server only)

Pour `src/lib/firebase/admin.ts`, il faut aussi un service account:

1. Ouvre `https://console.firebase.google.com/`
2. Va dans `Project settings`
3. Ouvre l onglet `Service accounts`
4. Clique sur `Generate new private key`
5. Recopie dans `.env.local`:

```env
FIREBASE_PROJECT_ID=vitchly
FIREBASE_CLIENT_EMAIL=your-service-account@vitchly.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 5.3 Regles de securite

- Les variables `NEXT_PUBLIC_*` peuvent etre exposees au navigateur
- `FIREBASE_PRIVATE_KEY` ne doit jamais etre utilise dans un composant client
- `FIREBASE_CLIENT_EMAIL` et `FIREBASE_PRIVATE_KEY` doivent rester en code serveur uniquement
- Ne jamais commiter `.env.local`

### 5.4 Utilisation

Client browser:

```ts
import { getFirebaseBrowserServices } from "@/lib/firebase/client";

const { auth, db, storage } = getFirebaseBrowserServices();
```

Server app:

```ts
import { createFirebaseServerApp } from "@/lib/firebase/server";

const app = createFirebaseServerApp();
```

Admin server:

```ts
import { getFirebaseAdminServices } from "@/lib/firebase/admin";

const { auth, db, storage } = getFirebaseAdminServices();
```

---

## 6) Workflow Git recommande

### 6.1 Garder ce dossier comme template

Ce dossier peut etre un depot template.
Chaque nouveau projet doit etre cree dans un autre dossier avec son propre `.git`.

### 6.2 Creer un nouveau projet depuis le template

Depuis le dossier parent:

```bash
cd "/home/leo/Music/next js"
rsync -a --exclude '.git' --exclude 'node_modules' nextjs-app/ mon-nouveau-projet/
cd mon-nouveau-projet
npm install
git init
git branch -M main
git add .
git commit -m "Initial project from template"
```

Ensuite connecte ce nouveau dossier a son propre repo GitHub:

```bash
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

---

## 7) Ce qui manque encore (normal)

Le template est volontairement generique. Pour chaque projet, tu dois encore definir:

- Modele de donnees (collections, documents, indexes)
- Auth flows (login, signup, reset password, callbacks)
- Pages metier (dashboard, admin, etc.)
- Regles Firestore/Storage et indexes
- Tests (unit, integration, e2e)
- CI/CD (GitHub Actions, deploy checks)
- Monitoring et error tracking

---

## 8) Checklist avant de lancer un vrai projet

- [ ] `.env.local` rempli
- [ ] connexion Firebase valide
- [ ] `npm run lint` OK
- [ ] `npm run build` OK
- [ ] repo Git dedie au projet
- [ ] premier commit propre

---

Si tu veux, prochaine etape: je peux ajouter une base auth Firebase (signup/signin/signout) directement dans ce template.
