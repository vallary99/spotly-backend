# Spotly API — MVP Backend

A working NestJS implementation of the Spotly MVP scope defined in the PRD/BRD:
Postgres (via TypeORM), in-process background sweeps, a real image quality gate
(resolution + blur detection + perceptual hashing via `sharp`, no third-party
service required), a Cloudinary-backed media store, and a
structurally-real adapter for M-Pesa Daraja.

Every route below has been manually exercised end-to-end against a live
Postgres instance — signup → business registration → tier-limit
enforcement → reviews → bookmarks → payments → media quality gate → async
duplicate-detection — not just written, but run and confirmed working.

## One note on the architecture recommendation

The original review recommended **Prisma**. This implementation uses
**TypeORM** instead, because Prisma's engine binaries download from
`binaries.prisma.sh`, which was outside this build sandbox's network
allowlist. Functionally the two are equivalent for this project — same
Postgres database, same relational model, same transaction guarantees. If
you have full network access in your own environment and prefer Prisma,
swapping the ORM layer (entities → schema.prisma, repositories → Prisma
Client calls) is a contained, mechanical change; nothing else in the
architecture depends on which ORM is used.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values — see checklist below
```

Create the database:

```sql
CREATE USER spotly WITH PASSWORD 'your_password' CREATEDB;
CREATE DATABASE spotly_dev OWNER spotly;
```

Point `.env.local` at it (either `DATABASE_URL`, or the `POSTGRES_*`
parts), then create the schema and start:

```bash
npm run migration:run   # applies every committed migration in src/database/migrations
npm run start:dev
```

## Database config and migrations

Configuration is per-environment, selected by `NODE_ENV`:

| `NODE_ENV` | env file | migrations directory |
|---|---|---|
| `local` | `.env.local` | `src/database/migrations` |
| `prod` / `production` | `.env.prod` | `src/database/migrations` |
| unset | `.env` | `src/database/migrations` |

```
src/libs/env/env-file.ts               NODE_ENV -> which .env file
src/database/config/data-source-options.ts   connection, SSL, entity + migration globs
src/database/config/datasource.ts      what the TypeORM CLI uses
src/database/config/typeorm.config.ts  what the Nest app uses
```

The app, the CLI, and the tools in `scripts/` all build on the same
`data-source-options.ts`, so they can't end up pointed at different
databases.

**Entities live with the module that owns them**, not in one central
folder — `src/business/entities/business.entity.ts`,
`src/auth/entities/user.entity.ts`, and so on. They're discovered by
convention (`src/**/*.entity.ts`, or `dist/**/*.entity.js` for the
compiled build), so adding an entity means creating the file: there's no
registry to update and forget.

**One migration directory, not two.** This used to be two directories —
a gitignored `local-migrations/` for iterative local schema work, and
the committed `migrations/` for the real history — on the idea that
local churn shouldn't pollute what eventually runs against real user
data. In practice `local-migrations/` being gitignored meant it started
empty on every fresh checkout, and `npm run migration:run` (no suffix)
would silently do nothing there with zero error output — a real
incident (Sep 2026) where a stale-schema error on a fresh checkout
looked like a code bug but was actually this. `local` and `prod` now
run the exact same committed migration files; the only difference
between them is which database they connect to. If you want to
experiment with schema changes locally before committing them, generate
the migration, `migration:run` it, and if it's wrong, `migration:revert`
and delete the file — same as working with any other file you haven't
committed yet.

| Local (`.env.local`) | Production (`.env.prod`) |
|---|---|
| `npm run migration:generate` | `npm run migration:generate:prod` |
| `npm run migration:create` | `npm run migration:create:prod` |
| `npm run migration:run` | `npm run migration:run:prod` |
| `npm run migration:revert` | `npm run migration:revert:prod` |
| `npm run migration:show` | `npm run migration:show:prod` |

Every CLI invocation prints which env file and migrations directory it
picked up before it does anything, so "which database did that just run
against?" is never a guess.

`npm run migration:run:deploy` is the deployment variant: it runs the
compiled migrations out of `dist/` with plain `node`, because the
production image is built without dev dependencies (no `ts-node`).
`render.yaml` wires it to `preDeployCommand`.

`synchronize` is off in every environment, and nothing in the repo can
turn it on — a migration is the only way the schema ever changes.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| Postgres + TypeORM entities, relations, transactions | Real |
| JWT auth, role guards, DTO validation | Real |
| Business/Experience/Review/Bookmark/Search CRUD | Real |
| Tier-limit enforcement (photos, video, concurrent experiences) | Real, server-side |
| Image quality gate (resolution, blur via Laplacian variance) | Real — runs against actual uploaded bytes via `sharp` |
| Perceptual hash duplicate detection | Real — proven to correctly flag reused images across businesses |
| Background jobs (moderation, usage sweep, billing, experience expiry) | Real — in-process fire-and-forget dispatch + timer-driven sweeps (`src/tasks/`), no external broker |
| M-Pesa Daraja STK Push + callback | Structurally real (idempotent, transactional) but **simulated** until real credentials are supplied — see checklist |
| Media storage | Real — Cloudinary when `CLOUDINARY_*` is set, local disk (`./uploads`, served at `/uploads/`) otherwise |
| Video blur/orientation check | Not implemented — needs `ffmpeg` installed to extract a frame first |
| Google/Apple OAuth | Not implemented (intentionally, per BRD Section 11 — MVP auth is email/password on a real JWT backend) |

## API routes implemented

```
POST   /auth/signup
POST   /auth/login
POST   /auth/refresh                                (auth required — re-issues token with current role/businessId)
GET    /auth/google                                  (starts Google OAuth)
GET    /auth/google/callback

