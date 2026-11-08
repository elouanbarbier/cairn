# Cairn

Self-hosted project management for people who run several projects split into subprojects and topics.
One container, one SQLite file, comfortable on a Raspberry Pi 4. Open the app and see in five seconds what moves,
what is stuck, what is due and what sleeps.

> Status: early development (milestones J0–J1). Not ready for production use yet: there is no sign-in before J4.

## Develop

Requirements: Node.js 22 or later, pnpm (or `npx -y pnpm@12.18.0` in place of `pnpm`).

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. The API runs on http://localhost:3000 and seeds demo data on first start.

```sh
pnpm test        # unit and API tests
pnpm typecheck
pnpm lint
pnpm db:seed     # reset the demo data
pnpm test:e2e    # Playwright journeys (run `pnpm exec playwright install chromium` once)
```

A new install with an empty database (`CAIRN_SEED_DEMO=false`, the default in production) opens on a setup screen
that creates the first account.

## Stack

React 19, Vite, TanStack Router and Query, Tailwind CSS v4, shadcn/ui, cmdk, dnd-kit, Sonner on the front;
Hono, Zod and OpenAPI, Drizzle ORM and better-sqlite3 on the server. See [`docs/cadrage.md`](docs/cadrage.md) for
the product scope and roadmap.
