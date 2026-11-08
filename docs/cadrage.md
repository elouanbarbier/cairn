# Cadrage — Cairn, gestion de projet open source

Nov 6, 2026 · @Elouan

## Vision et positionnement

Cairn est un outil de gestion de projet open source, auto-hébergeable en un seul conteneur sur un Raspberry Pi, avec le niveau de finition visuelle de Linear. Il s'adresse à ceux qui pilotent plusieurs projets découpés en sous-projets et en sujets, pas aux équipes de dev qui gèrent des tickets.

- **Problème** : OneNote manque de structure, Notion oblige à construire sa synthèse soi-même, Jira, Linear et Plane sont pensés pour le développement logiciel (issues, cycles, PR), Vikunja est fonctionnel mais peu agréable.
- **Promesse** : en ouvrant l'app, on voit en 5 secondes ce qui est en cours, ce qui attend, ce qui arrive à échéance et ce qui dort.
- **Cible v1** : une personne ou une petite équipe (5 personnes maximum) qui organise son travail. Premier utilisateur : Elouan, pour ses projets chez CGI.
- **Ce que Cairn n'est pas** : un outil de ticketing dev, un wiki, un outil de suivi du temps.

## Principes directeurs

Chaque arbitrage technique ou produit se tranche avec ces sept règles.

1. **Léger** : un seul conteneur Docker, une base SQLite, à l'aise sur un Raspberry Pi 4 (4 Go).
2. **Vocabulaire de gestion de projet** : projets, sous-projets, sujets. Jamais d'issues, de cycles ou de PR.
3. **Clavier d'abord** : tout est faisable sans souris, avec une palette de commandes (Cmd/Ctrl+K).
4. **Instantané** : mises à jour optimistes ; aucune action ne doit donner l'impression d'attendre le Pi.
5. **Synthèse native** : la vue d'ensemble est la page d'accueil, pas un tableau de bord à configurer.
6. **Design sobre et soigné** : densité, précision, peu de couleurs, animations discrètes.
7. **Données ouvertes** : export JSON/CSV complet, fichier SQLite lisible, API REST documentée.

## Modèle de données

La hiérarchie est fixe sur deux niveaux de conteneurs : **Projet → Sous-projet → Sujet**. Un sujet appartient toujours à un projet ; son sous-projet est facultatif (il tombe alors dans « Sans sous-projet »). Pas d'imbrication infinie en v1 : c'est un choix délibéré pour garder une interface simple.

| Entité | Champs principaux | Remarques |
| --- | --- | --- |
| `projects` | id (ULID), key (2 à 5 lettres, ex. `CFE`), name, description (markdown), color, icon, status, start\_date, target\_date, sort\_order, created\_at, updated\_at, archived\_at | Statuts : Actif, En pause, Terminé, Archivé |
| `subprojects` | id, project\_id, name, description, status, target\_date, sort\_order, created\_at, updated\_at, archived\_at | Mêmes statuts que les projets |
| `topics` (sujets) | id, project\_id, subproject\_id (nullable), number, title, description (markdown), status, priority, due\_date, assignee\_id (nullable), sort\_order, created\_at, updated\_at, last\_activity\_at, completed\_at | Identifiant lisible `CFE-12` : number séquentiel par projet |
| `checklist_items` | id, topic\_id, text, done, sort\_order | Sous-tâches légères d'un sujet |
| `topic_notes` | id, topic\_id, author\_id, body (markdown), created\_at, updated\_at | Journal de suivi du sujet |
| `labels` / `topic_labels` | id, name, color / topic\_id, label\_id | Étiquettes transverses aux projets |
| `activity` | id, entity\_type, entity\_id, actor\_id, action, payload (JSON), created\_at | Historique et calcul de l'activité |
| `users` | id, email, name, password\_hash, role (admin, membre), created\_at | Premier compte créé = admin |
| `api_tokens` | id, user\_id, name, token\_hash, last\_used\_at, created\_at | Pour les scripts et l'IA |
| `settings` | key, value (JSON) | Seuil de dormance, langue, configuration IA |

**Statuts des sujets** (noms fixes en v1, chacun rattaché à une catégorie) : Backlog, À faire, En cours, En attente, Terminé, Abandonné. Les catégories « ouvert » (À faire, En cours, En attente), « non trié » (Backlog) et « fermé » (Terminé, Abandonné) pilotent les calculs.

