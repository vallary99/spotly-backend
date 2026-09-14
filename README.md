# Spotly API

The backend for Spotly — a Nairobi local-business and experience discovery
platform. NestJS + TypeORM + Postgres, deployed on Vercel as serverless
functions. Three companion apps consume this API: `spotly-web` (the
consumer-facing site), `spotly-admin` (the internal admin panel), and this
repo itself.

## ⚠️ Known critical issue — read this first

**Scheduled background sweeps (`src/tasks/scheduler.service.ts`) run on an
in-process `setInterval`, which does not work reliably on Vercel's
serverless deployment.** A serverless function isn't guaranteed to stay
alive between invocations, so there's no guarantee any of these timers
ever actually fire on schedule — or at all. This affects:

- Payment reconciliation (re-checking stuck M-Pesa payments)
- The pending-listing reminder emails and 30-day auto-inactivation
- The dormant-gallery nudge and status flip
- Billing grace-period expiry
- The views/saves/shares totals (see "Scheduled sweeps" below) — **as of
  Sep 2026, testing confirmed these numbers are not updating in real
  time**, which is the direct, observed symptom of this issue

**The fix**: convert each sweep into a real HTTP endpoint, triggered
externally — either Vercel Cron (requires upgrading to Vercel Pro, since
the free Hobby plan caps cron at once per day) or a free external
scheduler hitting the endpoints on the real schedule. This has not been
implemented yet. Until it is, do not assume any of the above happens
automatically — check manually, or trigger reconciliation by hand where
an admin action exists for it (e.g., "Recheck now" on a stuck payment in
the admin Transactions page).

Other known gaps, lower urgency but worth knowing about:

- **No automated tests.** Nothing beyond NestJS's default scaffolded test
  file. A change to tier eligibility, trial/discount rules, or payment
  resolution has no regression safety net.
- **No rate limiting anywhere.** Nothing throttles repeated hits to the
  STK push endpoint, signup, business creation, or the image upload/
  quality-gate endpoint.
- **No guard against duplicate payments.** `PaymentService.initiate()`
  doesn't check for an existing PENDING payment before creating a new
  one — tapping "Upgrade" twice while waiting could trigger two real
  M-Pesa charges for one upgrade.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values — see "Environment variables" below
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
src/libs/env/env-file.ts                     NODE_ENV -> which .env file
src/database/config/data-source-options.ts   connection, SSL, entity + migration globs
                                              (uses the pgBouncer transaction-mode pooler
                                              for the live app — see comment re: the Sep
                                              2026 production connection-exhaustion incident)
