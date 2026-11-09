import {
  addDays,
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  isClosed,
  type ProjectStatus,
  sortKeysAfter,
  type TopicPriority,
  type TopicStatus,
  toISODate,
} from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { hashPasswordSync } from '../accounts.ts';
import type { Db } from '../db/index.ts';
import * as schema from '../db/schema.ts';

/**
 * Generic, realistic demo data (no client data). Every date is relative to
 * `now`, so the overview always has something in each block.
 */

const DAY = 86_400_000;

interface DemoTopic {
  n: number;
  title: string;
  status: TopicStatus;
  priority: TopicPriority;
  sub: string | null;
  labels?: string[];
  /** Due date, in days from today. */
  due?: number;
  /** Days since the last activity. */
  idle?: number;
  /** Days since completion (done or cancelled). */
  closedAgo?: number;
  /** Days since the topic entered `waiting`. */
  waitingAgo?: number;
  createdAgo?: number;
  assignee?: 'me' | 'teammate' | null;
  description?: string;
  checklist?: Array<[string, boolean]>;
}

interface DemoProject {
  key: string;
  name: string;
  color: string;
  status: ProjectStatus;
  description: string;
  target?: number;
  subprojects: Array<{ name: string; description: string; target?: number }>;
  assignee: 'me' | 'teammate';
  topics: DemoTopic[];
}

const LABELS = [
  { name: 'Front', color: '#2563EB' },
  { name: 'Back', color: '#9333EA' },
  { name: 'Règles métier', color: '#D97706' },
  { name: 'Recette', color: '#16A34A' },
  { name: 'Contenu', color: '#DB2777' },
  { name: 'Support', color: '#0891B2' },
] as const;

const POR_24_DESCRIPTION = `Certains champs ne doivent devenir obligatoires qu'en fonction des réponses précédentes. La règle s'applique dans le navigateur pour un retour immédiat, puis elle est revérifiée côté serveur.

**Cas à couvrir**

- Le numéro SIRET est obligatoire quand le statut choisi est « Entreprise ».
- La date de fin n'est demandée que pour un contrat à durée déterminée.
- Le message d'erreur s'affiche sous le champ concerné, jamais en haut de page.`;