**Priorités** : Aucune, Basse, Moyenne, Haute, Urgente.

**Règles métier** :

- `last_activity_at` est mis à jour à toute modification du sujet : champ, note, élément de checklist.
- Un sujet est **dormant** s'il est dans une catégorie « ouvert » et que `last_activity_at` dépasse N jours (14 par défaut, réglable).
- La **progression** d'un sous-projet ou d'un projet = sujets terminés / sujets non abandonnés.
- `sort_order` utilise un index fractionnaire (chaîne) pour réordonner sans réécrire toute la liste.

## Écrans et parcours

L'interface tient en une barre latérale, une zone principale et un panneau de détail qui glisse depuis la droite. Chaque état a son URL (ex. `/p/CFE/sujets/CFE-12`).

**Barre latérale** : Vue d'ensemble, Mes sujets, Projets (arborescence dépliable avec les sous-projets), Recherche, Paramètres.

1. **Vue d'ensemble** (page d'accueil). Elle répond à quatre questions : qu'est-ce qui avance, qu'est-ce qui coince, qu'est-ce qui arrive, qu'est-ce qui dort.
   1. En cours, groupé par projet.
   2. En attente, avec la date depuis laquelle le sujet attend.
   3. Échéances : en retard et 7 prochains jours.
   4. Dormants : sujets ouverts sans activité depuis N jours.
   5. Progression des projets actifs : barre et compteurs par sous-projet.
   6. Terminés ces 7 derniers jours.
2. **Projet**. En-tête avec nom, statut, échéance et progression. Onglets : Sujets (liste groupée par sous-projet ou kanban par statut), Sous-projets (cartes avec progression), Notes (markdown libre), Activité.
3. **Sous-projet**. Mêmes vues liste et kanban, filtrées sur le sous-projet, avec sa description et sa progression.
4. **Détail d'un sujet**. Panneau latéral, ou plein écran via son URL. Titre et description éditables en place, propriétés dans une colonne à droite (statut, priorité, échéance, sous-projet, étiquettes, assigné), checklist, journal de notes, historique d'activité.
5. **Palette de commandes** (Cmd/Ctrl+K). Naviguer, créer, changer un statut, rechercher, lancer une action.
6. **Recherche**. Plein texte (SQLite FTS5) sur titres, descriptions et notes.
7. **Paramètres**. Compte, utilisateurs, seuil de dormance, langue, thème, export et import, IA.

**Filtres** sur toutes les listes : statut, priorité, étiquette, échéance, assigné. Les vues sauvegardées arrivent en v1.1.

## Interactions et raccourcis clavier

Le parcours principal (créer, trier, faire avancer un sujet) doit se faire entièrement au clavier.

| Raccourci | Action |
| --- | --- |
| Cmd/Ctrl+K | Palette de commandes |
| C | Nouveau sujet dans le contexte courant |
| Shift+P | Nouveau projet |
| S | Changer le statut |
| P | Changer la priorité |
| D | Définir l'échéance |
| L | Étiquettes |
| M | Déplacer vers un autre projet ou sous-projet |
| J / K | Élément suivant / précédent |
| Entrée / Échap | Ouvrir / fermer le détail |
| X | Sélectionner (sélection multiple) |
| / | Rechercher |
| G puis O / G puis P | Aller à la vue d'ensemble / aux projets |
| ? | Afficher tous les raccourcis |

**Autres interactions** :

- Glisser-déposer dans le kanban (changement de statut) et dans les listes (réordonnancement).
- Édition en place des titres et propriétés, sans formulaire modal.
- Actions groupées sur une sélection multiple.
- Mises à jour optimistes, avec retour arrière et notification en cas d'erreur serveur.
- Annuler la dernière action (Cmd/Ctrl+Z) : v1.1.

## Design system

L'objectif est le niveau de finition de Linear : dense, précis, calme. On s'inspire de Linear, Plane et Raycast pour l'esprit, sans copier leurs assets, icônes ni marque.

