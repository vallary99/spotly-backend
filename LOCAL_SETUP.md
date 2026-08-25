# Running Spotly Locally — Full End-to-End Setup

This covers both projects (`spotly-api` and `spotly-web`) on a fresh
machine, in order, so you can click through the whole product yourself.

Tested on macOS and Ubuntu/Debian-based Linux. Windows works fine too —
use WSL2 for the Postgres steps, since native Windows service
management for it differs.

---

## 1. Prerequisites

Install these first:

- **Node.js 20+** — check with `node --version`
- **PostgreSQL 14+**
- **npm** (comes with Node)

### macOS (Homebrew)

```bash
brew install node postgresql@16
brew services start postgresql@16
```

### Ubuntu / Debian / WSL2

```bash
sudo apt update
sudo apt install -y postgresql
sudo service postgresql start
```

Verify it's running:

```bash
pg_isready          # should print "accepting connections"
```

---

## 2. Set up the database

```bash
sudo -u postgres psql
```

Inside the `psql` prompt:

```sql
CREATE USER spotly WITH PASSWORD 'your_password_here' CREATEDB;
CREATE DATABASE spotly_dev OWNER spotly;
\q
```

---

## 3. Backend setup (`spotly-api`)

```bash
cd spotly-api
npm install
```

Copy the example env file. Which file the app reads is decided by
`NODE_ENV` — `local` reads `.env.local`, `production` reads `.env.prod`, and
`npm run start:dev` sets `NODE_ENV=local` for you:

```bash
cp .env.example .env.local
```

Open `.env.local` and set at minimum:

```bash
NODE_ENV=local
POSTGRES_HOST="localhost"
POSTGRES_PORT=5432
POSTGRES_DB="spotly_dev"
POSTGRES_USER="spotly"
POSTGRES_PASSWORD="your_password_here"
JWT_SECRET="generate-a-real-random-string-here"
FRONTEND_URL="http://localhost:3001"
```