src/database/config/datasource.ts            what the TypeORM CLI uses
src/database/config/typeorm.config.ts        what the Nest app uses
```

The app, the CLI, and the tools in `scripts/` all build on the same
`data-source-options.ts`, so they can't end up pointed at different
databases.

**Entities live with the module that owns them**, not in one central
folder — `src/business/entities/business.entity.ts`,
`src/auth/entities/user.entity.ts`, and so on — **except that every new
entity must also be added to the static list in
`src/database/config/entities.ts`.** This is an easy step to forget and
the failure mode is silent (the entity just isn't recognized), so check
this file whenever a "table doesn't exist" error looks wrong.

| Local (`.env.local`) | Production (`.env.prod`) |
|---|---|
| `npm run migration:generate` | `npm run migration:generate:prod` |
| `npm run migration:create` | `npm run migration:create:prod` |
| `npm run migration:run` | `npm run migration:run:prod` |
| `npm run migration:revert` | `npm run migration:revert:prod` |
| `npm run migration:show` | `npm run migration:show:prod` |

Every CLI invocation prints which env file and migrations directory it
picked up before it does anything.

`synchronize` is off in every environment, and nothing in the repo can
turn it on — a migration is the only way the schema ever changes.

**A recurring gotcha with enum columns**: Postgres has no `ALTER TYPE ...
DROP VALUE`. Adding a new enum value to an existing type (e.g., a new
`ListingStatus`) is straightforward via `ALTER TYPE ... ADD VALUE`, but
reverting that migration cleanly requires recreating the whole enum type
from scratch — several migrations in this repo have a `down()` that
intentionally doesn't attempt this and says so in a comment.

**Nullable TypeScript union types need an explicit column `type`.**
`@Column({ nullable: true })` with a TypeScript type like `string | null`
will build fine but crash at runtime against a real Postgres connection
with `DataTypeNotSupportedError: Data type "Object" is not supported` —
TypeORM can't reflect a column type from a union that includes `null`.
This already caused one real production incident. Always write
`@Column({ type: 'varchar', nullable: true })` (or `'text'`, `'enum'`,
etc.) explicitly for any nullable field — never rely on bare
`@Column({ nullable: true })` inference for anything but a plain
non-nullable `string`/`number`/`boolean`, or a union of same-type string
literals (e.g. `'view' | 'save'` reflects fine, since both are `String`).

## Scheduled sweeps

Background jobs live in `src/tasks/` and are dispatched by
`SchedulerService`. See the critical issue at the top of this file —
these intervals are what's *intended*, not what's *guaranteed* to
actually happen on the current deployment:

| Sweep | Interval | What it does |
|---|---|---|
| `usage-rolling-counters` | 1 hour | Recalculates `profileViews`/`savesCount`/`sharesCount` as lifetime totals from the `usage_events` log (changed from a rolling 30-day window to lifetime totals, Sep 2026 — pending a real analytics page) |
| `experience-expiry` | 15 minutes | Moves expired experiences into hosting history |
| `billing-grace-period` | 1 hour | Downgrades businesses whose payment grace period has ended |
| `listing-lifecycle` | 1 hour | PENDING-business reminder emails (interval/count admin-configurable under Configuration → Go-Live Reminders) and the resulting auto-inactivation |
| `gallery-underuse` | 1 hour | The dormant-gallery nudge email and the ACTIVE↔DORMANT status flip, Starter tier only |
| `payment-reconciliation` | 5 minutes | Actively re-queries Daraja for payments stuck PENDING, in case a callback was delayed or lost; gives up after 24h and surfaces the payment for manual review in the admin Transactions page instead |

## What this actually is

**Three business types**, all going through the same core listing model:

- **Venue** — a permanent business (café, bar, salon, etc.)
- **Experience Host** — publishes one-off or recurring bookable
  experiences, no fixed venue required
- **Made in Kenya** — a maker/catalogue business. Distinct from the
  other two in a few ways: requires manual admin approval before
  publishing anything at all (`approvalStatus`: PENDING → APPROVED /
  REJECTED, via the admin's Business Approvals actions), needs 5
  approved photos to become publicly discoverable (vs. 1 for the other
  two types), has its own product catalogue (see below), and never
  appears in the Spot It / Popular This Month homepage rails — only in
  its own dedicated "Made in Kenya" rail and ordinary search/browse.

**Listing lifecycle** (`Business.listingStatus`): PENDING (no photo yet,
gets reminder emails) → ACTIVE (first approved photo) → INACTIVE (30
days with no photo, reminders exhausted) or DORMANT (Starter-tier
business genuinely under-using its gallery — different from INACTIVE,
which means zero photos and actually hidden; a DORMANT business is still
fully visible). Paid tiers never go DORMANT.

**Subscription tiers**: Starter (free) / Growth / Premium, admin-editable
limits (photos, videos, concurrent experiences) under Configuration →
Pricing & Tiers. The first 100 registered businesses get an automatic
30-day Premium trial offer (`firstCohortPremiumTrial`, doubles as a
"Beta Partner" admin filter/label). Admins can also grant a discount or
trial offer to an individual business, or broadcast one to a filtered
segment, from the admin Businesses page. A separate `isGrandfathered`
field exists on the schema for a planned permanent-discount-on-convert
perk, but it is **not wired up to anything yet** — the field is never
set anywhere in the code.

**Products / Catalogue**: a Made in Kenya business (once approved) can
post products (name, description, price, multiple photos) via its
dashboard's "Catalogue" tab. There's no separate product page —
sharing a specific product works via a `?product=<id>` query param on
the business's own profile page, which auto-opens that product and (via
`generateMetadata` on the frontend) renders a product-specific link
preview when shared.

**Reviews**: businesses cannot delete their own reviews (by design), but
admins can, on a business's behalf, from the admin Businesses page's
detail modal. Admins can also restrict a specific user from posting any
new reviews platform-wide (`User.reviewsSuspended`) — this doesn't touch
their existing reviews or anything else they can do.

**Email**: every automatic email (welcome, needs-a-photo, suspension/
reactivation, discount/trial offers, Made in Kenya approval/rejection,
pending-discovery reminders, gallery nudges) is a real, admin-editable
template under Email Templates in the admin panel, and every send is
logged to Send History — including automatic ones, attributed to
"System" rather than an admin. The one exception is Outreach, which is
also a real template but the only one with a manual "Send" action (to a
freely-typed list of email addresses, for prospects not yet in the
system) — every other built-in template fires only from a real action,
never manually.

**Admin panel** (`spotly-admin`, separate repo) covers: the businesses
list (search, extensive filtering, pagination, per-business detail
modal, Business Approvals actions for Made in Kenya, single- and
segment-level discount/trial grants), Email Templates + Send History,
Transactions (with manual payment recheck), Moderation Queue (photo/
video quality-gate spot-checks + perceptual-hash duplicate flags), and
Configuration (Pricing & Tiers, Categories, Neighbourhoods, Quick
Filters, Go-Live Reminder cadence, max categories per business).

## Environment variables

```
# Database
DATABASE_URL or POSTGRES_HOST/PORT/USER/PASSWORD/DB
DATABASE_SSL, DATABASE_CA_CERT     (optional, for managed Postgres requiring SSL)
DATABASE_LOGGING                  (optional, verbose query logging)