const PROJECTS: DemoProject[] = [
  {
    key: 'POR',
    name: 'Portail client',
    color: '#6366F1',
    status: 'active',
    description:
      "Refonte des formulaires et de l'aide en ligne du portail usagers. Livraison visée avant les congés de fin d'année.",
    target: 42,
    assignee: 'me',
    subprojects: [
      {
        name: 'Formulaires avancés',
        description:
          "Règles de validation, champs conditionnels et parcours en plusieurs étapes du formulaire d'adhésion.",
        target: 27,
      },
      { name: 'Gestion des erreurs', description: 'Messages lisibles, journalisation et pages d’erreur.', target: 34 },
      { name: 'FAQ dynamique', description: 'Questions fréquentes consultables et recherchables.', target: 38 },
      { name: 'Recette', description: 'Cahiers de recette et tests de non-régression.', target: 42 },
    ],
    topics: [
      {
        n: 24,
        title: "Validation conditionnelle du formulaire d'adhésion",
        status: 'in_progress',
        priority: 'high',
        sub: 'Formulaires avancés',
        labels: ['Front', 'Règles métier'],
        due: 5,
        createdAgo: 10,
        description: POR_24_DESCRIPTION,
        checklist: [
          ['Lister les règles avec le métier', true],
          ["Prototype sur l'étape 1 du formulaire", true],
          ['Mutualiser la fonction de validation navigateur et serveur', true],
          ['Tester sur mobile (iOS et Android)', false],
          ["Revue avec l'équipe avant recette", false],
        ],
      },
      {
        n: 22,
        title: 'Validation des libellés par le métier',
        status: 'waiting',
        priority: 'medium',
        sub: 'Formulaires avancés',
        labels: ['Contenu'],
        waitingAgo: 9,
      },
      {
        n: 28,
        title: 'Sauvegarde du brouillon entre deux étapes du formulaire',
        status: 'todo',
        priority: 'medium',
        sub: 'Formulaires avancés',
        labels: ['Front', 'Back'],
        due: 14,
        idle: 3,
        checklist: [
          ['Choisir le stockage du brouillon', true],
          ['Restaurer le brouillon au retour', false],
        ],
      },
      {
        n: 12,
        title: 'Harmoniser les libellés des champs',
        status: 'todo',
        priority: 'low',
        sub: 'Formulaires avancés',
        labels: ['Contenu'],
        idle: 23,
      },
      {
        n: 30,
        title: "Champs dépendants pour l'adresse",
        status: 'backlog',
        priority: 'low',
        sub: 'Formulaires avancés',
        labels: ['Front'],
        idle: 6,
      },
      {
        n: 20,
        title: 'Masquer les champs inutiles selon le profil',
        status: 'done',
        priority: 'medium',
        sub: 'Formulaires avancés',
        labels: ['Front'],
        due: -1,
        closedAgo: 1,
      },
      {
        n: 16,
        title: 'Étapes du formulaire en accordéon',
        status: 'done',
        priority: 'medium',
        sub: 'Formulaires avancés',
        labels: ['Front'],
        closedAgo: 12,
      },
      {
        n: 14,
        title: "Message de confirmation après l'envoi",
        status: 'done',
        priority: 'low',
        sub: 'Formulaires avancés',
        labels: ['Contenu'],
        closedAgo: 15,
      },
      {
        n: 10,
        title: "Indicateur d'étape dans l'en-tête",
        status: 'done',
        priority: 'low',
        sub: 'Formulaires avancés',
        labels: ['Front'],
        closedAgo: 20,
      },
      {
        n: 8,
        title: "Libellés accessibles pour les lecteurs d'écran",
        status: 'done',
        priority: 'medium',
        sub: 'Formulaires avancés',
        labels: ['Front'],
        closedAgo: 25,
      },
      {
        n: 6,
        title: 'Signaler les champs obligatoires',
        status: 'done',
        priority: 'low',
        sub: 'Formulaires avancés',
        labels: ['Contenu'],
        closedAgo: 30,
      },
      {
        n: 29,
        title: "Corriger l'envoi des pièces jointes",
        status: 'todo',
        priority: 'urgent',
        sub: 'Gestion des erreurs',
        labels: ['Back'],
        due: -2,
        idle: 2,
      },
      {
        n: 31,
        title: "Messages d'erreur JS lisibles côté usager",
        status: 'in_progress',
        priority: 'medium',
        sub: 'Gestion des erreurs',
        labels: ['Front'],
        due: 7,
        idle: 1,
      },
      {
        n: 33,
        title: 'Journaliser les erreurs côté serveur',
        status: 'backlog',
        priority: 'none',
        sub: 'Gestion des erreurs',
        labels: ['Back'],
        idle: 8,
      },
      {
        n: 26,
        title: "Page d'erreur 404 personnalisée",
        status: 'done',
        priority: 'low',
        sub: 'Gestion des erreurs',
        labels: ['Front'],
        closedAgo: 9,
      },
      {
        n: 21,
        title: "Délai d'expiration de session expliqué",
        status: 'done',
        priority: 'medium',
        sub: 'Gestion des erreurs',
        labels: ['Contenu'],
        closedAgo: 11,
      },
      {
        n: 15,
        title: "Codes d'erreur unifiés côté API",
        status: 'done',
        priority: 'high',
        sub: 'Gestion des erreurs',
        labels: ['Back'],
        closedAgo: 18,
      },
      {
        n: 11,
        title: 'Message en cas de perte de connexion',
        status: 'done',
        priority: 'low',
        sub: 'Gestion des erreurs',
        labels: ['Front'],
        closedAgo: 22,
      },
      {
        n: 27,
        title: 'Retour du client sur les maquettes FAQ',
        status: 'waiting',
        priority: 'high',
        sub: 'FAQ dynamique',
        labels: ['Contenu'],
        waitingAgo: 6,
      },
      {
        n: 18,
        title: 'Arborescence des questions fréquentes',
        status: 'in_progress',
        priority: 'low',
        sub: 'FAQ dynamique',
        labels: ['Contenu', 'Front'],
        idle: 4,
      },
      {
        n: 25,
        title: 'Recherche plein texte dans la FAQ',
        status: 'backlog',
        priority: 'medium',
        sub: 'FAQ dynamique',
        labels: ['Back'],
        idle: 10,
      },
      {
        n: 23,
        title: 'Rédiger les vingt premières questions',
        status: 'done',
        priority: 'medium',
        sub: 'FAQ dynamique',
        labels: ['Contenu'],
        closedAgo: 8,
      },
      {
        n: 17,
        title: 'Maquette de la page FAQ',
        status: 'done',
        priority: 'medium',
        sub: 'FAQ dynamique',
        labels: ['Front'],
        closedAgo: 14,
      },
      {
        n: 13,
        title: 'Choix du composant accordéon',
        status: 'done',
        priority: 'low',
        sub: 'FAQ dynamique',
        labels: ['Front'],
        closedAgo: 19,
      },
      {
        n: 34,
        title: 'Cahier de recette du lot formulaires',
        status: 'todo',
        priority: 'medium',
        sub: 'Recette',
        labels: ['Recette'],
        due: 21,
        idle: 2,
      },
      {
        n: 35,
        title: 'Plan de tests de non-régression',
        status: 'backlog',
        priority: 'low',
        sub: 'Recette',
        labels: ['Recette'],
        idle: 5,
      },
      {
        n: 19,
        title: 'Recette manuelle des formulaires v1',
        status: 'cancelled',
        priority: 'none',
        sub: 'Recette',
        labels: ['Recette'],
        closedAgo: 3,
      },
      {
        n: 32,
        title: 'Environnement de recette prêt',
        status: 'done',
        priority: 'high',
        sub: 'Recette',
        labels: ['Recette'],
        closedAgo: 4,
      },
    ],
  },
  {
    key: 'AIDE',
    name: "Centre d'aide",
    color: '#0D9488',
    status: 'active',
    description: 'Outils et procédures du support niveau 1 et 2.',
    target: 60,
    assignee: 'teammate',
    subprojects: [
      { name: 'Applications internes', description: 'Outils maison utilisés par le support.' },
      { name: 'Macros et déclencheurs', description: 'Réponses types et automatisations du support.' },
      { name: 'Statistiques', description: 'Indicateurs mensuels et tableaux de bord.' },
    ],
    topics: [
      {
        n: 9,
        title: "Mettre à jour l'app de suivi des tickets",
        status: 'in_progress',
        priority: 'urgent',
        sub: 'Applications internes',
        labels: ['Support'],
        due: 2,
        idle: 0.3,
        assignee: 'me',
      },
      {
        n: 14,
        title: 'Revoir les macros de réponse niveau 1',
        status: 'in_progress',
        priority: 'medium',
        sub: 'Macros et déclencheurs',
        labels: ['Support', 'Contenu'],
        due: 13,
        idle: 2,
      },
      {
        n: 7,
        title: 'Exporter les statistiques mensuelles',
        status: 'todo',
        priority: 'medium',
        sub: 'Statistiques',
        due: -3,
        idle: 5,
      },
      {
        n: 5,
        title: 'Documenter les déclencheurs SLA',
        status: 'todo',
        priority: 'medium',
        sub: 'Macros et déclencheurs',
        labels: ['Support'],
        idle: 18,
      },
      {
        n: 11,
        title: "Accès à l'API de recette demandé",
        status: 'waiting',
        priority: 'medium',
        sub: 'Applications internes',
        waitingAgo: 3,
      },
      {
        n: 15,
        title: "Former l'équipe au nouvel outil",
        status: 'backlog',
        priority: 'low',
        sub: 'Applications internes',
        idle: 7,
      },
      {
        n: 12,
        title: 'Nouvelle macro « Relance client »',
        status: 'done',
        priority: 'low',
        sub: 'Macros et déclencheurs',
        labels: ['Support'],
        closedAgo: 2,
      },
      {
        n: 8,
        title: 'Corriger la clôture automatique des tickets',
        status: 'done',
        priority: 'high',
        sub: 'Applications internes',
        closedAgo: 4,
      },
      {
        n: 13,
        title: "Synchroniser les contacts de l'annuaire",
        status: 'done',
        priority: 'medium',
        sub: 'Applications internes',
        closedAgo: 9,
      },
      {
        n: 10,
        title: 'Mettre à jour les horaires du support',
        status: 'done',
        priority: 'low',
        sub: null,
        labels: ['Contenu'],
        closedAgo: 13,
      },
      {
        n: 6,
        title: "Règle d'escalade vers le niveau 2",
        status: 'done',
        priority: 'high',
        sub: 'Macros et déclencheurs',
        closedAgo: 21,
      },
      {
        n: 4,
        title: 'Modèle de réponse « Mot de passe oublié »',
        status: 'done',
        priority: 'low',
        sub: 'Macros et déclencheurs',
        closedAgo: 27,
      },
      {
        n: 3,
        title: 'Tableau de bord des délais de réponse',
        status: 'done',
        priority: 'medium',
        sub: 'Statistiques',
        closedAgo: 30,
      },
      { n: 2, title: 'Nettoyer les étiquettes des tickets', status: 'done', priority: 'low', sub: null, closedAgo: 35 },
      {
        n: 1,
        title: 'Inventaire des macros existantes',
        status: 'done',
        priority: 'low',
        sub: 'Macros et déclencheurs',
        closedAgo: 40,
      },
    ],
  },
  {
    key: 'OUT',
    name: 'Veille et outillage',
    color: '#9333EA',
    status: 'active',
    description: 'Outils personnels, auto-hébergement et veille technique.',
    assignee: 'me',
    subprojects: [
      { name: 'Cairn', description: 'Outil de gestion de projet auto-hébergé.' },
      { name: 'Raspberry Pi', description: 'Serveur domestique et sauvegardes.' },
    ],
    topics: [
      {
        n: 3,
        title: 'Cadrage du MVP de Cairn',
        status: 'in_progress',
        priority: 'high',
        sub: 'Cairn',
        due: 3,
        idle: 0.5,
      },
      {
        n: 8,
        title: 'Réserver un nom de domaine pour Cairn',
        status: 'todo',
        priority: 'medium',
        sub: 'Cairn',
        idle: 2,
      },
      {
        n: 6,
        title: 'Script de sauvegarde du Raspberry Pi',
        status: 'todo',
        priority: 'low',
        sub: 'Raspberry Pi',
        idle: 15,
      },
      { n: 4, title: 'Comparer les outils de gestion de projet', status: 'todo', priority: 'low', sub: null, idle: 6 },
      { n: 5, title: 'Tester Cloudflare Tunnel', status: 'backlog', priority: 'medium', sub: 'Raspberry Pi', idle: 9 },
      {
        n: 7,
        title: 'Lire la documentation de Drizzle ORM',
        status: 'backlog',
        priority: 'low',
        sub: 'Cairn',
        idle: 4,
      },
      { n: 2, title: 'Choisir la stack de Cairn', status: 'done', priority: 'high', sub: 'Cairn', closedAgo: 2 },
      {
        n: 1,
        title: 'Installer Docker sur le Raspberry Pi',
        status: 'done',
        priority: 'medium',
        sub: 'Raspberry Pi',
        closedAgo: 16,
      },
    ],
  },
];

