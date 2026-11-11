# Changelog

All notable changes to Cairn are listed here. Versions follow [Semantic Versioning](https://semver.org); from 1.0.0
on, release-please writes the entries from [Conventional Commits](https://www.conventionalcommits.org).

## 1.0.0 (2026-11-11)

First public release: everything below was built in milestones J0 to J5 of the brief (`docs/cadrage.md`).

### Organize

- Projects, subprojects and topics, with a key per project (`POR`) and a ref per topic (`POR-24`).
- Topics: status (Backlog, To do, In progress, Waiting, Done, Cancelled), priority, labels, assignee, due date,
  Markdown description, checklist, notes and the full history of changes.
- List view grouped by subproject or status; kanban per project or subproject; filters on status, priority, label,
  due date and assignee, kept in the address.
- The topic panel opens over any list; a shared link opens the full page.
- Archive and restore projects and subprojects; nothing is ever hard-deleted.
- Labels managed in Settings (rename, recolor, delete), or created on the fly from the palette.

### See

- Overview: what moves, what is stuck (waiting, dormant), what is due and what sleeps, plus recent activity. The
  dormancy threshold is set in Settings.
- My topics: everything assigned to you, across projects.
- Full-text search on titles, descriptions and notes, accents ignored, with highlighted excerpts.

### Go fast

- Command palette (Cmd/Ctrl+K) for navigation, search and actions.
- Keyboard triage: J/K to move, S/P/L/M/D to set status, priority, labels, subproject or due date, X to select several
  topics and change them at once.
- Drag-and-drop in lists, in the kanban and in the sidebar, also with the keyboard.

### Share and self-host

- Accounts with administrators and members, invitations and password resets through one-time links (Cairn sends no
  email), personal API tokens (read only or read and write) and a REST API described in OpenAPI.
- One Docker image for amd64 and arm64 (145 MB, 31 MB of RAM at rest), one SQLite file, nightly backups, JSON
  export and import, CSV export of topics, and the `cairn` command (`backup`, `reset-password`).
- Installable as an app (PWA) on desktop and phone.
- English and French, light and dark themes, WCAG 2.1 AA checked with axe on every main screen.
