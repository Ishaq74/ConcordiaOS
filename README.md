# Concordia OS

> **Concordia OS** est un cockpit web de développement et d'administration pour un projet Astro. Il réunit dans une interface de type bureau les outils qui servent à gérer le contenu du site, les données PostgreSQL, les traductions, les médias, le design system, la configuration et le cycle de développement.

- **Application :** React + TypeScript, servie par Express et Vite.
- **Dépôt piloté :** un dépôt Astro séparé, cloné dans `concordia_repo/`.
- **Interface :** bureau responsive avec lanceur d'applications et mode téléphone simulé.
- **Langue de cette documentation :** français.

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Applications intégrées](#applications-intégrées)
- [Architecture technique](#architecture-technique)
- [Prérequis](#prérequis)
- [Installation et configuration](#installation-et-configuration)
- [Lancement et cycle de développement](#lancement-et-cycle-de-développement)
- [Scripts npm](#scripts-npm)
- [API HTTP](#api-http)
- [Organisation du code](#organisation-du-code)
- [Données et persistance](#données-et-persistance)
- [Sécurité](#sécurité)
- [Dépannage](#dépannage)
- [Développement et contribution](#développement-et-contribution)
- [Limites et points d'attention](#limites-et-points-dattention)
- [Licence](#licence)

## Vue d'ensemble

Concordia OS n'est pas le site Astro lui-même : c'est une application d'administration locale qui agit sur un dépôt Astro cible. Elle expose les outils du dépôt dans des modules spécialisés et utilise un backend Express pour les opérations qui nécessitent le système de fichiers, l'exécution de processus, PostgreSQL ou une clé API.

Au démarrage, le backend prépare le dossier cible `concordia_repo/`. Si ce dossier ne contient pas encore de dépôt Git, il tente de cloner l'URL définie par `GIT_REPO_URL` ou, à défaut, `https://github.com/ishaq74/concordia.git`. Il initialise ensuite le fichier `.env` du projet cible depuis son `.env.example` lorsqu'il existe.

L'interface principale propose deux présentations :
- **Workstation / Desktop :** barre supérieure, navigation et dock latéral pour ouvrir les modules.
- **Mobile View :** cadre de téléphone simulé avec le même lanceur d'applications.

Le statut du dépôt cible (dépendances installées, présence du fichier d'environnement et serveur Astro actif) est interrogé périodiquement par l'interface.

## Applications intégrées

Le lanceur de `src/App.tsx` expose dix modules. Les fonctionnalités ci-dessous décrivent ce qui est implémenté dans le code de l'interface ; elles ne signifient pas qu'un dépôt Astro vierge contient déjà les fichiers ou conventions attendus.

### 1. Office CMS — contenu éditorial

Fichier : `src/apps/OfficeApp.tsx`

- Parcourt les fichiers de données éditoriales (*seeds*) du dépôt cible.
- Ouvre un éditeur d'entrées et de champs JSON/TypeScript.
- Recherche des entrées et permet leur modification ou suppression.
- Gère des groupes de traduction et les langues disponibles dans l'interface (français, anglais, espagnol, allemand, italien et arabe).
- Permet de dupliquer une entrée vers une autre langue.
- Propose des outils Gemini pour générer/réécrire du contenu et produire des textes alternatifs d'images.
- Intègre un sélecteur d'images et l'envoi de médias.
- Contient une action de publication Git (tests, synchronisation avec la branche distante et push).

Le module s'appuie notamment sur les endpoints `/api/seeds-all`, `/api/seeds/:file`, `/api/gemini/*`, `/api/upload` et `/api/git/push`.

### 2. Workspace — installation, scripts, build et aperçu

Fichier : `src/apps/DeployApp.tsx`

Onglets :
- **Setup :** choix du gestionnaire de paquets utilisé dans le dépôt Astro.
- **Install :** installation des dépendances du projet cible.
- **Scripts :** lecture de `scripts` dans le `package.json` cible, sélection d'un script et ajout éventuel d'arguments.
- **Preview :** démarrage/arrêt du serveur de développement Astro, état, logs et aperçu intégré dans une iframe. Des raccourcis de routes de langues sont proposés.
- **Build :** exécution du script `build` du dépôt Astro.

Gestionnaires proposés : `npm`, `pnpm` et `bun`. Le serveur Astro est démarré sur `127.0.0.1:4321`, puis relayé par Express sous `/preview-site` et pour les routes nécessaires à Astro/Vite.

### 3. Postgres — moteur SQL

Fichier : `src/apps/PgApp.tsx`

- Utilise PGlite, une implémentation PostgreSQL embarquée, et son serveur socket.
- Affiche les bases locales disponibles et la base active.
- Permet de créer, sélectionner et supprimer des bases (la base par défaut `postgres` ne peut pas être supprimée).
- Affiche les tables et leur structure, et permet de recharger le schéma.
- Fournit un éditeur SQL pour exécuter des requêtes et consulter les résultats.
- Propose des actions de gestion du schéma public, des tables et des données (dont truncate/drop).
- Lit les scripts du projet pour faciliter les opérations liées à la base.
- Synchronise les paramètres de base locale/test avec les variables de connexion du dépôt Astro.

Le socket PostgreSQL local est exposé sur `127.0.0.1:5432`. Les bases supplémentaires sont stockées sous `concordia_repo/pg-databases/<nom>/`.

### 4. Data — architecture de données

Fichier : `src/apps/DataApp.tsx`

Explore les conventions de dossiers du projet cible :
- **Schemas :** fichiers `src/database/schemas/*.schema.ts`.
- **Seeds :** fichiers `src/database/data/*.data.ts`, avec action d'exécution du script `db:seed`.
- **Migrations :** fichiers SQL sous `src/database/migrations/*.sql`, avec actions liées aux scripts de migration, vérification, génération et comparaison.
- **Loaders :** fichiers TypeScript sous `src/database/loaders/*.ts`.

Le module filtre les fichiers, ouvre leur contenu et affiche le résultat des commandes lancées.

### 5. i18n — dictionnaires de traduction

Fichier : `src/apps/I18nApp.tsx`

- Parcourt les dictionnaires JSON dans `src/i18n/`.
- Présente les locales et les clés de traduction.
- Ouvre un éditeur de dictionnaire avec recherche par clé ou valeur.
- Aplatit les objets imbriqués pour faciliter l'édition, puis les reconstruit à l'enregistrement.
- Permet d'ajouter, modifier et supprimer des clés.
- Propose une traduction assistée par Gemini.
- Recherche les usages des clés dans le code source afin d'aider à repérer les traductions utilisées ou manquantes.

Les opérations de fichiers utilisent l'API filesystem ; la traduction utilise `/api/gemini/translate`.

### 6. Design — design system

Fichier : `src/apps/DesignApp.tsx`

Onglets :
- **Tokens :** lecture et filtrage des variables CSS, avec copie de références `var(...)`.
- **Themes :** exploration des fichiers de thèmes et ouverture de leur code.
- **Components :** recherche et consultation des composants du projet.
- **Typography :** détection/présentation des familles de polices et de leurs piles CSS.

Ce module est un explorateur du design system présent dans le dépôt cible ; il ne remplace pas un outil de conception graphique.

### 7. Images — bibliothèque de médias

Fichier : `src/apps/ImagesApp.tsx`

- Parcourt la bibliothèque `public/images/`.
- Propose une vue en grille et une vue en liste.
- Recherche des fichiers, affiche un aperçu et permet de copier des références.
- Permet l'envoi de plusieurs images via l'API d'upload.
- Propose la génération de textes alternatifs avec Gemini.

L'upload est limité côté serveur à dix fichiers par requête et à 10 Mo par fichier ; les extensions et types MIME image sont contrôlés.

### 8. Notes — documentation du projet

Fichier : `src/apps/NotesApp.tsx`

- Parcourt les documents Markdown et les spécifications du dépôt.
- Sépare les documents du projet, les guides/spécifications et les ressources visuelles (icônes/diagrammes).
- Filtre les fichiers par nom ou chemin.
- Affiche les documents Markdown et les images dans un lecteur intégré.

### 9. Secrets — variables d'environnement

Fichier : `src/apps/EnvApp.tsx`

- Consulte et modifie les variables du fichier `.env` du dépôt Astro.
- Permet de révéler/masquer les valeurs et d'ajouter ou supprimer des variables.
- Identifie les clés qui ressemblent à des secrets.
- Présente les réglages de routage PostgreSQL local/test.
- Permet de synchroniser les URLs de connexion et les indicateurs d'environnement avec le gestionnaire PGlite.
- Donne accès au redémarrage du serveur Astro.

**Attention :** ce module manipule des valeurs sensibles. Ne partage pas de captures d'écran ou de logs qui affichent des secrets et ne versionne jamais un fichier `.env`.

### 10. Settings — configuration du projet

Fichier : `src/apps/SettingsApp.tsx`

- Résume la configuration Astro (`astro.config.mjs`) et le mode de sortie.
- Affiche les locales déclarées dans la configuration Astro.
- Explore les fichiers de traduction JSON.
- Affiche les dépendances runtime et de développement du `package.json`.
- Permet de filtrer les paquets et d'inspecter la configuration du dépôt.

## Structure attendue du projet Astro à importer

Cette section décrit **le dépôt cible** que Concordia OS clone dans `concordia_repo/`. Il ne s'agit pas de l'arborescence de ConcordiaOS lui-même.

Concordia OS peut ouvrir un dépôt Astro existant, mais ses modules sont conçus autour de conventions de fichiers précises. Un projet Astro standard peut démarrer sans toutes ces conventions ; en revanche, les panneaux correspondants resteront vides ou certaines actions ne seront pas disponibles tant que les dossiers, fichiers et scripts attendus n'existent pas.

### Arborescence conseillée

Voici une structure de référence compatible avec les explorateurs et les opérations de Concordia OS. Les noms marqués « convention Concordia » sont les emplacements reconnus directement par l'application.

```text
mon-projet-astro/
├── package.json                    # Indispensable : scripts et dépendances du site
├── astro.config.mjs                # Indispensable pour le panneau Settings
├── .env                            # Variables du site (local, non versionné)
├── .env.example                    # Modèle de variables, recommandé
├── .gitignore
├── README.md
├── public/
│   ├── images/                     # Convention Concordia : bibliothèque Images/CMS
│   ├── fonts/                      # Optionnel : polices locales
│   └── favicon.svg                 # Optionnel : favicon du site
├── src/
│   ├── components/                 # Convention Concordia : composants .astro/.tsx/.ts
│   │   ├── layout/
│   │   └── ui/
│   ├── layouts/                     # Layouts Astro du site
│   ├── pages/                       # Routes Astro
│   │   ├── index.astro
│   │   └── [...lang]/               # Exemple de routes localisées, selon le projet
│   ├── styles/
│   │   ├── global.css               # Feuille globale, si utilisée par le site
│   │   └── components/              # Convention Concordia : fichiers CSS de thèmes
│   │       ├── colors.css
│   │       ├── spacing.css
│   │       ├── components.css
│   │       └── typography.css
│   ├── i18n/                        # Convention Concordia : dictionnaires JSON par locale
│   │   ├── fr.json
│   │   ├── en.json
│   │   └── es.json
│   └── database/                    # Convention Concordia : ressources de données
│       ├── schemas/
│       │   └── example.schema.ts
│       ├── data/
│       │   └── example.data.ts
│       ├── migrations/
│       │   └── 001_initial.sql
│       └── loaders/
│           └── example.ts
├── docs/                            # Documentation libre (Markdown/MDX)
└── .github/
    └── instructions/                # Guides et specs Markdown facultatifs
```

Les dossiers `layouts/`, `pages/`, `styles/`, `docs/` et les noms de fichiers de l'exemple sont des choix d'organisation Astro usuels ou des suggestions. Les conventions effectivement scannées par Concordia OS sont détaillées ci-dessous. Adapte les exemples de routes, de composants et de configuration à l'architecture réelle de ton site.

### Éléments nécessaires au fonctionnement du site importé

| Élément | Niveau | Pourquoi |
| --- | --- | --- |
| `package.json` valide | Obligatoire | Concordia OS y lit les scripts et dépendances, et Workspace les exécute. |
| `astro.config.mjs` | Requis pour Settings | Le panneau Settings lit ce chemin précis pour afficher la configuration Astro et les locales. |
| Dépendances installables | Obligatoire pour Preview/Build | Le serveur Astro ne peut pas démarrer correctement sans les dépendances du projet cible. |
| Script `dev` | Recommandé | Commande habituelle pour lancer Astro en développement ; le Workspace démarre le serveur du projet. |
| Script `build` | Requis pour l'action Build | Le panneau Workspace exécute le script `build` déclaré dans `package.json`. |
| Fichier `.env` | Selon le projet | Nécessaire si le site ou ses outils consomment des variables d'environnement. |
| Fichier `.env.example` | Fortement recommandé | Concordia OS le copie vers `.env` lorsqu'il prépare le dépôt et qu'aucun `.env` n'existe. |

Exemple minimal indicatif de scripts dans le `package.json` du site (à fusionner avec les dépendances et scripts réellement utilisés par ton projet) :

```json
{
  "scripts": {
    "dev": "astro dev --host 127.0.0.1 --port 4321",
    "build": "astro build",
    "preview": "astro preview",
    "db:seed": "tsx scripts/seed.ts",
    "db:migrate": "tsx scripts/migrate.ts",
    "test:all": "npm run lint && npm run test"
  }
}
```

Les scripts `db:seed`, `db:migrate` et `test:all` ne sont pas obligatoires pour un site Astro minimal. Ils deviennent nécessaires si tu veux utiliser les actions correspondantes de Data, Postgres ou de publication CMS. Adapte leurs commandes à l'outillage réellement installé dans le dépôt cible ; Concordia OS ne génère pas automatiquement les migrations ni les scripts métier manquants.

### Conventions reconnues par chaque module

| Module Concordia OS | Chemin attendu dans le dépôt importé | Format / règle |
| --- | --- | --- |
| Office CMS | `src/database/data/` | Fichiers nommés `<nom>.data.ts`. Chaque fichier doit exporter un tableau JavaScript/TypeScript. L'API privilégie un export dont le nom se termine par `Seed`, sinon prend le premier export tableau. |
| Data — Schemas | `src/database/schemas/` | Fichiers `*.schema.ts`. |
| Data — Seeds | `src/database/data/` | Fichiers `*.data.ts`, mêmes conventions d'export tableau que l'Office CMS. |
| Data — Migrations | `src/database/migrations/` | Fichiers SQL `*.sql`. |
| Data — Loaders | `src/database/loaders/` | Fichiers TypeScript `*.ts`. |
| i18n | `src/i18n/` | Un fichier JSON par locale, par exemple `fr.json`, `en.json`. Le contenu doit être un objet JSON ; les objets imbriqués sont pris en charge. |
| Design — Tokens | `src/styles/` | Le panneau Tokens lit les fichiers CSS `colors.css`, `spacing.css`, `components.css` et `typography.css` à cet emplacement. Les variables CSS sont détectées à partir de déclarations personnalisées (`--nom: valeur`). |
| Design — Themes | `src/styles/components/` | Fichiers CSS `*.css`, présentés comme thèmes. |
| Design — Components | `src/components/` | Composants `*.astro`, `*.tsx` et `*.ts`. |
| Images | `public/images/` | Images du site. Les formats reconnus incluent JPG, PNG, WebP, SVG, GIF et AVIF selon les vues ; l'upload applique ses propres contrôles de type et de taille. |
| Notes — Documentation | N'importe quel dossier du dépôt | Fichiers `.md` et `.mdx`, hors `.github/` dans l'onglet Project Docs. |
| Notes — Guides | `.github/` | Fichiers Markdown/MDX affichés dans l'onglet Guides & Specs. |
| Notes — Icônes et diagrammes | N'importe quel dossier sauf `public/images/` | Fichiers SVG, PNG, JPG, WebP et GIF. |
| Settings | Racine du dépôt | `package.json` et `astro.config.mjs`. Les scripts et dépendances sont lus depuis le package. |
| Secrets | Racine du dépôt | `.env` et, en secours, `.env.example`. Les variables de base de données sont synchronisées selon les noms reconnus par le backend. |
| Workspace | Racine du dépôt | `package.json`, ses scripts et le lockfile du gestionnaire choisi. |

### Exemple de fichier seed compatible avec Office CMS

Le fichier doit se trouver sous `src/database/data/`, porter le suffixe `.data.ts` et exporter un tableau. Exemple de structure (les champs métier dépendent de ton application) :

```ts
export const exampleSeed = [
  {
    id: "example-001",
    title: "Exemple de contenu",
    description: "Entrée de démonstration à remplacer par ton contenu."
  }
];
```

Le nom de l'export `exampleSeed` suit la convention la plus simple pour le lecteur de seeds. Les objets peuvent avoir des propriétés métier différentes ; les formulaires CMS construisent leurs champs à partir des propriétés des entrées. Garde des identifiants stables et évite de mélanger des structures incompatibles dans un même tableau.

### Exemple de dictionnaire i18n

Chaque locale est un fichier JSON distinct. Les clés peuvent être imbriquées :

```json
{
  "common": {
    "home": "Accueil",
    "contact": "Contact"
  },
  "navigation": {
    "about": "À propos"
  }
}
```

Les fichiers doivent être du JSON valide. Les clés d'une locale à l'autre devraient rester cohérentes pour faciliter la recherche d'usages et la traduction.

### Exemple de variables d'environnement

Le fichier `.env.example` du projet Astro sert de modèle. Les noms ci-dessous sont illustratifs : conserve ceux réellement lus par ton site et ses scripts.

```dotenv
NODE_ENV=development
DATABASE_URL_LOCAL=postgresql://user:password@localhost:5432/postgres
DATABASE_URL_TEST=postgresql://user:password@localhost:5432/concordia_test
```

Ne commit jamais le vrai `.env`. Les champs de routage PostgreSQL utilisés par l'interface doivent correspondre aux variables attendues par le backend et par le code du site ; vérifie les noms déjà présents dans ton projet avant de les renommer.

### Vérification avant import

Avant de renseigner `GIT_REPO_URL` ou de laisser le serveur cloner ton projet, vérifie :

- [ ] Le dépôt Git est accessible depuis la machine qui exécute Concordia OS.
- [ ] Le `package.json` est présent et son JSON est valide.
- [ ] `astro.config.mjs` existe si tu veux utiliser le panneau Settings.
- [ ] Les scripts `dev` et `build` sont définis et fonctionnent dans le dépôt cible.
- [ ] Le gestionnaire de paquets choisi correspond au lockfile du dépôt.
- [ ] Le fichier `.env.example` documente toutes les variables nécessaires sans contenir de secrets réels.
- [ ] Les dossiers de conventions sont créés pour les modules que tu comptes utiliser.
- [ ] Les fichiers `.data.ts` exportent bien des tableaux.
- [ ] Les dictionnaires `.json` sont valides.
- [ ] Les chemins de migrations, composants, thèmes et médias respectent exactement la casse et les emplacements indiqués ci-dessus.

**Important :** ces chemins sont des conventions consommées par le code actuel de Concordia OS, pas un générateur de projet. L'import/clonage ne crée pas automatiquement les pages Astro, les composants, les schémas, les migrations, les dictionnaires ni les scripts métier. Commence par importer un projet Astro fonctionnel, puis ajoute les dossiers optionnels correspondant aux modules que tu veux exploiter.

## Architecture technique

| Couche | Technologie | Rôle |
| --- | --- | --- |
| UI | React 19 | Bureau, lanceur et dix modules |
| Langage | TypeScript 5.8 | Code frontend et backend |
| Bundler / dev middleware | Vite 6 + plugin React | HMR, compilation et middleware SPA |
| Serveur HTTP | Express 4 | API locale et hébergement de l'interface |
| CSS | Tailwind CSS 4 + plugin Vite | Styles utilitaires |
| Icônes | Lucide React | Icônes des modules |
| Mouvement | Motion | Animations d'interface |
| Markdown | React Markdown, UIW React Markdown Editor | Lecture/édition Markdown |
| Base embarquée | `@electric-sql/pglite` | Moteur PostgreSQL local |
| Socket PostgreSQL | `@electric-sql/pglite-socket` | Connexion au moteur via protocole PostgreSQL |
| Client SQL | `pg` | Client PostgreSQL |
| IA | `@google/genai` | Génération, traduction et alt-text via backend |
| Upload | Multer | Réception des images |
| Proxy | http-proxy-middleware | Proxy de l'aperçu Astro |
| Processus | Node child_process, tree-kill | Exécution contrôlée et arrêt des processus |

### Schéma d'exécution

```text
Navigateur
   │
   ▼
React / Vite (interface) ─────── Express :3000
                                  │
             ┌────────────────────┼───────────────────────┐
             │                    │                       │
             ▼                    ▼                       ▼
      Fichiers de             PGlite / socket         Gemini API
      concordia_repo/         127.0.0.1:5432          (clé serveur)
             │
             ▼
      Processus Astro :4321
             │
             ▼
      Proxy /preview-site
```

Le point d'entrée frontend est `src/main.tsx`, qui monte `src/App.tsx`. Le point d'entrée backend est `server.ts`.

## Prérequis

- Node.js et npm (versions compatibles avec les dépendances du lockfile).
- Git accessible depuis le terminal.
- Un accès réseau au dépôt Astro cible lors de son premier clonage.
- Une clé Gemini valide pour les fonctions IA (facultative pour les autres modules).
- Un environnement capable d'exécuter les dépendances natives éventuelles du projet.

Les gestionnaires `pnpm` et `bun` sont proposés pour les opérations effectuées dans le dépôt Astro géré ; l'application elle-même est installée avec npm selon les commandes ci-dessous.

## Installation et configuration

### 1. Cloner Concordia OS

```bash
git clone https://github.com/Ishaq74/ConcordiaOS.git
cd ConcordiaOS
npm install
```

Le dépôt contient un `package-lock.json` et un `bun.lock`. Avec npm, `npm install` installe les dépendances de l'application.

### 2. Configurer l'environnement de l'application

```bash
cp .env.example .env
```

Le modèle versionné contient :

| Variable | Rôle |
| --- | --- |
| `GEMINI_API_KEY` | Clé API lue par le backend pour les fonctionnalités Gemini. |
| `APP_URL` | URL de l'application hôte ; utile dans l'environnement de déploiement qui fournit cette valeur. |

Renseigne au minimum `GEMINI_API_KEY` si tu souhaites utiliser les fonctions IA. Garde les valeurs réelles dans un fichier local non versionné ou dans le gestionnaire de secrets de la plateforme.

### 3. Configurer le dépôt Astro piloté

Le serveur lit `GIT_REPO_URL` dans l'environnement du processus Node. Si elle est absente, il utilise :

```text
https://github.com/ishaq74/concordia.git
```

Exemple de lancement avec un dépôt différent :

```bash
GIT_REPO_URL=https://github.com/mon-compte/mon-site-astro.git npm run dev
```

Au premier lancement, `server.ts` :
1. vérifie si `concordia_repo/.git` existe ;
2. si nécessaire, clone le dépôt cible dans `concordia_repo/` ;
3. tente d'installer ses dépendances avec la commande de bootstrap intégrée ;
4. copie `concordia_repo/.env.example` vers `concordia_repo/.env` si ce dernier n'existe pas.

Le dépôt cible doit être accessible en lecture par Git. Pour un dépôt privé, configure l'authentification Git dans l'environnement qui exécute le serveur.

### 4. Lancer l'application

```bash
npm run dev
```

Puis ouvre [http://localhost:3000](http://localhost:3000).

Le dossier `concordia_repo/` est créé automatiquement au démarrage si le clonage réussit. Si tu souhaites préparer manuellement ses dépendances depuis l'interface, ouvre **Workspace → Install**.

## Lancement et cycle de développement

### Ports

| Port | Adresse d'écoute | Usage |
| --- | --- | --- |
| `3000` | `0.0.0.0` | Serveur Express et application web |
| `4321` | `127.0.0.1` | Serveur de développement Astro, lancé à la demande |
| `5432` | `127.0.0.1` | Socket PostgreSQL PGlite, base active |

Le port du serveur Express est défini par la constante `PORT` dans `server.ts`. Le port Astro est fourni à la commande de lancement depuis Workspace. Le serveur PostgreSQL interne est redémarré lors d'un changement de base active.

### Aperçu Astro

1. Ouvre le module **Workspace**.
2. Sélectionne le gestionnaire de paquets à utiliser.
3. Va dans **Install** et lance l'installation si les dépendances du dépôt cible sont absentes.
4. Va dans **Preview**, puis démarre le serveur Astro.
5. Consulte les logs et ouvre la route souhaitée dans l'aperçu intégré.

Le proxy Express relaie notamment `/preview-site`, les assets Astro/Vite et les préfixes de langues `/ar`, `/es`, `/fr` et `/en`.

### Build et publication

- **Build :** Workspace exécute le script `build` du `package.json` du dépôt Astro.
- **Publication CMS :** l'action de publication de l'Office CMS appelle `/api/git/push`. Le backend lance d'abord le script de test `test:all` du dépôt cible ; en cas d'échec, la publication est interrompue. Il synchronise ensuite la branche `main` avec le dépôt distant et pousse les changements.

La publication concerne le dépôt Astro géré, pas le dépôt ConcordiaOS.

## Scripts npm

Scripts définis dans le `package.json` de Concordia OS :

| Commande | Effet |
| --- | --- |
| `npm run dev` | Lance `tsx server.ts` : backend Express et middleware Vite en développement. |
| `npm run build` | Compile le frontend avec Vite dans `dist/`. |
| `npm run preview` | Lance le serveur de prévisualisation Vite du build frontend. |
| `npm run setup` | Exécute `npm install` dans `concordia_repo/` (le dossier cible doit exister). |
| `npm run clean` | Supprime le dossier `dist/`. |
| `npm run lint` | Lance `tsc --noEmit` pour vérifier les types TypeScript. |

Script utilitaire présent :
- `node scripts/test-pglite.mjs` : test manuel de PGlite utilisant `pg-data` et un socket sur le port `5433`. Ce script est un utilitaire de test, pas le démarrage normal du serveur.

À noter : `npm run build` compile le frontend Vite. Le serveur Express reste un processus Node séparé ; ce script ne produit pas à lui seul un bundle autonome du backend.

## API HTTP

Les routes suivantes sont définies dans `server.ts`. Elles constituent l'API interne utilisée par les modules React.

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/api/system-status` | État du dépôt cible : dépendances, fichier .env et serveur Astro. |
| GET | `/api/dev-server/logs` | Retourne les logs et l'état du serveur Astro. |
| POST | `/api/dev-server/logs/clear` | Efface les logs en mémoire. |
| POST | `/api/dev-server` | Démarre, arrête ou interroge le serveur Astro (`action`). |
| GET | `/api/pg-databases` | Liste les bases locales, la base active et le routage .env. |
| POST | `/api/pg-databases` | Crée, bascule, supprime une base ou synchronise les variables d'environnement. |
| POST | `/api/pg-query` | Exécute une requête SQL sur une base PGlite. |
| POST | `/api/upload` | Reçoit des images et les place dans la bibliothèque du dépôt cible. |
| POST | `/api/gemini/generate` | Génère du contenu éditorial (modes contrôlés par le backend). |
| POST | `/api/gemini/alt-text` | Produit un texte alternatif à partir d'une image. |
| POST | `/api/gemini/translate` | Traduit des dictionnaires ou du contenu CMS. |
| GET | `/api/fs/read` | Lit un fichier texte ou liste le contenu d'un dossier. |
| GET | `/api/fs/raw` | Sert un fichier brut (notamment les images). |
| POST | `/api/fs/write` | Écrit un fichier texte, avec sauvegarde optionnelle. |
| POST | `/api/fs/delete` | Supprime un fichier (pas un dossier). |
| GET | `/api/fs/scan` | Retourne l'inventaire des fichiers du dépôt cible. |
| GET | `/api/seeds-all` | Charge les fichiers de seeds et retourne leurs entrées. |
| GET | `/api/seeds/:file` | Lit un fichier de seed autorisé. |
| POST | `/api/seeds/:file` | Met à jour le tableau exporté d'un fichier de seed. |
| POST | `/api/script-runner` | Exécute une commande autorisée dans le dépôt cible. |
| GET | `/api/package-scripts` | Retourne les scripts du package.json cible. |
| POST | `/api/git/push` | Lance les tests et la procédure de publication Git. |

Les endpoints sont destinés à l'application et à son environnement de confiance. Ils ne constituent pas une API publique avec authentification multi-utilisateur intégrée.

## Organisation du code

```text
ConcordiaOS/
├── src/
│   ├── apps/
│   │   ├── DataApp.tsx       # Schémas, seeds, migrations, loaders
│   │   ├── DeployApp.tsx     # Installation, scripts, build, preview
│   │   ├── DesignApp.tsx     # Tokens, thèmes, composants, typo
│   │   ├── EnvApp.tsx        # Variables .env et routage DB
│   │   ├── I18nApp.tsx       # Dictionnaires et usages des clés
│   │   ├── ImagesApp.tsx     # Bibliothèque et upload
│   │   ├── NotesApp.tsx      # Docs, guides et ressources
│   │   ├── OfficeApp.tsx     # CMS, seeds, traduction et publication
│   │   ├── PgApp.tsx         # Administration SQL PGlite
│   │   └── SettingsApp.tsx   # Configuration Astro et dépendances
│   ├── components/
│   │   └── UiFeedback.tsx    # Toasts, confirmations et prompts
│   ├── hooks/
│   │   ├── useFs.ts          # Accès fichiers et exécution de commandes
│   │   └── usePackageManager.ts # Choix npm/pnpm/bun et construction des commandes
│   ├── App.tsx               # Bureau, lanceur et navigation
│   ├── index.css             # Styles globaux
│   └── main.tsx              # Montage React
├── scripts/
│   └── test-pglite.mjs       # Test manuel du serveur PGlite
├── pg-data/                  # Répertoire de données PostgreSQL présent dans le dépôt
├── server.ts                 # Express, endpoints, PGlite, Gemini, proxy Astro
├── vite.config.ts            # Configuration Vite, React et Tailwind
├── index.html                # Document HTML racine et métadonnées
├── package.json              # Scripts et dépendances
├── package-lock.json         # Verrouillage des dépendances npm
├── bun.lock                  # Verrouillage Bun
├── tsconfig.json             # Configuration TypeScript
├── .env.example              # Modèle des variables de l'application
└── walkthrough.md            # Compte-rendu de sécurité et vérifications
```

### Fichiers importants

- `src/App.tsx` : déclare le catalogue des dix applications et gère les vues desktop/mobile.
- `src/hooks/useFs.ts` : centralise les appels filesystem, lecture, écriture, suppression et exécution de commandes.
- `src/hooks/usePackageManager.ts` : mémorise le gestionnaire de paquets choisi et construit les commandes adaptées.
- `src/components/UiFeedback.tsx` : fournit les notifications, boîtes de confirmation et boîtes de saisie.
- `server.ts` : initialise le dépôt cible, le moteur PGlite, les endpoints Express et le proxy Astro.
- `walkthrough.md` : documente les corrections de sécurité et les scénarios de vérification décrits dans le dépôt.

## Données et persistance

### Dépôt Astro cible

Les modules travaillent principalement dans `concordia_repo/`. Les modifications de fichiers, seeds, dictionnaires, médias et configurations concernent ce dossier.

### Bases PGlite

- Base par défaut : `concordia_repo/pg-data/`.
- Bases nommées : `concordia_repo/pg-databases/<nom>/`.
- Le nom de base est limité à 1–63 caractères parmi les lettres, chiffres, tiret bas et tiret.
- La base `postgres` ne peut pas être supprimée par l'API.
- La base active est exposée par le socket local sur le port `5432`.

### Fichiers et secrets

Les fichiers `.env` de l'application et du dépôt Astro ont des rôles distincts :
- `ConcordiaOS/.env` configure le processus Concordia OS (Gemini et paramètres de l'hôte).
- `concordia_repo/.env` configure le site Astro et ses connexions de données.

Ne copie pas les secrets de l'un vers l'autre sans raison et ne publie jamais leurs valeurs.

## Sécurité

Le dépôt inclut un compte-rendu dédié dans [`walkthrough.md`](./walkthrough.md). Les protections documentées dans le code comprennent notamment :

- **Commandes :** utilisation de `execFile` sans shell, allowlist de commandes, validation des arguments et restrictions sur les appels Node inline.
- **Chemins :** résolution des chemins à l'intérieur de `concordia_repo/`, rejet des traversées de répertoires et protection de `.git`, `node_modules`, `pg-data` et `pg-databases` contre les écritures/suppressions via l'API.
- **Bases :** validation stricte des noms de bases et des noms de fichiers/exportations de seeds.
- **Requêtes distantes :** validation des URL HTTP(S), résolution DNS et blocage des hôtes/adresses IP privés pour les fonctions qui récupèrent des images.
- **Upload :** contrôle des types/extensions d'images, limite de taille et génération de noms de fichiers sûrs.
- **Gemini :** la clé est lue côté serveur par `getGeminiClient()`; les appels IA transitent par les endpoints backend.
- **Réponses HTTP :** en-tête `X-Content-Type-Options: nosniff`.

Ces mesures réduisent des classes de risques, mais ne remplacent pas une authentification, une isolation réseau et une revue de sécurité avant une exposition publique. L'application permet de lire/écrire des fichiers et d'exécuter des scripts dans le dépôt cible : ne l'expose pas directement à Internet sans couche d'accès et durcissement adaptés.

## Dépannage

| Problème | Vérifications |
| --- | --- |
| Le serveur ne démarre pas | Vérifie la version de Node, `npm install`, le port `3000` et les logs du terminal. |
| Le dépôt cible n'apparaît pas | Vérifie `GIT_REPO_URL`, l'accès Git et les droits de clonage. Le dossier attendu est `concordia_repo/`. |
| Le clonage a réussi mais Astro ne démarre pas | Vérifie `concordia_repo/node_modules`, le gestionnaire choisi et les logs de Workspace → Preview. |
| L'aperçu affiche une erreur | Vérifie que le serveur Astro est actif sur `127.0.0.1:4321` et que la route demandée existe. |
| Les fonctions Gemini échouent | Vérifie `GEMINI_API_KEY` dans l'environnement du processus backend et consulte la réponse de l'API. |
| La base ne répond pas | Vérifie le statut PGlite, la base active et la disponibilité du port local `5432`. |
| Une commande de projet échoue | Vérifie qu'elle existe dans le `package.json` cible et que le gestionnaire sélectionné correspond au lockfile. |

## Développement et contribution

1. Fork le dépôt et crée une branche dédiée.
2. Installe les dépendances de Concordia OS avec `npm install`.
3. Configure l'accès au dépôt Astro cible.
4. Lance `npm run dev`.
5. Après tes changements, vérifie les types et le build :

```bash
npm run lint
npm run build
```

6. Décris le périmètre, les tests effectués et les éventuelles modifications d'API dans ta Pull Request.

Lors de l'ajout d'un module :
- crée le composant dans `src/apps/` ;
- ajoute son import et son entrée dans `APPS` dans `src/App.tsx` ;
- utilise les hooks et le composant de feedback partagés si nécessaire ;
- ajoute les endpoints backend correspondants dans `server.ts` uniquement si une opération serveur est requise ;
- documente les nouvelles variables, routes et dépendances dans ce README.

## Limites et points d'attention

- Le dépôt Astro cible est séparé de Concordia OS et doit respecter les conventions de dossiers que les modules explorent (`src/database`, `src/i18n`, `public/images`, fichiers de thèmes et composants).
- Les fonctionnalités IA nécessitent une clé Gemini et un accès réseau.
- Le serveur est configuré pour un usage local/de confiance ; aucune authentification utilisateur n'est implémentée dans les routes API décrites.
- `npm run build` compile l'interface Vite, pas un bundle autonome du serveur Express.
- Le dépôt contient actuellement un dossier `pg-data/` correspondant à des fichiers de données PostgreSQL. Ces fichiers sont des données d'exécution, pas du code source : évite de versionner des états locaux, dumps, journaux ou fichiers de verrouillage de base. Vérifie les règles de sauvegarde avant toute suppression ou migration de ces données.
- Le script `scripts/test-pglite.mjs` ouvre une base sur le port `5433` et écoute sur `0.0.0.0` ; ne l'utilise pas comme serveur de production.

## Licence

Aucun fichier de licence n'est actuellement déclaré dans le dépôt. En l'absence de licence explicite, les droits restent réservés par défaut : demande l'autorisation de l'auteur avant toute réutilisation ou redistribution.