/** Deletes every row, then inserts the demo data set. */
export { DEMO_ACCOUNTS, DEMO_PASSWORD };

let demoHash: string | null = null;
/** Hashed once per process: seeding runs often in tests. */
function demoPasswordHash() {
  demoHash ??= hashPasswordSync(DEMO_PASSWORD);
  return demoHash;
}

export function seedDemo(db: Db, now: Date = new Date()): void {
  const today = toISODate(now);
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  /** A given time of day, `days` ago (never in the future). */
  const agoAt = (days: number, hours: number, minutes: number) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hours, minutes);
    return date > now ? new Date(now.getTime() - 25 * 60_000) : date;
  };

  db.transaction((tx) => {
    for (const table of [
      schema.activity,
      schema.topicNotes,
      schema.checklistItems,
      schema.topicLabels,
      schema.topics,
      schema.labels,
      schema.subprojects,
      schema.projects,
      schema.apiTokens,
      schema.sessions,
      schema.userLinks,
      schema.settings,
      schema.users,
    ]) {
      tx.delete(table).run();
    }

    const me = { id: ulid(), email: DEMO_ACCOUNTS[0], name: 'Elouan Barbier', role: 'admin' as const };
    const teammate = { id: ulid(), email: DEMO_ACCOUNTS[1], name: 'Camille Durand', role: 'member' as const };
    const passwordHash = demoPasswordHash();
    tx.insert(schema.users)
      .values([
        { ...me, passwordHash, createdAt: ago(60) },
        { ...teammate, passwordHash, createdAt: ago(59) },
      ])
      .run();
    tx.insert(schema.settings).values({ key: 'dormancy_days', value: 14 }).run();
    // The sign-in page shows the demo accounts while this flag is set.
    tx.insert(schema.settings).values({ key: 'demo', value: true }).run();

    const labelIds = new Map<string, string>();
    for (const label of LABELS) {
      const id = ulid();
      labelIds.set(label.name, id);
      tx.insert(schema.labels)
        .values({ id, ...label })
        .run();
    }

    const projectKeys = sortKeysAfter(null, PROJECTS.length);
    PROJECTS.forEach((project, projectIndex) => {
      const projectId = ulid();
      tx.insert(schema.projects)
        .values({
          id: projectId,
          key: project.key,
          name: project.name,
          description: project.description,
          color: project.color,
          status: project.status,
          startDate: addDays(today, -60),
          targetDate: project.target === undefined ? null : addDays(today, project.target),
          sortOrder: projectKeys[projectIndex] ?? 'V',
          createdAt: ago(60),
          updatedAt: ago(1),
        })
        .run();

      const subprojectIds = new Map<string, string>();
      const subKeys = sortKeysAfter(null, project.subprojects.length);
      project.subprojects.forEach((sub, i) => {
        const id = ulid();
        subprojectIds.set(sub.name, id);
        tx.insert(schema.subprojects)
          .values({
            id,
            projectId,
            name: sub.name,
            description: sub.description,
            targetDate: sub.target === undefined ? null : addDays(today, sub.target),
            sortOrder: subKeys[i] ?? 'V',
            createdAt: ago(55),
            updatedAt: ago(5),
          })
          .run();
      });

      const topicKeys = sortKeysAfter(null, project.topics.length);
      project.topics.forEach((topic, i) => {
        const id = ulid();
        const closedAt = topic.closedAgo === undefined ? null : agoAt(topic.closedAgo, 16, 20);
        const waitingAt = topic.waitingAgo === undefined ? null : agoAt(topic.waitingAgo, 11, 5);
        const lastActivity =
          topic.n === 24 && project.key === 'POR' ? agoAt(0, 18, 40) : (closedAt ?? waitingAt ?? ago(topic.idle ?? 2));
        const createdAt =
          topic.createdAgo !== undefined ? agoAt(topic.createdAgo, 9, 30) : new Date(lastActivity.getTime() - 6 * DAY);
        const who = topic.assignee === undefined ? project.assignee : topic.assignee;
        const assigneeId = who === 'me' ? me.id : who === 'teammate' ? teammate.id : null;

        tx.insert(schema.topics)
          .values({
            id,
            projectId,
            subprojectId: topic.sub ? (subprojectIds.get(topic.sub) ?? null) : null,
            number: topic.n,
            title: topic.title,
            description: topic.description ?? '',
            status: topic.status,
            priority: topic.priority,
            dueDate: topic.due === undefined ? null : addDays(today, topic.due),
            assigneeId,
            sortOrder: topicKeys[i] ?? 'V',
            createdAt,
            updatedAt: lastActivity,
            lastActivityAt: lastActivity,
            completedAt: isClosed(topic.status) ? closedAt : null,
          })
          .run();

        for (const name of topic.labels ?? []) {
          const labelId = labelIds.get(name);
          if (labelId) tx.insert(schema.topicLabels).values({ topicId: id, labelId }).run();
        }

        const checklistKeys = sortKeysAfter(null, topic.checklist?.length ?? 0);
        topic.checklist?.forEach(([text, done], j) => {
          tx.insert(schema.checklistItems)
            .values({ id: ulid(), topicId: id, text, done, sortOrder: checklistKeys[j] ?? 'V' })
            .run();
        });

        const log = (action: string, payload: Record<string, unknown>, at: Date, actorId = assigneeId ?? me.id) =>
          tx
            .insert(schema.activity)
            .values({
              id: ulid(at.getTime()),
              entityType: 'topic',
              entityId: id,
              actorId,
              action,
              payload,
              createdAt: at,
            })
            .run();

        log('created', {}, createdAt, me.id);
        if (topic.due !== undefined) {
          log(
            'due_date_changed',
            { from: null, to: addDays(today, topic.due) },
            new Date(createdAt.getTime() + 2 * DAY + 3_600_000),
          );
        }
        if (topic.status === 'in_progress') {
          const startedAt =
            topic.n === 24 && project.key === 'POR' ? agoAt(4, 9, 50) : new Date(lastActivity.getTime() - 1);
          log('status_changed', { from: 'todo', to: 'in_progress' }, startedAt);
        }
        if (waitingAt) log('status_changed', { from: 'in_progress', to: 'waiting' }, waitingAt);
        if (closedAt) log('status_changed', { from: 'in_progress', to: topic.status }, closedAt);

        if (topic.n === 24 && project.key === 'POR') {
          const notes: Array<[string, Date]> = [
            [
              'Règles listées avec le métier en atelier. Le cas « contrat à durée déterminée » dépend de la réponse de POR-22.',
              agoAt(4, 10, 15),
            ],
            [
              "Prototype validé sur l'étape 1. La même fonction de validation sert maintenant au navigateur et au serveur, il reste les tests sur mobile.",
              agoAt(0, 18, 40),
            ],
          ];
          for (const [body, at] of notes) {
            tx.insert(schema.topicNotes)
              .values({ id: ulid(at.getTime()), topicId: id, authorId: me.id, body, createdAt: at, updatedAt: at })
              .run();
            log('note_added', {}, at, me.id);
          }
        }
      });
    });
  });

  // Refresh the query planner statistics after the bulk load.
  db.run(sql`PRAGMA optimize`);
}

export function isEmpty(db: Db): boolean {
  return db.select({ id: schema.users.id }).from(schema.users).limit(1).all().length === 0;
}