(A single `DATABASE_URL` works too, and takes precedence when set —
that's what hosted providers hand you.)

Generate a real `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Everything else in `.env.local` (M-Pesa, Cloudinary, Google/Apple) can
stay blank for now — see Section 6 below for wiring those in later. The app
runs fully without them; payments and OAuth operate in a clearly-labeled
simulated mode, and media uploads are written to `./uploads` and served
from `/uploads/`.

Create the schema. Your local migrations live in
`src/database/local-migrations/`, which is gitignored and starts empty —
so on a fresh database you generate the initial one from the entities,
then run it:

```bash
npm run migration:generate   # first time only
npm run migration:run
```

From then on it's `migration:generate` after an entity change,
`migration:run` to apply, `migration:revert` to undo. When a schema
change is ready to ship, generate it once more against production
(`npm run migration:generate:prod`) — that writes the reviewed,
committed copy into `src/database/migrations/`.

Start the backend:

```bash
npm run start:dev
```

You should see a list of mapped routes end with:

```
Spotly API listening on http://localhost:3000
```

Confirm it's alive:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

Leave this running in its own terminal tab.

---

## 4. Frontend setup (`spotly-web`)

Open a **second terminal tab**:

```bash
cd spotly-web
npm install
```

Create the env file:

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
```

Start the frontend:

```bash
npm run dev
```

You should see:

```
▲ Next.js 16.x
- Local: http://localhost:3000
```

**Note:** Next.js defaults to port 3000, which the backend is already
using. Either:

- Run the frontend on a different port: `npm run dev -- -p 3001`, or
- Change the backend's `PORT` in its `.env.local` to something else and
  update `NEXT_PUBLIC_API_URL` to match.

If you use port 3001 for the frontend, also update the backend's
`FRONTEND_URL` in `.env.local` to `http://localhost:3001` so OAuth redirects
land in the right place.

---

## 5. Try it end-to-end

Open **http://localhost:3001** (or whichever port you chose).

A good first pass through the app:

1. **Browse as a guest** — the homepage should load (empty rails at
   first, since there's no data yet).
2. **Click "List Your Business"** — this opens the sign-up modal.
3. **Sign up with email** — you'll land straight on the business
   registration form (not bounced back to the homepage — this was a
   real bug I found and fixed, so it's worth confirming it works).
4. **Register a business** — fill it in, submit. You should land on
   `/dashboard` automatically.
5. **On the dashboard** — try editing the profile, uploading a photo
   (the quality gate will reject anything under 800×600 or too blurry —
   try a small image to see the rejection message, then a normal-sized
   photo to see it publish), creating an experience, and clicking
   "Upgrade via M-Pesa" (it'll show "Simulated STK Push sent" since no
   real Daraja credentials are configured — that's expected).
6. **Go back to the homepage** — your new business should now appear in
   the Trending rail.
7. **Click into the business** — try Save, and Rate & Review.
8. **Check Saved** (heart icon in the nav) — your saved business should
   be there.

If a step 404s or the page looks unstyled, see the troubleshooting
section below before assuming something's broken.

---

## 6. Wiring in real credentials (optional, for going further than local testing)

Everything below is optional — the app is fully usable for local
development and testing without any of it.

### Google Sign-In
1. Go to [Google Cloud Console](https://console.cloud.google.com/) →
   APIs & Services → Credentials → Create OAuth Client ID (Web
   application).
2. Authorized redirect URI: `http://localhost:3000/auth/google/callback`
3. Copy the Client ID and Secret into the backend's `.env.local`:
   ```
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   ```
4. Restart the backend. The "Continue with Google" button will now
   complete a real OAuth flow instead of returning a 503.

### M-Pesa Daraja (Safaricom)
See the checklist in `spotly-api/README.md` — Consumer Key/Secret,
Shortcode, Passkey, and a publicly-reachable callback URL (Daraja can't
reach `localhost`, so you'll need `ngrok` or a real deployment for this
one specifically).

### Media storage (Cloudinary)
Also in `spotly-api/README.md` — only needed once you deploy, since
local disk works fine while developing. Set `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` and uploads start
going to Cloudinary instead of `./uploads`.

---

## 7. Troubleshooting

**"Cannot connect to database" on backend start**
Postgres isn't running, or the credentials in `.env.local` don't
match what you created in Section 2. Run `pg_isready` to check the
service, and `psql -U spotly -d spotly_dev -h localhost` to test the
credentials directly (it'll prompt for the password).

**Uploaded photos 404 when the frontend tries to load them**
In local-disk mode the API serves uploads from its own `/uploads/`
route, so the URL is built from `PUBLIC_API_URL` (defaulting to
`http://localhost:$PORT`). If the API isn't on port 3000, set
`PUBLIC_API_URL` in `.env.local` to match.

**Frontend loads but looks unstyled / icons missing**
Bootstrap Icons and the Cinzel/Inter fonts load from public CDNs
(`cdnjs.cloudflare.com`, `fonts.googleapis.com`). If you're behind a
restrictive proxy or firewall, those requests may be blocked — check
your browser's network tab for 403s on those specific domains.

**"Port 3000 already in use"**
Something else (often the backend) is already using it. Either stop
that process or run the frontend on a different port as described in
Section 4.

**Google/Apple buttons redirect to an error page**
Expected until you've completed Section 6 — they'll show a clear
"...isn't configured yet" message rather than crashing.

**Photo upload always rejects**
The quality gate requires at least 800×600 resolution and rejects
low-texture/blurry images. Try a normal photograph rather than a
screenshot or a solid-color test image.

**Payment stays on "Waiting for confirmation…" forever**
Expected in simulated mode (no real Daraja credentials) — there's no
real M-Pesa callback to complete it. To see the full success state
locally without real credentials, you can manually POST a fake callback
matching the shape in `spotly-api/README.md`'s payment section, or just
confirm the initiate + polling mechanics are working (which this
confirms) and treat the "SUCCESS" transition as covered by Section 6
once real credentials are in place.
