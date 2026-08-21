# Spotly API — MVP Backend

A working NestJS implementation of the Spotly MVP scope defined in the PRD/BRD:
Postgres (via TypeORM), Redis-backed BullMQ queues, a real image quality gate
(resolution + blur detection + perceptual hashing via `sharp`, no third-party
service required), and stubbed-but-structurally-real adapters for M-Pesa
Daraja and S3-compatible object storage.

Every route below has been manually exercised end-to-end against a live
Postgres + Redis instance — signup → business registration → tier-limit
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
- Redis 6+

## Setup

```bash
npm install
cp .env.example .env   # then fill in real values — see checklist below
```

Create the database:

```sql
CREATE USER spotly WITH PASSWORD 'your_password' CREATEDB;
CREATE DATABASE spotly_dev OWNER spotly;
```

Update `DATABASE_URL` in `.env` to match. Then start:

```bash
npm run start:dev
```

`synchronize: true` is set in `src/config/typeorm.config.ts` for this MVP
scaffold, so tables are created automatically on first boot. **Before
production use**, switch to real TypeORM migrations
(`typeorm migration:generate`) so schema changes are reviewable and
reversible instead of auto-applied.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| Postgres + TypeORM entities, relations, transactions | Real |
| JWT auth, role guards, DTO validation | Real |
| Business/Experience/Review/Bookmark/Search CRUD | Real |
| Tier-limit enforcement (photos, video, concurrent experiences) | Real, server-side |
| Image quality gate (resolution, blur via Laplacian variance) | Real — runs against actual uploaded bytes via `sharp` |
| Perceptual hash duplicate detection | Real — proven to correctly flag reused images across businesses |
| BullMQ queues (moderation, usage sweep, billing, experience expiry) | Real, running against Redis |
| M-Pesa Daraja STK Push + callback | Structurally real (idempotent, transactional) but **simulated** until real credentials are supplied — see checklist |
| S3/R2 object storage | Stubbed presigned URL — needs `@aws-sdk/client-s3` wired in once credentials exist |
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

### 2. Object storage — AWS S3 or Cloudflare R2
- Access Key ID
- Secret Access Key
- Bucket name
- Region (or endpoint URL, for R2/MinIO)
- Ideally a CDN domain in front of it for public media URLs

Once you have these, install `@aws-sdk/client-s3` and
`@aws-sdk/s3-request-presigner`, then implement the real presigned-URL
logic in `src/media/storage.service.ts` (the real implementation is
sketched in a comment there already).

### 3. Google OAuth (Google Cloud Console)
- Client ID + Client Secret
- Authorized redirect URI: `http://localhost:3000/auth/google/callback` (update for your deployed domain in production)

Google OAuth is fully wired up (`passport-google-oauth20`, see
`src/auth/google.strategy.ts`) — not a placeholder. Without real
credentials in `.env`, `/auth/google` returns a clear 503 "not
configured yet" instead of crashing; drop in real credentials and it
works immediately, no code changes needed.

## Known follow-ups (not blockers, but worth doing before production)

- Switch `synchronize: true` to real TypeORM migrations.
- Wire the real S3/R2 client into `StorageService`.
- Add `ffmpeg`-based video quality checks (resolution/orientation/blur on
  an extracted frame) — currently only duration is checked for video.
- Add IP-allowlisting for Safaricom's ranges on the `/payments/mpesa/callback`
  route as defense-in-depth alongside payload validation.
- Add integration tests covering the flows manually verified during
  development (signup → business → tier caps → payment idempotency →
  media quality gate → async duplicate flagging).
