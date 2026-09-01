# Deploying Spotly API to the web

This is a **backend API only** — there's no frontend yet, so once deployed,
visiting the URL in a browser shows JSON (e.g. `GET /` returns
`{"service":"spotly-api","status":"ok"}`). Testing it means calling
endpoints with `curl`, Postman, or a frontend that consumes them — not
browsing pages.

## Recommended: Railway (easiest — one platform for API + Postgres)

Railway can provision Postgres and your Node service together, and it
builds directly from the included `Dockerfile`.

1. Push this project to a GitHub repo.
2. Go to [railway.app](https://railway.app), create a new project, and
   choose "Deploy from GitHub repo" — select this repo.
3. In the same project, click **+ New → Database → PostgreSQL**.
   Railway auto-generates the connection string.
4. On your API service, go to **Variables** and set:
   - `DATABASE_URL` → reference the Postgres service's `DATABASE_URL`
     variable (Railway lets you reference other services' variables
     directly, e.g. `${{Postgres.DATABASE_URL}}`)
   - `JWT_SECRET` → generate a real random string, don't reuse the dev one
   - `PORT` → Railway sets this automatically; you generally don't need
     to set it yourself
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
     `CLOUDINARY_API_SECRET` → set these before you upload anything you
     care about. Without them, media is written to the container's local
     disk, which is wiped on every deploy and restart.
   - `NODE_ENV` → `production`
   - Everything else from `.env.example` (M-Pesa, OAuth, etc.) — leave
     blank until you have real credentials; the app runs fine without
     them (payments and OAuth stay in a clearly-labeled simulated mode)
5. Railway builds the `Dockerfile` and deploys. Once live, it gives you a
   public URL like `https://spotly-api-production.up.railway.app`.
6. Test it:
   ```bash
   curl https://your-app.up.railway.app/health
   curl https://your-app.up.railway.app/subscriptions/tiers
   ```

## Alternative: Render

Same shape as Railway — connect the GitHub repo, add a PostgreSQL
instance from Render's dashboard, set the same environment variables,
and Render builds the `Dockerfile` automatically. The included
`render.yaml` Blueprint does all of this for you. Render's free tier
spins down when idle, so the first request after inactivity will be slow
(~30s cold start) — and, more importantly, the recurring sweeps in
`src/tasks/scheduler.service.ts` don't run while the service is asleep,
which is why `render.yaml` specifies the `starter` plan.

## Alternative: Fly.io (more control, still simple)

```bash
fly launch          # detects the Dockerfile, asks region/name
fly postgres create # provision Postgres, attach it
fly secrets set JWT_SECRET=your-real-secret
fly deploy
```

## Before you go live for real (not just testing)

- **Run the migrations.** `synchronize` is off everywhere, so the
  schema comes entirely from `src/database/migrations/` — the same
  committed set that local development runs too (local and prod only
  differ in which database they connect to, not which migration files
  they apply). The included `render.yaml` runs them via
  `preDeployCommand: npm run migration:run:deploy` before each new build
  takes traffic. On any other host, run that same command as a deploy
  step — it uses plain `node` against the compiled migrations in
  `dist/`, since the production image has no dev dependencies. To run
  them from your laptop against the live database instead, put its
  credentials in `.env.prod` (with `DATABASE_SSL=true`) and use
  `npm run migration:run:prod`.
- **A real `JWT_SECRET`.** Generate one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  — never reuse the placeholder from `.env.example`.
- **M-Pesa's callback URL must be your real public URL.** Once deployed,
  set `MPESA_CALLBACK_URL` to
  `https://your-deployed-domain.com/payments/mpesa/callback` and use that
  same URL when registering with Safaricom's Daraja portal. Daraja can't
  reach `localhost`, which is exactly why this step only becomes possible
  once you're deployed.
- **CORS.** `main.ts` currently calls `app.enableCors()` with no
  restrictions — fine while there's no frontend yet, but once you build
  one, lock it down to that frontend's domain:
  `app.enableCors({ origin: 'https://your-frontend.com' })`.
