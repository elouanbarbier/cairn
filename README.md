# Cairn

Self-hosted project management for people who run several projects split into subprojects and topics.
One container, one SQLite file, comfortable on a Raspberry Pi 4. Open the app and see in five seconds what moves,
what is stuck, what is due and what sleeps.

> Status: early development (milestones J0–J4). Usable on a local network; the first public release is J5.

## Install (Docker, Raspberry Pi 4 or any 64-bit host)

With Docker and Git installed on the Pi:

```sh
git clone <this repository> cairn && cd cairn
docker compose up -d --build
```

Open `http://<pi-address>:3000`: the first screen creates the administrator account. Data and nightly backups live
in `./cairn-data`. Once images are published on GitHub Container Registry, `docker/compose.yaml` runs Cairn without
building it. Full guide (configuration, updates, backups, access from outside): [`docs/installation.md`](docs/installation.md).

## Develop

Requirements: Node.js 22 or later, pnpm (or `npx -y pnpm@12.18.0` in place of `pnpm`).

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173 and sign in with a demo account (shown on the sign-in page). The API runs on
http://localhost:3000 and seeds demo data on first start.

```sh
pnpm test        # unit and API tests
pnpm typecheck
pnpm lint
pnpm db:seed     # reset the demo data
pnpm test:e2e    # Playwright journeys (run `pnpm exec playwright install chromium` once)
```

The API is described in OpenAPI at `/api/openapi.json`. Scripts and AI assistants use personal API tokens
(Settings > API tokens), read only or read and write.

## Stack

React 19, Vite, TanStack Router and Query, Tailwind CSS v4, shadcn/ui, cmdk, dnd-kit, Sonner on the front;
Hono, Zod and OpenAPI, Drizzle ORM, better-sqlite3 and argon2 on the server. See
[`docs/cadrage.md`](docs/cadrage.md) for the product scope and roadmap.
