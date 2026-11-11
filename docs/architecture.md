# Architecture

Cairn is one Node.js process serving a JSON API and a single-page app, with its data in one SQLite file. It is built
to run on a Raspberry Pi 4: no external database, no queue, no cache server.

```
Browser (React SPA) ──fetch /api──▶ Hono server ──▶ Drizzle ──▶ SQLite (WAL) + FTS5
                                        │
                                        └── static files of the SPA, nightly backup timer
```

## Repository

A pnpm workspace with three packages.

| Path              | What it holds                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `packages/shared` | Zod schemas (source of truth for API types), constants, pure logic shared by server and app |
| `apps/server`     | The API, database access, sign-in, export and import, backups, the `cairn` command          |
| `apps/web`        | The single-page app                                                                         |
| `e2e`             | Playwright journeys and the accessibility audit                                             |
| `docker`          | Dockerfile, the `cairn` command wrapper and the compose file for the published image        |
| `scripts`         | The API benchmark (`bench.mjs`) and the app icon generator (`icons.mjs`)                    |

### `packages/shared`

Consumed as TypeScript source by both apps, never built on its own.

- `schemas.ts`: every request and response shape, as Zod schemas. The server validates with them and documents the
  API from them (OpenAPI); the app takes its types from them.
- `constants.ts`: statuses with their categories (unsorted, open, closed), priorities, colors, the version.
- `logic.ts`: the overview, dormancy, progress, project key suggestion. `sort-order.ts`: fractional sort keys, so a
  drag-and-drop writes one row.

### `apps/server`

[Hono](https://hono.dev) with `@hono/zod-openapi`, [Drizzle ORM](https://orm.drizzle.team) on better-sqlite3.

| File           | Role                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `index.ts`     | Starts the server: opens the database, runs migrations, serves the SPA, schedules backups |
| `app.ts`       | Routes, authentication middleware, mapping of errors to HTTP statuses, OpenAPI document   |
| `repo.ts`      | Workspace queries and writes: projects, subprojects, topics, labels, activity, search     |
| `accounts.ts`  | Accounts, passwords (argon2id), sessions, one-time links, API tokens                      |
| `transfer.ts`  | JSON export and import, CSV export                                                        |
| `backup.ts`    | Hot copies of the database and their rotation                                             |
| `errors.ts`    | Error classes (`NotFoundError` → 404, `ConflictError` → 409…)                             |
| `cli.ts`       | The `cairn` command: `backup`, `reset-password EMAIL`                                     |
| `config.ts`    | Environment variables                                                                     |
| `db/schema.ts` | Tables; `pnpm db:generate` writes the SQL migration into `drizzle/`                       |
| `seed/demo.ts` | Demo data, loaded into an empty database outside production                               |
| `build.mjs`    | Bundles `index.ts` and `cli.ts` with esbuild for the Docker image                         |

Routes stay thin: they validate input with the shared schemas, call `repo` or `accounts`, and return the result.
Every write that a person would want to see in a history also writes an `activity` row in the same transaction.

### `apps/web`

React 19 and Vite, [TanStack Router](https://tanstack.com/router) (routes declared in code in `router.tsx`) and
[TanStack Query](https://tanstack.com/query), Tailwind CSS v4, components written in the shadcn/ui style on Radix,
cmdk for the palette, dnd-kit for drag-and-drop.

- `features/*`: one folder per screen (overview, project, topic, my topics, settings, access).
- `components/`: shared pieces; `components/ui` holds the base components, `components/layout` the shell and sidebar.
- `lib/api.ts`: the typed `fetch` wrapper. `lib/queries.ts`: every query and mutation, with optimistic updates
  rolled back on error (and a toast).
- `lib/hotkeys.ts`: single-key shortcuts, ignored while typing.
- `i18n/`: `fr.ts` and `en.ts` (English typed against French, so a missing key fails the build).
- `styles.css`: design tokens for both themes. Components use the tokens, never raw colors.

## Data

SQLite in WAL mode, one file (`cairn.db`) in the data folder. Migrations run at startup.

- **Hierarchy**: `projects` → `subprojects` → `topics`. A topic always has a project; its subproject is optional.
- **Topics** carry `status`, `priority`, `due_date`, `assignee_id`, a Markdown `description`, a `sort_order`
  (fractional key), `completed_at` and `last_activity_at` (dormancy). Checklist items, notes and labels hang off them.
- **Activity** records every change (who, what, old and new value) for topics, subprojects and projects. "Waiting
  since" and recent activity are read from it.
- **Search**: an FTS5 table (`search_index`) on titles, descriptions and notes, kept in step by triggers. Accents are
  ignored; each typed word becomes a quoted prefix, so input is never read as FTS syntax.
- **Accounts**: `users` (argon2id password hashes); `sessions`, `api_tokens` and `user_links` (one-time invitation
  and reset links) store only SHA-256 hashes of their secrets.
- **Nothing is hard-deleted** in the workspace: topics close, projects and subprojects archive.

## Requests

- **Authentication**: a session cookie (`cairn_session`, 30 days, sliding) from the browser, or
  `Authorization: Bearer cairn_…` from scripts. Health, setup, sign-in, invitation links and the OpenAPI document are
  the only public routes.
- **Cross-site writes** from browsers are refused (`Sec-Fetch-Site`, else `Origin` against `Host`).
- **Roles**: members work on the whole workspace; administrators also manage accounts, settings, labels deletion,
  export, import and backups.
- **Overview**: computed from light rows, then only the topics shown are loaded in full, so the home page stays small
  with thousands of topics.

## The app

- **URLs carry the view**: list or kanban, grouping, filters, tab and the open topic are search parameters, so every
  view can be shared and survives a reload.
- **Topic panel**: opening a topic from a list keeps the list underneath; a route mask shows the topic's own URL, so
  reloading or sharing opens the full page.
- **Optimistic updates**: changes show at once and roll back with a message if the server refuses them.
- **Freshness**: queries refetch when the tab regains focus and every 30 seconds; there is no live push in v1.

## Tests

- **Vitest** for the shared logic and the API (`app.test.ts`, `auth.test.ts`, `transfer.test.ts` run the Hono app
  on an in-memory database).
- **Playwright** against the production build: `journey.spec.ts` on an empty database (first run to drag-and-drop,
  keyboard only), `overview.spec.ts` and `accessibility.spec.ts` (axe, WCAG 2.1 AA, light and dark) on the demo
  data.

## Docker image

Built on `node:22-alpine`, run on bare `alpine` with only the Node binary copied in, the bundled server, the built
SPA, the migrations and the native modules for that platform. It runs as a non-root user, keeps everything in
`/data`, and has a health check on `/api/health`.