| Élément | Choix |
| --- | --- |
| Thèmes | Clair et sombre, suit le système par défaut |
| Typographie | Inter (variable, auto-hébergée, aucun appel externe), base 13 à 14 px, chiffres tabulaires pour les compteurs ; JetBrains Mono pour les identifiants (`CFE-12`) |
| Couleurs | Gris neutres (palette zinc), un seul accent (indigo, réglable), couleurs uniquement porteuses de sens |
| Statuts | Icônes rondes qui se remplissent selon l'avancement : Backlog gris pointillé, À faire gris, En cours ambre, En attente orange, Terminé vert, Abandonné gris barré |
| Priorités | Icônes en barres façon signal, Urgente en rouge |
| Densité | Lignes de 32 à 36 px, grille de 4 px, rayons de 6 à 8 px, bordures de 1 px discrètes, ombres réservées aux éléments flottants |
| Animations | 120 à 200 ms, ouvertures de panneaux et réordonnancement ; respecte `prefers-reduced-motion` |
| Icônes | Lucide, plus des icônes de statut et de priorité dessinées en SVG |
| Composants | shadcn/ui (Radix) et Tailwind CSS v4, cmdk pour la palette, dnd-kit pour le glisser-déposer, Sonner pour les notifications, TipTap pour l'éditeur (stockage en markdown) |

**Exigences** :

- Tokens de design (couleurs, espacements, rayons) en variables CSS ; aucune couleur en dur dans les composants.
- Accessibilité : contrastes WCAG AA, focus visible partout, navigation clavier complète.
- États vides soignés sur chaque écran (illustration sobre et action principale).
- Desktop d'abord ; mobile utilisable pour consulter et changer un statut, installable en PWA.
- Interface traduite en français et en anglais dès le départ (fichiers de traduction, aucun texte en dur).

## Architecture technique et stack

Un monorepo TypeScript et un seul processus Node qui sert à la fois l'API et l'interface compilée : c'est le plus léger sur un Pi et le plus simple à déployer.

&#91;embedded content: architecture · un conteneur, une base SQLite\]

Le navigateur et les scripts passent par la même API ; l'IA n'est appelée que si elle est configurée.

| Couche | Choix | Pourquoi |
| --- | --- | --- |
| Front | React 19, Vite, TanStack Router, TanStack Query | Routage typé, cache et mises à jour optimistes |
| UI | Tailwind CSS v4, shadcn/ui, cmdk, dnd-kit, TipTap | Base de composants accessibles et proche de l'esthétique visée |
| Back | Hono sur Node.js 22 LTS | Léger, rapide, bon support arm64 |
| Validation | Zod, schémas partagés front/back, OpenAPI généré (`@hono/zod-openapi`) | Une seule source de vérité, API documentée pour l'open source |
| Base | SQLite en mode WAL, better-sqlite3, Drizzle ORM et Drizzle Kit | Un fichier, zéro service à côté, migrations au démarrage |
| Recherche | SQLite FTS5 | Plein texte sans moteur externe |
| Auth | Sessions en cookie httpOnly, mots de passe argon2id, jetons d'API personnels | Simple et sûr, suffisant pour une petite équipe |
| Tests | Vitest (serveur et logique), Playwright (parcours clés) | Standard de l'écosystème |
| Outillage | pnpm workspaces, Biome (lint et format) | Rapide, une seule config |

**Structure du dépôt** :

```
cairn/
  apps/web/         # SPA React
  apps/server/      # API Hono, sert aussi la SPA compilée
  packages/shared/  # schémas Zod, types, constantes (statuts, priorités)
  docker/           # Dockerfile, docker-compose d'exemple
  docs/             # installation, configuration, API, architecture
```

**Choix écartés** : Next.js (plus lourd au build et à l'exécution sur un Pi, API moins nette pour les intégrations), PostgreSQL (un service de plus pour un besoin couvert par SQLite), temps réel en v1 (remplacé par un rafraîchissement au retour sur l'onglet et un polling léger de 30 s ; SSE envisageable ensuite).

## Déploiement Raspberry Pi et cibles de performance

Cairn s'installe avec un `docker-compose.yml` de dix lignes et un seul volume : c'est le critère d'acceptation du déploiement.

```yaml
services:
  cairn:
    image: ghcr.io/<owner>/cairn:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      CAIRN_SECRET: "à-générer"
      CAIRN_BASE_URL: "https://cairn.example.com"
```