# Auth
JWT_SECRET
JWT_EXPIRES_IN

# Frontend origins (used to build correct links in emails, OAuth callbacks, etc.)
FRONTEND_URL
PUBLIC_API_URL

# Google OAuth — fully wired (src/auth/google.strategy.ts), not a placeholder.
# Without these set, /auth/google returns a clear 503 instead of crashing.
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL

# Media storage — Cloudinary. Without these, uploads fall back to local
# disk (./uploads) and are lost on every restart — not viable for
# production. StorageService detects them automatically.
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

# Email — Resend. Without RESEND_API_KEY, EmailService logs what it
# would have sent instead of actually sending. EMAIL_FROM must be a
# verified sending domain, not Resend's shared onboarding@resend.dev
# domain, to reliably reach anyone other than the Resend account owner.
RESEND_API_KEY
EMAIL_FROM

# M-Pesa Daraja — see below. NOT in production as of this writing;
# sandbox/simulated only.
MPESA_ENV                  # 'sandbox' or 'production'
MPESA_CONSUMER_KEY
MPESA_CONSUMER_SECRET
MPESA_SHORTCODE
MPESA_PASSKEY
MPESA_CALLBACK_URL         # must be a real, public HTTPS URL — Daraja cannot reach localhost
```

## M-Pesa Daraja — status: sandbox only, not in production

`DarajaService` is structurally complete — real STK Push initiation, a
real STK Push Query for reconciliation, idempotent + transactional
callback handling — but as of this writing it has **not been switched to
real production Safaricom credentials**. Without `MPESA_CONSUMER_KEY`/
`SECRET` set, it simulates responses instead of calling Daraja at all.

Going to production requires, roughly:
1. A registered Kenyan business entity with its own M-Pesa Paybill/Till
   (individuals cannot get production Daraja credentials)
2. Applying for Daraja "Go Live" via the developer portal, including
   running Safaricom's test-case scenarios against a real, publicly
   reachable callback URL
3. Once approved, swapping the four `MPESA_*` credentials above for the
   real ones and setting `MPESA_ENV=production`

No code changes are needed for that last step — the environment
variables alone control sandbox vs. production.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| Postgres + TypeORM entities, relations, transactions | Real |
| JWT auth, role guards, DTO validation | Real |
| Business (all 3 types) / Experience / Product / Review / Bookmark CRUD | Real |
| Tier-limit enforcement (photos, video, concurrent experiences) | Real, server-side |
| Image quality gate (resolution, blur via Laplacian variance) | Real — runs against actual uploaded bytes via `sharp` |
| Perceptual hash duplicate detection | Real |
| Admin panel (approvals, email, transactions, moderation, config) | Real |
| Background sweeps | Real logic, **unreliable trigger mechanism** — see critical issue above |
| M-Pesa Daraja STK Push + callback + reconciliation | Structurally real, **sandbox/simulated only** — see above |
| Media storage | Real — Cloudinary when configured, local disk otherwise |
| Video blur/orientation check | Not implemented — needs `ffmpeg` to extract a frame first |
| Google OAuth | Fully wired, needs real credentials to activate |
| Automated tests | Not implemented |
| Rate limiting | Not implemented |

## Known follow-ups, roughly in priority order

1. **Fix the scheduler/serverless mismatch** — see critical issue at the top.
2. Guard `PaymentService.initiate()` against an already-PENDING payment
   for the same business/purpose.
3. Add rate limiting, at minimum on the STK push, signup, and media
   upload endpoints.
4. Add automated tests for the business logic most likely to regress
   silently: tier/trial/discount eligibility, payment resolution
   idempotency, the approval-gate checks on Made in Kenya.
5. `ffmpeg`-based video quality checks (only duration is currently checked).
6. Complete the M-Pesa production go-live (see above).
7. Decide the fate of `isGrandfathered` — either wire it up to the
   originally-planned permanent-discount-on-convert perk, or remove the
   unused field.
