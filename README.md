# Concordia OS

**Concordia OS** est un environnement de travail web qui permet de piloter visuellement un dépôt **Astro** depuis une interface inspirée d'un système d'exploitation. Il regroupe les outils de gestion de contenu, de données, de traduction, de design et de prévisualisation du site dans un même espace.

> Concordia OS est l'interface d'administration et de développement du site Astro géré. Le dépôt Astro cible est cloné dans le dossier `concordia_repo/` au démarrage du serveur.

## Fonctionnalités

- **Office CMS** — gestion du contenu et des entrées de données (seeds).
- **Workspace** — exécution de scripts, build et lancement de l'aperçu Astro.
- **Postgres** — exploration des tables et exécution de requêtes SQL via PGlite.
- **Data** — consultation des schémas, migrations et seeds.
- **i18n** — gestion des dictionnaires de traduction et de leur utilisation.
- **Design** — consultation et gestion des tokens, thèmes et composants.
- **Images** — bibliothèque de médias et téléversement d'images.
- **Notes** — documentation et spécifications Markdown.
- **Secrets** — configuration des variables d'environnement et des connexions à la base de données.
- **Settings** — paramètres du dépôt Astro, configuration et dépendances.

L'interface propose une vue poste de travail ainsi qu'une vue mobile simulée.

## Stack technique

| Technologie | Utilisation |
| --- | --- |
| React 19 | Interface utilisateur |
| TypeScript | Typage |
| Vite 6 | Développement et build du frontend |
| Express 4 | Serveur applicatif et API |
| Tailwind CSS 4 | Styles |
| Lucide React | Icônes |
| PGlite | Base PostgreSQL embarquée |
| `@google/genai` | Fonctionnalités d'assistance IA côté serveur |
| Astro | Site web administré (dépôt externe) |

## Prérequis

- Node.js (version compatible avec les dépendances du projet)
- npm
- Git
- Un accès réseau pour cloner le dépôt Astro et installer ses dépendances
- Une clé API Gemini pour activer les fonctionnalités IA

## Installation

Clone le dépôt puis installe les dépendances :

```bash
git clone https://github.com/Ishaq74/ConcordiaOS.git
cd ConcordiaOS
npm install
```

Crée un fichier `.env` à partir du modèle :

```bash
cp .env.example .env
```

Configure ensuite les variables nécessaires :

```env
GEMINI_API_KEY=your_gemini_api_key
APP_URL=http://localhost:3000
```

- `GEMINI_API_KEY` — clé utilisée par le serveur pour les requêtes Gemini. Elle ne doit pas être exposée dans le bundle frontend.
- `APP_URL` — URL publique de l'application lorsqu'elle est déployée. En local, utilise généralement `http://localhost:3000`.

Le dépôt Astro géré est configuré via `GIT_REPO_URL`. Si cette variable n'est pas définie, le serveur utilise par défaut :

```
https://github.com/ishaq74/concordia.git
```

Au premier démarrage, le serveur tente de cloner ce dépôt dans `concordia_repo/`, d'installer ses dépendances et de préparer son fichier `.env` à partir de `.env.example` lorsqu'il est disponible.

## Démarrage

Lance le serveur de développement :

```bash
npm run dev
```

Ouvre ensuite [http://localhost:3000](http://localhost:3000).

Le serveur Express sert l'application React/Vite et expose les API internes. Le serveur de développement Astro est lancé séparément depuis l'espace **Workspace**, sur le port `4321`; son aperçu est relayé par l'application.

## Scripts disponibles

| Commande | Description |
| --- | --- |
| `npm run dev` | Démarre le serveur applicatif avec `tsx server.ts`. |
| `npm run build` | Compile le frontend avec Vite dans `dist/`. |
| `npm run preview` | Lance l'aperçu du build Vite. |
| `npm run lint` | Vérifie les types TypeScript avec `tsc --noEmit`. |
| `npm run clean` | Supprime le dossier `dist/`. |

## Architecture

```text
ConcordiaOS/
├── src/
│   ├── apps/             # Applications et modules de l'interface
│   ├── components/       # Composants partagés
│   ├── App.tsx           # Bureau et lanceur d'applications
│   └── main.tsx          # Point d'entrée React
├── scripts/              # Scripts utilitaires
├── pg-data/              # Données locales éventuelles
├── server.ts             # Serveur Express, API et orchestration Astro
├── vite.config.ts        # Configuration Vite
├── package.json          # Dépendances et scripts npm
├── .env.example          # Modèle de configuration
└── concordia_repo/       # Dépôt Astro géré (créé au démarrage)
```

### Fonctionnement général

1. Express démarre sur le port `3000`.
2. Au lancement, `server.ts` vérifie la présence du dépôt Astro et tente de le cloner si nécessaire.
3. Les modules de l'interface communiquent avec les API Express pour lire et modifier les fichiers du dépôt géré, gérer les données et lancer les outils.
4. Le serveur Astro de développement fonctionne sur le port `4321`; l'application relaie les routes nécessaires à l'aperçu.
5. Les appels Gemini passent par le backend, qui lit `GEMINI_API_KEY` depuis l'environnement serveur.

## Sécurité

Le serveur intègre notamment plusieurs protections :

- exécution de commandes sans interpréteur shell, avec liste d'autorisation ;
- restriction des chemins de fichiers au dépôt Astro géré ;
- protection des répertoires sensibles tels que `.git`, `node_modules`, `pg-data` et `pg-databases` contre les modifications via l'API ;
- validation des noms de bases et des fichiers de seeds ;
- validation des URL distantes et blocage des adresses IP privées pour la récupération d'images ;
- limites de taille et validation des fichiers téléversés ;
- utilisation de la clé Gemini uniquement côté serveur.

Ne commit jamais de fichier `.env`, de clé API ou d'autre secret.

## Dépannage

- **Le dépôt Astro ne se clone pas :** vérifie l'accès réseau, les droits Git et la valeur de `GIT_REPO_URL`.
- **L'aperçu Astro ne démarre pas :** vérifie que les dépendances de `concordia_repo/` sont installées et consulte les logs dans **Workspace**.
- **Les fonctionnalités IA échouent :** vérifie que `GEMINI_API_KEY` est défini dans l'environnement du serveur.
- **Le port est déjà utilisé :** libère le port `3000` pour Concordia OS ou adapte la configuration du serveur.

## Contribution

Les contributions sont les bienvenues :

1. Fork le dépôt.
2. Crée une branche dédiée à ta modification.
3. Effectue tes changements et vérifie-les avec `npm run lint` et `npm run build`.
4. Ouvre une Pull Request en décrivant clairement les changements.

## Licence

Aucune licence n'est actuellement déclarée dans le dépôt. Tous droits réservés par défaut ; contacte l'auteur avant toute réutilisation ou redistribution.