- **Image** multi-architecture (`linux/amd64` et `linux/arm64`) publiée sur GitHub Container Registry à chaque tag. better-sqlite3 est un module natif : le build arm64 passe par des runners arm64 ou par buildx avec QEMU.
- **Volume** `/data` unique : base SQLite, et plus tard les pièces jointes.
- **Variables** : `CAIRN_SECRET` (signature des sessions), `CAIRN_BASE_URL`, `CAIRN_AI_*` (facultatif). Tout le reste se règle dans l'interface.
- **Sauvegarde** : commande `cairn backup` (sauvegarde à chaud SQLite) à planifier en cron, plus l'export JSON depuis l'interface.
- **Exposition** : la doc couvre Cloudflare Tunnel (avec Cloudflare Access recommandé) et un reverse proxy classique (Caddy).

| Cible | Valeur sur Raspberry Pi 4 (4 Go) |
| --- | --- |
| Taille de l'image | moins de 200 Mo |
| RAM au repos | moins de 150 Mo |
| Démarrage du conteneur | moins de 5 s |
| Réponse API (p95), 5 000 sujets | moins de 50 ms |
| Premier chargement sur réseau local | moins de 1,5 s |
| JavaScript initial | moins de 300 Ko gzip |

## Synthèse IA (optionnelle)

L'IA est désactivée par défaut et arrive en v1.1 : Cairn doit être complet sans elle, et l'IA ne fait que résumer ce que la vue d'ensemble montre déjà.

- **Bouton « Synthèse »** sur la vue d'ensemble et sur chaque projet : ce qui avance, ce qui bloque, ce qui dort, trois priorités suggérées.
- **Résumé hebdomadaire** planifié (par défaut le lundi à 8 h), affiché dans l'app et envoyé par e-mail si un serveur SMTP est configuré.
- **Fournisseurs** derrière une interface commune : Anthropic et tout fournisseur compatible OpenAI, ce qui couvre Ollama en local.
- **Confidentialité** : la clé reste côté serveur, jamais renvoyée au front. Un aperçu montre exactement ce qui sera envoyé (titres, statuts, dates, notes récentes), et chaque projet peut être exclu.
- **Plus tard** : un serveur MCP intégré pour qu'un assistant IA lise et mette à jour les sujets directement.

## Périmètre MVP et hors périmètre

La v1.0 couvre l'organisation projet / sous-projet / sujet, la vue d'ensemble et un déploiement propre sur Pi. Tout le reste attend.

**Dans la v1.0** :

- Projets, sous-projets et sujets : création, édition, archivage, réordonnancement.
- Statuts, priorités, échéances, étiquettes, assignation, checklist, journal de notes, historique d'activité.
- Vues liste et kanban, filtres, recherche plein texte.
- Vue d'ensemble avec détection des sujets dormants et progression.
- Palette de commandes et raccourcis clavier.
- Comptes utilisateurs simples (admin et membre), jetons d'API.
- Export et import JSON, export CSV, sauvegarde.
- Thèmes clair et sombre, interface en français et en anglais.
- Image Docker multi-architecture et documentation d'installation.

