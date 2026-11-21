# Audit de sécurité et de robustesse — ConcordiaOS

> **Type :** audit statique du dépôt  
> **Dépôt :** [Ishaq74/ConcordiaOS](https://github.com/Ishaq74/ConcordiaOS)  
> **Révision examinée :** `24c7c2646cf1dfd0eb027cbff9b0d274f38d98bf`  
> **Date de référence :** 21 novembre 2026  
> **Périmètre :** code, configuration, dépendances verrouillées, architecture et documentation visibles dans le dépôt.

## 1. Synthèse exécutive

L'audit identifie plusieurs risques majeurs qui doivent être traités avant toute exposition de ConcordiaOS à un réseau non fiable ou avant son utilisation avec des projets importés dont le contenu n'est pas maîtrisé.

Les problèmes les plus urgents sont :

1. **Absence de contrôle d'accès serveur centralisé clairement établi** alors que l'API expose des opérations sensibles.
2. **Lecture et modification de fichiers sensibles**, dont des fichiers de configuration et potentiellement des secrets, via les routes filesystem.
3. **Exécution de code de projets importés dans le processus serveur ou via des commandes**, sans frontière d'isolation suffisante.
4. **Exposition de secrets de connexion à la base de données** par une route API.
5. **Risque de suppression de données utilisateur au démarrage** lorsque le répertoire du projet ne contient pas de dépôt Git.
6. **Dépendances verrouillées vulnérables ou incohérentes**, notamment Multer, Vite, body-parser et path-to-regexp.
7. **Publication Git trop large**, avec risque d'ajouter des fichiers sensibles ou des changements sans rapport avec la modification demandée.

Ces constats ne signifient pas qu'une exploitation a été démontrée sur une instance en production. Ils décrivent des comportements du code et des scénarios de risque à confirmer par des tests contrôlés.

### Priorités

| Priorité | Signification | Action |
|---|---|---|
| **P0 — immédiat** | Risque de compromission, fuite de secrets ou perte de données | Corriger avant exposition réseau ou usage avec projets non fiables |
| **P1 — élevé** | Risque important de disponibilité, d'intégrité ou de sécurité | Corriger dans le prochain cycle |
| **P2 — amélioration** | Robustesse, maintenabilité et qualité de sécurité | Planifier et automatiser |

## 2. Limites et méthode

Cet examen est un **audit statique** du dépôt à la révision indiquée. Il s'appuie sur la lecture du code, des fichiers de configuration, des lockfiles et de la documentation.

Ce travail ne comprend pas :
- l'exécution complète de l'application ;
- une compilation ou une suite de tests exécutée dans un environnement isolé ;
- un test d'intrusion sur une instance active ;
- une reproduction de chaque scénario d'exploitation ;
- un audit exhaustif de toutes les dépendances avec un outil tel que `npm audit` ;
- une revue de l'infrastructure réelle, des règles réseau, des secrets de déploiement ou des permissions de l'hôte.

Les chemins et lignes cités ci-dessous sont des repères dans la révision examinée et peuvent évoluer. Les scénarios qui dépendent de la configuration (notamment l'exposition de Vite, les redirections SSRF ou les liens symboliques) doivent être reproduits en sandbox avant d'être qualifiés d'exploitables dans un déploiement précis.

## 3. Constats de sécurité prioritaires

### 3.1 P0 — API sensible sans authentification/autorisation centralisée visible

**Observation**

Dans `server.ts` (notamment autour des lignes 1266–1325), le serveur Express écoute sur `0.0.0.0:3000`. L'examen n'a pas identifié de middleware centralisé imposant une authentification et une autorisation à l'ensemble des routes sensibles.

Or l'API comprend des opérations de lecture et d'écriture filesystem, suppression de fichiers, exécution de scripts, opérations SQL et publication Git. Le seul header de sécurité explicitement repéré dans le middleware examiné est `X-Content-Type-Options: nosniff`. Aucun dispositif global de limitation de débit ou de vérification d'origine/CSRF n'a été identifié dans le chemin principal inspecté.

**Impact potentiel**

Si le service est accessible depuis le LAN ou Internet, un tiers pouvant atteindre l'API pourrait tenter d'accéder aux données, de modifier le projet, d'exécuter des commandes ou de perturber le service. Le risque dépend de l'accessibilité réseau et des protections éventuellement fournies par un proxy externe.

**Corrections recommandées**

- Ajouter une authentification obligatoire côté serveur pour toutes les routes sensibles.
- Mettre en place une autorisation par rôle et par opération : lecture, écriture, suppression, base de données, exécution et publication.
- Appliquer une politique *deny by default* ; ne pas compter sur le masquage des boutons dans l'interface.
- Ajouter une protection CSRF si l'authentification repose sur des cookies, et vérifier l'origine des requêtes selon le modèle de déploiement.
- Ajouter une limitation de débit et des limites de taille par route.
- Utiliser Helmet et définir une politique CSP adaptée à l'interface.
- Par défaut, écouter sur `127.0.0.1` ; n'autoriser l'écoute réseau qu'avec une configuration explicite et documentée.
- Ajouter des journaux d'audit pour les opérations sensibles, sans y écrire de secrets.

**Références**

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [Express — Production Best Practices: Security](https://expressjs.com/en/advanced/best-practice-security.html)

### 3.2 P0 — Exposition de secrets de connexion à la base

**Observation**

La route `GET /api/pg-databases` renvoie des informations de connexion, y compris `databaseUrlProd`. Une URL de connexion peut contenir un nom d'utilisateur, un mot de passe et des informations d'accès à une base.

**Impact potentiel**

Un client autorisé à appeler cette route — ou un tiers si l'API est accessible sans contrôle d'accès — peut récupérer des identifiants qui ne devraient jamais être transmis au navigateur.

**Corrections recommandées**

- Ne jamais renvoyer les DSN complets au frontend.
- Retourner uniquement des métadonnées non sensibles : nom logique, environnement, état de connexion et capacités disponibles.
- Conserver les identifiants uniquement côté serveur, dans un gestionnaire de secrets ou des variables d'environnement protégées.
- Remplacer toute réponse contenant des secrets par des opérations serveur spécialisées.
- Prévoir rotation des identifiants potentiellement exposés et vérifier l'historique Git ainsi que les logs.

### 3.3 P0 — API filesystem : lecture et écriture de fichiers sensibles

**Observation**

Les routes suivantes ont été identifiées dans `server.ts` :

- `GET /api/fs/read`
- `GET /api/fs/raw`
- `POST /api/fs/write`
- `POST /api/fs/delete`

Les routes de lecture peuvent exposer des fichiers tels que `.env` ou `.git/config`. L'écriture peut modifier des fichiers importants du projet ; les protections observées reposent notamment sur des restrictions de répertoires, qui ne constituent pas une politique complète de contrôle par fichier. La suppression peut également affecter des fichiers importants.

La fonction `resolveRepoPath` effectue une normalisation lexicale, mais ne semble pas canonicaliser systématiquement les chemins avec `realpath`. Un lien symbolique présent dans le projet peut donc constituer un chemin vers une cible située hors du répertoire attendu si les opérations suivent ce lien.

Un autre chemin à examiner est le traitement d'un chemin d'image : la vérification du préfixe `/images/` suivie de la construction d'un chemin sous `public/images` ne suffit pas à elle seule à neutraliser les séquences de traversée de répertoires.

**Impact potentiel**

Lecture de secrets, modification de fichiers de configuration, écrasement de code, suppression de données et sortie du périmètre filesystem prévu.

**Corrections recommandées**

- Définir une liste blanche de fichiers et de types de fichiers autorisés pour chaque opération.
- Refuser explicitement `.env`, `.git`, les clés privées, les fichiers de credentials, les fichiers système et les lockfiles critiques lorsque l'opération ne les nécessite pas.
- Canonicaliser le répertoire racine et la cible avec `realpath`, puis vérifier que la cible réelle reste dans la racine autorisée.
- Refuser les liens symboliques pour les opérations d'écriture et de suppression, ou les traiter avec des primitives sûres et une vérification stricte de la cible.
- Appliquer la même validation aux routes d'images et à tous les chemins construits à partir d'une entrée utilisateur.
- Ajouter des quotas de profondeur, de nombre de fichiers et de taille totale.
- Mettre en place sauvegarde, journalisation et confirmation pour les suppressions et écrasements.
- Ajouter des tests dédiés aux chemins `../`, aux chemins encodés, aux liens symboliques et aux chemins absolus.

**Références**

- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Node.js — File system](https://nodejs.org/api/fs.html)

### 3.4 P0 — Exécution de code de projet dans le serveur

**Observation**

La route `POST /api/script-runner` utilise une liste de commandes autorisées, mais certaines commandes autorisées peuvent exécuter du code contrôlé par le projet :

- `npm run` lance le script défini dans le `package.json` du projet ;
- `npx`, `bunx` et `node` peuvent exécuter du code ;
- l'installation de dépendances peut déclencher des scripts lifecycle ;
- les routes `GET /api/seeds-all` et `GET /api/seeds/:file` importent dynamiquement des fichiers `.data.ts`, ce qui exécute du TypeScript dans le processus principal.

Le fait d'utiliser `shell: false` ne constitue pas une frontière de sécurité : le programme appelé peut lui-même exécuter du code.

**Impact potentiel**

Un projet importé ou compromis peut exécuter du code avec les privilèges du processus ConcordiaOS, accéder aux fichiers accessibles au serveur, lire des secrets présents dans son environnement ou perturber le service.

**Corrections recommandées**

- Déplacer installation, scripts, tests, builds et imports exécutables dans des workers isolés.
- Utiliser un conteneur ou une sandbox avec utilisateur non privilégié, système de fichiers restreint et répertoire de travail dédié.
- Ne transmettre aucun secret ConcordiaOS au worker.
- Limiter CPU, mémoire, espace disque, durée, processus et accès réseau.
- Détruire l'environnement temporaire à la fin de chaque tâche.
- Ne pas importer directement des fichiers TypeScript d'un projet dans le processus Express.
- Préférer des fichiers de données JSON validés par schéma ; si TypeScript est indispensable, analyser la source avec un AST sans l'exécuter.
- Ajouter une file de tâches, des timeouts, l'annulation et une collecte de logs bornée.

**Références**

- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [Docker — Security](https://docs.docker.com/engine/security/)

### 3.5 P0 — Suppression potentielle du projet au démarrage

**Observation**

Dans `server.ts`, autour des lignes 848–872, `ensureRepo()` supprime récursivement `REPO_PATH` lorsqu'il ne trouve pas de répertoire `.git`, puis tente de cloner le dépôt distant. `startServer()` appelle cette fonction au démarrage.

Un projet Astro importé depuis une archive ZIP ou un dossier existant sans métadonnées Git peut donc être supprimé lors du lancement.

**Impact potentiel**

Perte irréversible du projet importé et de données locales qui ne seraient pas présentes dans le dépôt distant.

**Corrections recommandées**

- Supprimer toute suppression récursive automatique du répertoire de travail.
- Si le dossier existe sans `.git`, le préserver et proposer explicitement : initialiser Git, choisir un autre dossier ou cloner dans un nouveau répertoire.
- Vérifier l'existence, le remote et la branche avant toute opération Git.
- Ne jamais remplacer un répertoire non vide sans confirmation explicite et sauvegarde vérifiée.
- Faire échouer le démarrage avec un diagnostic clair si l'état du dépôt est ambigu.
- Ajouter un test de non-régression avec un projet Astro sans `.git`.

### 3.6 P0/P1 — Validation SSRF incomplète

**Observation**

La fonction `assertSafeRemoteUrl` constitue une protection utile, mais l'examen du code ne permet pas de conclure que toutes les classes de contournement SSRF sont couvertes. Les points à vérifier comprennent les plages IP privées et non routables, les adresses IPv4-mapped IPv6, les redirections HTTP et le DNS rebinding.

**Impact potentiel**

Une fonction serveur qui récupère une URL contrôlée par l'utilisateur pourrait être détournée pour contacter des services internes ou des endpoints de métadonnées accessibles depuis l'hôte.

**Corrections recommandées**

- Autoriser uniquement les schémas et ports strictement nécessaires.
- Résoudre le nom DNS et valider toutes les adresses obtenues avant connexion.
- Refuser les IP privées, loopback, link-local, multicast et réservées, en IPv4 comme en IPv6.
- Désactiver les redirections ou revalider chaque destination de redirection.
- Éviter une seconde résolution DNS non contrôlée entre validation et connexion.
- Appliquer une politique de sortie réseau au niveau du worker ou du conteneur.
- Ajouter des tests pour les encodages alternatifs, IPv6, redirections et changements DNS.

**Référence**

- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

### 3.7 P1 — Uploads : validation et limites

**Observation**

La configuration Multer permet jusqu'à 10 fichiers de 10 Mo chacun, soit potentiellement 100 Mo de fichiers dans une requête. La validation s'appuie en partie sur l'extension et le type MIME fourni par le client, qui ne sont pas des preuves fiables du contenu réel. Les SVG nécessitent une attention particulière car ils peuvent contenir du contenu actif.

**Impact potentiel**

Déni de service par consommation de mémoire, CPU ou disque ; stockage de fichiers malveillants ; exposition de contenu actif si les fichiers sont servis directement.

**Corrections recommandées**

- Vérifier la signature réelle du fichier, pas uniquement le MIME annoncé.
- Limiter le nombre de fichiers, la taille individuelle et la taille cumulée de la requête.
- Réencoder les images dans un format raster sûr lorsque c'est possible.
- Refuser les SVG ou les assainir avec une politique stricte.
- Générer les noms de fichiers côté serveur.
- Stocker les uploads hors du webroot lorsque leur accès direct n'est pas nécessaire.
- Ajouter quotas, nettoyage des fichiers temporaires et journalisation.

**Référence**

- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### 3.8 P1 — Publication Git : staging trop large et risque de secrets

**Observation**

La route `POST /api/git/push` effectue notamment `git add .`, crée un commit, rebase `origin/main` et pousse vers `origin main`. La branche est fixée et la sélection des fichiers n'est pas suffisamment fine. La route lance également `npm run test:all`, alors que ce script est présenté comme facultatif pour un projet Astro minimal.

**Impact potentiel**

- Ajout accidentel de fichiers `.env`, credentials, données locales ou fichiers générés.
- Publication de changements utilisateur sans rapport avec l'action.
- Échec de publication si le projet ne possède pas le script de test attendu.
- Conflits ou comportements inattendus si le dépôt n'utilise pas `main`.

**Corrections recommandées**

- Afficher un aperçu du diff avant staging et publication.
- Stage uniquement les fichiers explicitement sélectionnés.
- Scanner les secrets avant tout commit et bloquer la publication en cas de secret détecté.
- Rendre remote et branche configurables et les vérifier avant push.
- Exécuter les tests uniquement si le script existe, avec un résultat clairement affiché.
- Créer un commit dédié et explicite.
- Exiger une confirmation de l'utilisateur avant le push.
- Ne pas considérer `.gitignore` comme une protection suffisante contre les secrets déjà suivis.

### 3.9 P1 — Données PostgreSQL locales suivies par Git

**Observation**

Le dépôt contient un répertoire racine `pg-data/` qui semble inclure des fichiers de données/runtime PostgreSQL, notamment des fichiers tels que `postmaster.pid` et des éléments WAL. Ce répertoire n'est pas exclu par le `.gitignore` examiné.

**Impact potentiel**

Le dépôt peut accumuler des données privées, des fichiers volumineux ou des états runtime incohérents. Versionner directement un répertoire de données PostgreSQL en fonctionnement ne constitue pas une stratégie de sauvegarde fiable.

**Corrections recommandées**

- Arrêter proprement la base avant toute opération de sauvegarde cohérente.
- Déplacer les données locales vers un répertoire non versionné (par exemple `.local-data/`) ou un volume dédié.
- Ajouter `pg-data/` au `.gitignore`.
- Retirer les données du suivi Git sans supprimer la copie locale.
- Vérifier l'historique du dépôt pour déterminer si des données sensibles ont déjà été publiées.
- Mettre en place des sauvegardes cohérentes et testées, avec procédure de restauration.

### 3.10 P1 — Lockfiles divergents et dépendances vulnérables

Les versions suivantes ont été relevées dans les lockfiles de la révision auditée. Elles doivent être revérifiées lors de la mise à jour, car les avis de sécurité et les versions corrigées évoluent.

| Dépendance | Version observée | Problème identifié | Action |
|---|---:|---|---|
| Multer | `package-lock.json`: 2.1.0 ; `bun.lock`: 2.5.0 | Le manifeste déclare `^2.1.1`, donc le lock npm est inférieur à la plage déclarée. Des avis affectent les versions antérieures aux correctifs récents. | Aligner manifeste et lockfiles sur une version corrigée et vérifiée. |
| Vite | 6.4.1 | Avis GHSA-p9ff-h696-f583 (correctif annoncé en 6.4.2) et GHSA-p4f5-76q4-ffq7 (correctif annoncé en 6.4.6). L'exploitabilité dépend de l'exposition du serveur Vite et de sa configuration. | Mettre à jour au minimum vers une version corrigée actuelle et tester l'intégration middleware. |
| body-parser | 1.20.4 | Avis GHSA-27r3-jxmh-p828 / CVE-2026-111181 ; le correctif indiqué est 1.20.9. | Mettre à jour la dépendance transitive via une version compatible d'Express ou une résolution contrôlée. |
| path-to-regexp | 0.1.12 | Avis GHSA-37ch-88jc-xwx2 / CVE-2026-4867 ; correctif indiqué 0.1.13. L'exploitabilité dépend des motifs de routes utilisés. | Mettre à jour et vérifier les routes concernées. |

**Incohérence de gestionnaire de paquets**

Le dépôt contient `package-lock.json` et `bun.lock`, mais pas de `pnpm-lock.yaml` repéré. Le code et la documentation font référence à plusieurs gestionnaires : npm, pnpm et Bun. Cela rend les installations non reproductibles et peut conduire à des arbres de dépendances différents.

**Corrections recommandées**

- Choisir un gestionnaire de paquets officiel pour le projet et documenter sa version.
- Garder un seul lockfile source de vérité, sauf raison explicite de maintenir plusieurs environnements.
- Régénérer le lockfile depuis un environnement propre.
- Ajouter en CI une installation reproductible (`npm ci` si npm est retenu) et un contrôle de cohérence.
- Mettre à jour les dépendances directes et transitives vers des versions corrigées compatibles.
- Ajouter un scan automatisé des dépendances et traiter les alertes selon leur exploitabilité réelle.
- Vérifier les dépendances PGlite et Google GenAI, qui nécessitent une revue dédiée.

**Sources de sécurité**

- [Multer — GHSA-5528-5vmv-3xc2](https://github.com/expressjs/multer/security/advisories/GHSA-5528-5vmv-3xc2)
- [Multer 2.1 — NPMScan](https://npmscan.io/package/npm/multer@2.1)
- [Vite — GHSA-p9ff-h696-f583](https://github.com/vitejs/vite/security/advisories/GHSA-p9ff-h696-f583)
- [Vite — GHSA-p4f5-76q4-ffq7](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7)
- [Express — body-parser security advisory](https://expressjs.com/en/blog/2026-10-28-cve-2026-111181/)
- [path-to-regexp — GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2)
- [Express — Security Updates](https://expressjs.com/en/advanced/security-updates/)

> **Précision :** les versions ci-dessus sont celles relevées dans les fichiers verrouillés lors de l'examen. Cette analyse n'est pas le résultat d'un `npm audit` exhaustif et ne démontre pas à elle seule qu'une vulnérabilité est exploitable dans toutes les configurations.

## 4. Analyse des dix modules fonctionnels

### 4.1 Office CMS

**Faiblesses**
- Les seeds TypeScript sont importés dynamiquement et peuvent donc exécuter du code du projet.
- La sauvegarde de données dans des fichiers TypeScript peut écraser la source et supprimer des imports, helpers ou exports secondaires.
- Les données ne semblent pas toutes protégées par un schéma métier strict.
- Les conflits de modification et l'aperçu des changements sont à renforcer.

**Solutions**
- Stocker le contenu éditorial dans des fichiers JSON/YAML validés par schéma.
- Utiliser Zod ou un validateur équivalent pour valider les entrées côté serveur.
- Si la modification de TypeScript est nécessaire, passer par un AST plutôt que par une réécriture textuelle.
- Ajouter un diff avant sauvegarde, des sauvegardes automatiques et des commits dédiés.
- Gérer les conflits de versions et les champs inconnus explicitement.

### 4.2 Workspace / Deploy

**Faiblesses**
- Les commandes du projet sont exécutées sans isolation suffisante.
- L'installation des dépendances peut exécuter des scripts tiers.
- L'attente fixe d'environ 2,5 secondes n'est pas un véritable contrôle de disponibilité.
- Le port 4321 est traité comme une valeur fixe.
- L'état des processus est essentiellement en mémoire et la reprise après redémarrage est limitée.

**Solutions**
- Créer un ProcessManager dédié avec état explicite, PID, logs bornés et arrêt propre.
- Utiliser des ports dynamiques et détecter les collisions.
- Ajouter un healthcheck HTTP avec timeout et backoff.
- Exécuter les tâches dans un worker isolé.
- Prévoir nettoyage des processus orphelins et récupération après redémarrage.

### 4.3 Postgres / PGlite

**Faiblesses**
- La route de configuration divulgue un DSN de production.
- Les opérations destructives ne doivent pas être protégées uniquement par l'interface.
- Quotas, timeouts et contrôle de concurrence sont à renforcer.
- Les procédures de sauvegarde, restauration et rollback ne sont pas suffisamment formalisées.

**Solutions**
- Garder tous les DSN côté serveur.
- Ajouter autorisation explicite pour chaque opération SQL et chaque action destructive.
- Appliquer quotas, limites de durée, limites de résultats et contrôle de concurrence.
- Ajouter sauvegardes vérifiables, restauration testée et migrations versionnées.
- Journaliser les actions administratives sans enregistrer les valeurs sensibles.

### 4.4 Data / migrations

**Faiblesses**
- Certains chemins et scripts sont rigides.
- L'exécution de scripts de données peut exécuter du code non fiable.
- La validation des schémas, l'idempotence et le rollback complet des migrations sont à renforcer.

**Solutions**
- Définir un registre de migrations avec identifiant, version, dépendances et état.
- Exécuter les migrations dans un contexte contrôlé, avec transaction lorsque possible.
- Valider les données avant application.
- Prévoir stratégie de rollback ou procédure de restauration documentée.
- Ne jamais exécuter automatiquement une migration inconnue à l'ouverture d'un projet.

### 4.5 i18n

**Faiblesses**
- Le format JSON seul ne garantit pas la cohérence entre langues.
- Les clés manquantes, placeholders incohérents et règles de pluriel ne sont pas suffisamment contrôlés.

**Solutions**
- Valider les dictionnaires avec un schéma.
- Comparer les clés de toutes les langues avec une langue de référence.
- Vérifier les placeholders et les règles de pluriel.
- Utiliser ICU MessageFormat si les besoins de pluralisation et de genre le justifient.
- Ajouter des tests de non-régression sur les traductions.

### 4.6 Design system

**Faiblesses**
- L'extraction CSS par expressions régulières est fragile face à la syntaxe réelle de CSS.
- Les conventions de chemins de tokens ne sont pas totalement cohérentes entre documentation et code.
- Les références de tokens orphelines ne semblent pas toutes détectées.

**Solutions**
- Utiliser un parseur CSS/PostCSS.
- Séparer clairement tokens, thèmes et composants.
- Définir une convention unique et documentée.
- Détecter tokens inutilisés, références inconnues et valeurs invalides.
- Tester l'import/export sur CSS classique, variables, media queries et CSS Modules.

### 4.7 Images

**Faiblesses**
- Le type MIME et l'extension ne suffisent pas à valider un upload.
- Les variantes optimisées et métadonnées ne sont pas centralisées.
- La suppression d'images devrait vérifier les usages dans le projet.

**Solutions**
- Réencoder les images et supprimer les métadonnées sensibles lorsque pertinent.
- Générer des noms uniques côté serveur.
- Créer des variantes adaptées aux tailles d'affichage.
- Ajouter un inventaire des références avant suppression.
- Appliquer quotas et limites de traitement.

### 4.8 Notes

**Faiblesses**
- L'indexation, les métadonnées et le frontmatter méritent une validation formelle.
- Les liens internes peuvent devenir cassés.
- Les sauvegardes concurrentes et conflits d'édition doivent être gérés.

**Solutions**
- Définir un schéma de métadonnées.
- Ajouter un index des notes et une vérification des liens internes.
- Utiliser une version ou un hash de contenu pour détecter les conflits.
- Créer une sauvegarde avant écrasement.
- Prévoir une récupération après interruption.

### 4.9 Secrets

**Faiblesses**
- Les secrets stockés dans `.env` sont en clair sur le système de fichiers.
- Le masquage dans l'interface n'est pas une protection de l'API.
- Les routes filesystem peuvent contourner les protections de l'écran dédié.
- Le push Git peut inclure un fichier de secrets.
- La rotation et l'audit des accès sont à renforcer.

**Solutions**
- Utiliser un gestionnaire de secrets ou un stockage chiffré avec contrôle d'accès.
- Ne jamais renvoyer les valeurs secrètes après leur enregistrement.
- Séparer les opérations de lecture, écriture, rotation et suppression.
- Ajouter un scanner de secrets avant staging et push.
- Protéger les sauvegardes et limiter l'accès aux secrets au strict nécessaire.
- Prévoir une procédure de rotation et de révocation.

### 4.10 Settings / configuration projet

**Faiblesses**
- L'inspection des fichiers `package.json` et `astro.config` ne constitue pas un diagnostic complet du projet.
- `astro.config` est du code exécutable ; son import direct dans le serveur serait dangereux.
- Les scripts npm restent contrôlés par le projet.
- L'inventaire des dépendances et la détection de configuration invalide sont à renforcer.

**Solutions**
- Créer un Project Inspector qui lit et valide les métadonnées sans exécuter le projet.
- Analyser les fichiers de configuration avec des outils statiques lorsque possible.
- Exécuter les builds et validations dans un worker isolé.
- Produire un rapport de compatibilité Astro avec erreurs, avertissements et actions correctives.
- Vérifier les dépendances et les scripts avant exécution.

## 5. Architecture cible recommandée

Séparer le plan de contrôle de ConcordiaOS de l'exécution du projet importé.

```text
Interface React
      |
      v
API Gateway
  - authentification
  - autorisations par action
  - validation des entrées
  - CSRF / CORS
  - quotas et audit
      |
      +--------------------+
      |                    |
      v                    v
Control Plane          Data Plane
  - filesystem           - PGlite
  - configuration        - migrations
  - inventaire            - sauvegardes
  - secrets
      |
      v
Worker isolé
  - install
  - scripts
  - import contrôlé
  - tests / build
  - limites CPU/RAM/disque/temps/réseau
      |
      v
Projet Astro importé
```

Principes structurants :

1. Le processus Express ne doit pas exécuter de code fourni par le projet.
2. Le worker ne doit recevoir aucun secret interne dont il n'a pas besoin.
3. Le worker doit être isolé du système de fichiers hôte et du réseau interne.
4. Toute opération destructive doit être authentifiée, autorisée, journalisée et confirmée.
5. Les données utilisateur ne doivent jamais être supprimées automatiquement lors d'un démarrage ou d'un changement de projet.
6. Le frontend ne constitue jamais une frontière de sécurité.

## 6. Plan de remédiation priorisé

### PR 1 — Sécurisation de l'API (P0)

- Authentification obligatoire.
- Autorisations par route et par opération.
- Politique deny-by-default.
- CSRF/CORS adaptés au mode d'authentification.
- Rate limiting et limites de requêtes.
- Headers de sécurité et configuration d'écoute sûre.

### PR 2 — Filesystem et secrets (P0)

- Canonicalisation des chemins avec vérification de la cible réelle.
- Protection des liens symboliques et des traversées de répertoires.
- Refus d'accès à `.env`, `.git` et aux fichiers sensibles.
- Règles de lecture/écriture/suppression séparées.
- Suppression de la fuite des DSN.
- Tests de sécurité dédiés.

### PR 3 — Dépendances et chaîne d'installation (P0/P1)

- Choisir un gestionnaire de paquets.
- Réconcilier manifeste et lockfile.
- Mettre à jour Multer, Vite, body-parser et path-to-regexp.
- Ajouter scans de vulnérabilités en CI.
- Vérifier les avis des dépendances transitives après mise à jour.

### PR 4 — Isolation des processus (P0)

- Worker ou conteneur pour scripts, install, build, tests et imports exécutables.
- Quotas CPU, RAM, disque, réseau et durée.
- Aucun secret ConcordiaOS transmis au worker.
- Gestion des timeouts, annulation et nettoyage.

### PR 5 — Protection des projets et de Git (P0)

- Retirer le `rm -rf` automatique au démarrage.
- Préserver tout projet existant sans Git.
- Ajouter aperçu de diff, staging sélectif et scan de secrets.
- Rendre branche et remote configurables.
- Ne jamais publier automatiquement des données locales.

### PR 6 — Persistance et bases de données (P1)

- Retirer `pg-data/` du suivi Git.
- Sauvegardes cohérentes et restauration testée.
- Quotas, timeouts et autorisations SQL.
- Migrations versionnées et rollback documenté.

### PR 7 — Adaptateur Astro / Project Inspector (P1)

- Détection de la structure du projet.
- Validation statique de la configuration.
- Compatibilité des scripts et commandes.
- Diagnostic des erreurs avant import ou build.

### PR 8 — Tests et CI (P1)

- Tests unitaires des fonctions de chemins, validation et permissions.
- Tests d'intégration des routes API.
- Tests de sécurité : traversal, symlinks, CSRF, SSRF, upload, secrets.
- Vérification lockfile et installation propre.
- Typecheck, lint, tests et build dans GitHub Actions.

### PR 9 — Modularisation (P2)

- Séparer Express, filesystem, DB, Git, processus, seeds, proxy et intégrations IA.
- Définir des interfaces de services.
- Centraliser validation, erreurs et journalisation.
- Réduire la taille et la responsabilité de `server.ts`.

## 7. Tests de validation indispensables

Avant de considérer les corrections comme terminées, ajouter au minimum :

- Un appel non authentifié à chaque route sensible doit être refusé.
- Un utilisateur sans permission ne peut pas lire, écrire, supprimer, exécuter ou publier.
- Les chemins `../`, encodés, absolus et les liens symboliques ne permettent pas de sortir du répertoire autorisé.
- Les fichiers `.env`, `.git/config` et clés privées ne sont jamais exposés par les API.
- Une URL SSRF vers loopback, réseau privé, IPv6 locale ou via redirection est bloquée.
- Les uploads invalides, trop volumineux ou dont le MIME est falsifié sont rejetés.
- Un projet importé contenant un script malveillant ne peut pas lire les secrets du serveur ni écrire hors de son sandbox.
- Un dossier projet sans `.git` reste intact au démarrage.
- Un push Git refuse les secrets et ne stage que les fichiers choisis.
- Les lockfiles sont cohérents et l'installation propre fonctionne en CI.
- Une sauvegarde de base peut être restaurée dans un environnement propre.

## 8. Conclusion

ConcordiaOS réunit des capacités puissantes — filesystem, base de données, exécution de commandes, gestion Git et manipulation de projets Astro. Ces capacités nécessitent une séparation nette entre les opérations de confiance de l'application et le contenu potentiellement non fiable des projets importés.

**Les corrections P0 à traiter en premier sont l'authentification et l'autorisation de l'API, la protection du filesystem et des secrets, l'isolation de l'exécution de code, la suppression automatique du dossier projet et la sécurisation du push Git.** Les mises à jour de dépendances doivent être réalisées en parallèle, avec validation par tests et vérification des avis actuels.

Cet audit est un diagnostic statique destiné à guider les corrections. Il ne constitue ni une certification de sécurité ni une preuve d'exploitation. Chaque scénario doit être validé par des tests contrôlés après correction.
