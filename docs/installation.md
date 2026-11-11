# Installing Cairn

Cairn runs as one Docker container with one volume. It targets a Raspberry Pi 4 (4 GB) with a 64-bit system, and
runs the same on any amd64 or arm64 Linux host, or on macOS and Windows with Docker Desktop.

## 1. Prepare the Pi

- Raspberry Pi OS **64-bit** (Lite is enough), up to date: `sudo apt update && sudo apt full-upgrade`.
- Docker: `curl -fsSL https://get.docker.com | sh`, then `sudo usermod -aG docker $USER` and log in again.
- Git, only to build from source: `sudo apt install -y git`.

## 2. Start Cairn

With the published image (recommended):

```sh
mkdir cairn && cd cairn
curl -fsSLO https://raw.githubusercontent.com/OWNER/cairn/main/docker/compose.yaml
docker compose up -d
```

Data lives in `./data` next to `compose.yaml`. The image exists for amd64 and arm64, so the Pi pulls its own.

Or from the source, which builds the image on the Pi (a few minutes the first time):

```sh
git clone https://github.com/OWNER/cairn && cd cairn
docker compose up -d --build
```

Data then lives in `./cairn-data`.

Open `http://<pi-address>:3000` (for example `http://raspberrypi.local:3000`). The first screen creates the
**administrator** account: name, email and a password of at least 10 characters.

## 3. Invite people

Settings > Users > Invite: Cairn creates the account and gives you an invitation link. Send it yourself (Cairn sends
no email); the person opens it and chooses a password. The link works once, for 7 days. The same place gives a
password reset link, changes roles (administrator or member) and disables accounts.

## Configuration

Everything is set in the interface, except these environment variables (in `compose.yaml`):

| Variable            | Default | What it does                                                                                        |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `CAIRN_BASE_URL`    | (empty) | Public address, e.g. `https://cairn.example.com`: links printed by the command line, Secure cookies |
| `CAIRN_BACKUP_KEEP` | `7`     | Nightly backups kept; `0` turns them off                                                            |
| `PORT`              | `3000`  | Port inside the container                                                                           |

## Backups

- Every night at 3:00, Cairn copies its database into `backups/` of the data folder and keeps the 7 newest.
- On demand: Settings > Data > Back up now, or `docker compose exec cairn cairn backup`.
- Settings > Data also exports the whole workspace as JSON (no passwords or tokens) and the topics as CSV.

To restore a backup: stop Cairn (`docker compose down`), replace `cairn.db` in the data folder with the backup file
(and delete `cairn.db-wal` and `cairn.db-shm` if present), then `docker compose up -d`. To move to another machine,
either copy the whole data folder, or export to JSON and import it on the new install (Settings > Data > Import,
on a workspace without projects; imported accounts then need a reset link).

## Forgotten administrator password

```sh
docker compose exec cairn cairn reset-password you@example.com
```

It prints a one-time link to choose a new password. Set `CAIRN_BASE_URL` for the link to carry the right address,
or replace `http://localhost:3000` in it with the address you use.

## Updates

```sh
docker compose pull && docker compose up -d     # published image
git pull && docker compose up -d --build        # from source
```

Migrations run at startup. The version in use is shown at the bottom of Settings. What changed is in the
[changelog](../CHANGELOG.md).

## Reaching Cairn from outside

Sign-in protects Cairn, but keep its exposure deliberate:

- **Cloudflare Tunnel** with **Cloudflare Access** in front (recommended): no port opened on your router, and Access
  adds a second check before anyone reaches the sign-in page. Point the tunnel at `http://localhost:3000` and set
  `CAIRN_BASE_URL` to the public address.
- **Caddy** as a reverse proxy with automatic HTTPS: `cairn.example.com { reverse_proxy localhost:3000 }`, port 443
  forwarded to the Pi, and `CAIRN_BASE_URL=https://cairn.example.com`.

Never expose plain HTTP to the internet: passwords and session cookies would travel in clear text.

## Performance

Targets for a Raspberry Pi 4 (4 GB): image under 200 MB, under 150 MB of RAM at rest, start under 5 s, API p95 under
50 ms with 5,000 topics. To measure on your Pi, on a fresh install right after creating the administrator:

```sh
docker image ls cairn                       # image size
docker stats --no-stream                    # memory of the running container
CAIRN_URL=http://localhost:3000 CAIRN_EMAIL=you@example.com CAIRN_PASSWORD=… node scripts/bench.mjs --seed
```

`--seed` imports 5,000 generated topics (only on a workspace without projects), then measures each main route.
It needs Node.js 22 on the machine running it (not necessarily the Pi).