**Hors périmètre** (refusé tant que la v1.0 n'est pas sortie) :

- Cycles, sprints, estimations, vélocité.
- Intégrations Git, GitHub, CI.
- Diagramme de Gantt, suivi du temps.
- Notifications e-mail ou push (sauf le résumé IA en v1.1).
- Permissions fines par projet, multi-espaces, champs personnalisés, automatisations.
- Temps réel multi-utilisateurs, pièces jointes, application mobile native.
- Import depuis Jira, Linear ou Notion.

## Roadmap par jalons

Sept jalons, chacun livrable et testable seul. Un jalon n'est terminé que lorsque son critère est rempli et la CI verte.

1. **J0 · Fondations**. Monorepo pnpm, Biome, CI, schéma de base et migrations Drizzle, jeu de données de démonstration, squelette Hono et SPA, layout avec barre latérale.
   - Terminé quand `pnpm dev` lance le front et l'API, et que la CI passe.
2. **J1 · Cœur**. API et interface pour projets, sous-projets et sujets ; vue liste ; panneau de détail ; statuts, priorités, échéances, checklist, notes.
   - Terminé quand on crée Projet → Sous-projet → Sujets et qu'on les fait évoluer sans recharger la page.
3. **J2 · Vitesse**. Kanban, glisser-déposer, palette Cmd/Ctrl+K, raccourcis, filtres, recherche FTS5.
   - Terminé quand le parcours principal se fait entièrement au clavier.
4. **J3 · Vue d'ensemble**. Blocs de synthèse, sujets dormants, progression, activité récente.
   - Terminé quand la page d'accueil répond aux quatre questions de la section Écrans.
5. **J4 · Prêt pour le Pi**. Authentification, jetons d'API, image Docker multi-architecture, docker-compose, sauvegarde, export et import.
   - Terminé quand l'installation sur un Pi 4 prend moins de 10 minutes en suivant le README et que les cibles de performance sont tenues.
6. **J5 · v1.0 publique**. Traductions FR et EN, thèmes, états vides, accessibilité, README avec captures, licence, première release.
   - Terminé quand la release v1.0.0 est publiée et installable par un inconnu.
7. **J6 · v1.1**. Synthèse IA, vues sauvegardées, annulation (Cmd/Ctrl+Z).
   - Terminé quand le résumé hebdomadaire tourne sur le Pi d'Elouan pendant deux semaines.

## Open source

Le dépôt est public sur GitHub dès J0, avec une licence AGPL-3.0 recommandée (voir Décisions à valider).

- **Licence** : AGPL-3.0 empêche qu'un tiers en fasse un service hébergé fermé ; c'est le choix de Plane. MIT maximise l'adoption mais n'offre pas cette protection.
- **Fichiers du dépôt** : README (pitch, capture ou GIF, installation en 3 commandes), CONTRIBUTING, CODE\_OF\_CONDUCT, LICENSE, modèles d'issues et de PR, CHANGELOG.
- **Conventions** : code, commits et documentation technique en anglais ; Conventional Commits ; SemVer ; release-please pour le changelog et les tags.
- **CI GitHub Actions** : lint et typecheck, tests Vitest, tests Playwright sur les parcours clés, build et publication de l'image multi-architecture sur GHCR à chaque tag.
- **Documentation** dans `docs/` : installation, configuration, sauvegarde, API (OpenAPI généré), architecture.

## Instructions de développement

Ce document est la référence du projet. Lis-le en entier avant d'écrire du code, puis avance jalon par jalon.

1. **Un jalon à la fois**, dans l'ordre de la roadmap, sur une branche dédiée. Au début de chaque jalon, propose un plan court (fichiers, étapes, tests) et attends la validation.
2. **Crée et tiens à jour des notes de projet** (fichier local, hors dépôt) : commandes utiles, conventions, décisions prises et leur raison.
3. **Respecte la stack** de la section Architecture. Toute nouvelle dépendance se justifie et se demande avant d'être ajoutée.
4. **TypeScript strict**, pas de `any`. Les schémas Zod de `packages/shared` sont la source de vérité des types et de l'API.
5. **Tests avec chaque fonctionnalité** : Vitest pour la logique et l'API, Playwright pour les parcours clés.
6. **Design system** : composants shadcn/ui et tokens CSS uniquement, aucune couleur ni chaîne d'interface en dur (tout passe par les fichiers de traduction).
7. **Performance** : vérifie le build arm64 et mesure la RAM à J4 au regard des cibles.
8. **Hors périmètre** : ne l'implémente pas, même partiellement. Note les idées dans `docs/ideas.md`.
9. **Décisions ouvertes** : si une question de la section suivante bloque, applique la recommandation et note-le dans les notes de projet.
10. **Données de démonstration** génériques et réalistes (aucune donnée client), pour tester la vue d'ensemble dès J1.

## Décisions à valider

Huit choix restent ouverts ; la recommandation s'applique tant qu'Elouan n'a pas tranché.

| Décision | Recommandation | Alternative |
| --- | --- | --- |
| Nom du projet | Cairn (provisoire), à vérifier sur GitHub, npm et le nom de domaine | Menhir, Balise |
| Licence | AGPL-3.0 | MIT |
| Langue par défaut de l'interface | Anglais, avec le français complet | Français |
| Multi-utilisateur en v1 | Oui, basique (comptes, assignation) | Mono-utilisateur |
| Statuts personnalisables en v1 | Non, noms fixes | Oui, noms et couleurs modifiables |
| Sujets sans sous-projet | Autorisés | Sous-projet obligatoire |
| Éditeur de texte | TipTap avec stockage markdown | Zone de texte markdown avec aperçu |
| Runtime serveur | Node.js 22 LTS | Bun |
