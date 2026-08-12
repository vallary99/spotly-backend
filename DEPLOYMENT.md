# Deploying Spotly API to the web

This is a **backend API only** — there's no frontend yet, so once deployed,
visiting the URL in a browser shows JSON (e.g. `GET /` returns
`{"service":"spotly-api","status":"ok"}`). Testing it means calling
endpoints with `curl`, Postman, or a frontend that consumes them — not
browsing pages.

## Recommended: Railway (easiest — one platform for API + Postgres + Redis)

Railway can provision Postgres, Redis, and your Node service together,
and it builds directly from the included `Dockerfile`.

1. Push this project to a GitHub repo.
2. Go to [railway.app](https://railway.app), create a new project, and
   choose "Deploy from GitHub repo" — select this repo.
3. In the same project, click **+ New → Database → PostgreSQL**, and
   separately **+ New → Database → Redis**. Railway auto-generates
   connection strings for both.
4. On your API service, go to **Variables** and set:
   - `DATABASE_URL` → reference the Postgres service's `DATABASE_URL`
     variable (Railway lets you reference other services' variables
     directly, e.g. `${{Postgres.DATABASE_URL}}`)
   - `REDIS_HOST` / `REDIS_PORT` → from the Redis service's connection
     info (or just `${{Redis.REDIS_URL}}` if you switch the Redis config
     in `queue.module.ts` to parse a single URL instead of host/port —
     either works, host/port is simpler to leave as-is)
   - `JWT_SECRET` → generate a real random string, don't reuse the dev one
   - `PORT` → Railway sets this automatically; you generally don't need
     to set it yourself
   - Everything else from `.env.example` (M-Pesa, storage, etc.) — leave
     blank until you have real credentials; the app runs fine without
     them (payments/storage just stay in simulated mode)
5. Railway builds the `Dockerfile` and deploys. Once live, it gives you a
   public URL like `https://spotly-api-production.up.railway.app`.
6. Test it:
   ```bash
   curl https://your-app.up.railway.app/health
   curl https://your-app.up.railway.app/subscriptions/tiers
   ```

## Alternative: Render

Same shape as Railway — connect the GitHub repo, add a PostgreSQL
instance and a Redis instance from Render's dashboard (both have free
tiers), set the same environment variables, and Render builds the
`Dockerfile` automatically. Render's free tier spins down when idle,
so the first request after inactivity will be slow (~30s cold start) —
fine for testing, not for a real launch.

## Alternative: Fly.io (more control, still simple)

```bash
fly launch          # detects the Dockerfile, asks region/name
fly postgres create # provision Postgres, attach it
fly redis create    # provision Upstash Redis, attach it
fly secrets set JWT_SECRET=your-real-secret
fly deploy
```

## Before you go live for real (not just testing)

- **Migrations, not `synchronize: true`.** Right now
  `src/config/typeorm.config.ts` has `synchronize: true`, which
  auto-creates/alters tables from the entity definitions — fine for
  development, dangerous in production (a bad entity change can silently
  drop a column). Switch to `typeorm migration:generate` +
  `typeorm migration:run` before real data is on the line.
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
