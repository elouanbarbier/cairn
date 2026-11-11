# Contributing to Cairn

Thanks for your interest. Cairn is a small project with a deliberately narrow scope, so a short conversation before
a large change saves everyone time.

## Before you start

- **Bugs**: open an issue with the steps to reproduce, what you expected and what happened, plus your version
  (Settings shows it at the bottom, `GET /api/health` returns it).
- **Ideas**: open an issue first. The product scope lives in [`docs/cadrage.md`](docs/cadrage.md) (in French):
  Cairn organizes projects, subprojects and topics, and stays light enough for a Raspberry Pi. Ideas that fall
  outside it are welcome too; they are collected in [`docs/ideas.md`](docs/ideas.md) for later versions.
- **Security issues**: never in a public issue. See [`SECURITY.md`](SECURITY.md).

## Set up

Node.js 22 or later and pnpm (or `npx -y pnpm@12.18.0` in place of `pnpm`).

```sh
pnpm install
pnpm dev                                # API on :3000, app on http://localhost:5173 with demo data
pnpm exec playwright install chromium   # once, for the end-to-end tests
```

Sign in with a demo account listed on the sign-in page. `pnpm db:seed` resets the demo data.
[`docs/architecture.md`](docs/architecture.md) explains how the code is organized.

## Making a change

1. Branch from `main`.
2. Keep the conventions below, and add tests with the change: Vitest for logic and the API, Playwright for journeys.
3. Run the checks CI runs:

   ```sh
   pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
   ```

4. Open a pull request against `main` and fill in the template.

### Conventions

- Code, commits and technical documentation in English. The interface is translated: every string goes into both
  `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/fr.ts`, never inline in a component.
- TypeScript strict, no `any`. API types come from the Zod schemas in `packages/shared`.
- No raw colors in components: use the design tokens from `apps/web/src/styles.css`.
- Formatting and lint by Biome (`pnpm format` fixes most issues).
- New dependencies need a reason: say in the pull request why the existing stack does not cover it. Cairn has to stay
  small for a Raspberry Pi.
- Database changes: edit `apps/server/src/db/schema.ts`, run `pnpm db:generate` and commit the SQL migration.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org): `feat: …`, `fix: …`, `docs: …`, `refactor: …`,
`test: …`, `chore: …`. Release-please reads them to choose the next version and write the CHANGELOG, so a `feat` or
`fix` message should make sense to someone reading the release notes.

## License

Cairn is licensed under the [GNU AGPL-3.0](LICENSE). By contributing, you agree that your contribution is licensed
under the same terms.