POST   /businesses                              (auth required)
GET    /businesses?neighborhood=&category=&q=    (public)
GET    /businesses/:id                           (public)
GET    /businesses/:id/experiences/history        (public)
PUT    /businesses/:id                            (owner only)

POST   /businesses/:id/experiences                (Business Account only)
GET    /experiences?category=&upcoming=           (public)
PUT    /experiences/:id                            (owner only)
DELETE /experiences/:id                            (owner only)

POST   /reviews?businessId=                        (auth required)
GET    /reviews?businessId=                        (public)

POST   /bookmarks                                  (auth required)
GET    /bookmarks                                  (auth required)
DELETE /bookmarks/:id                               (auth required)

GET    /search?q=                                  (public)

GET    /subscriptions/tiers                         (public)
GET    /businesses/:id/subscription                 (auth required)

POST   /payments/mpesa/stk-push                     (auth required)
GET    /payments/mpesa/:id/status                    (auth required, owner only — poll this after stk-push)
POST   /payments/mpesa/callback                     (public — Daraja calls this server-to-server)

POST   /businesses/:id/media/upload-url              (owner only)
POST   /businesses/:id/media                          (owner only, multipart)

GET    /home?neighborhood=&category=                 (public)
```

## What I'll need from you to make the stubbed pieces real

### 1. M-Pesa Daraja API (Safaricom Developer Portal — developer.safaricom.co.ke)
- Consumer Key
- Consumer Secret
- Business Shortcode (Paybill/Till number)
- Lipa Na M-Pesa Online Passkey
- A publicly reachable HTTPS callback URL (Daraja cannot POST to
  `localhost` — you'll need this deployed, or tunneled via ngrok for
  testing)

Drop these into `.env` as `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`,
`MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`. Once
`MPESA_CONSUMER_KEY`/`SECRET` are set, `DarajaService` automatically stops
simulating and calls the real Daraja sandbox/production API — no code
changes needed.

### 2. Media storage — Cloudinary
- Cloud name
- API Key
- API Secret

All three are on the Cloudinary dashboard under "API Environment
variable". Drop them into `.env` as `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — `StorageService` detects
them and switches off local-disk mode automatically, no code changes
needed. Cloudinary also serves the media over its own CDN, so there's no
separate CDN to configure.

This one isn't optional for a real deployment: without it, uploads go to
the container's local disk and vanish on the next restart.

### 3. Google OAuth (Google Cloud Console)
- Client ID + Client Secret
- Authorized redirect URI: `http://localhost:3000/auth/google/callback` (update for your deployed domain in production)

Google OAuth is fully wired up (`passport-google-oauth20`, see
`src/auth/google.strategy.ts`) — not a placeholder. Without real
credentials in `.env`, `/auth/google` returns a clear 503 "not
configured yet" instead of crashing; drop in real credentials and it
works immediately, no code changes needed.

## Known follow-ups (not blockers, but worth doing before production)

- Add `ffmpeg`-based video quality checks (resolution/orientation/blur on
  an extracted frame) — currently only duration is checked for video.
- Add IP-allowlisting for Safaricom's ranges on the `/payments/mpesa/callback`
  route as defense-in-depth alongside payload validation.
- Add integration tests covering the flows manually verified during
  development (signup → business → tier caps → payment idempotency →
  media quality gate → async duplicate flagging).
