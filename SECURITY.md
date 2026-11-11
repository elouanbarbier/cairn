# Security policy

## Supported versions

Security fixes go into the latest release. Update with `docker compose pull && docker compose up -d` (published image)
or `git pull && docker compose up -d --build` (from source).

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting instead:
[report a vulnerability](https://github.com/elouanbarbier/cairn/security/advisories/new) (the repository's
**Security** tab). Include the version, the steps to reproduce and the impact you see.

You should get an answer within a week. Once a fix is released, the advisory is published with credit to you,
unless you prefer otherwise.

## Scope and hardening notes

Cairn is meant for a small team on a home server or a private network. What it does:

- Passwords hashed with argon2id; sessions and API tokens are random and stored only as SHA-256 hashes.
- Session cookies are httpOnly and SameSite=Lax, and Secure behind HTTPS (`CAIRN_BASE_URL` in `https://`, or a
  proxy sending `X-Forwarded-Proto: https`).
- Browser writes coming from another site are refused; sign-in attempts are limited per email.
- Descriptions and notes are rendered from Markdown without raw HTML.

What it leaves to you: HTTPS in front of it when it is reachable from the internet (see
[`docs/installation.md`](docs/installation.md#reaching-cairn-from-outside)), and the protection of the data folder,
which holds the database and its backups.
