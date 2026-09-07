import { DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { getEnvFile } from '../../libs/env/env-file';
import { ENTITIES } from './entities';

// Both `local` and `prod` read from the SAME migrations folder now —
// only which database they connect to differs (via .env.local vs
// .env.prod, see getConnection() below). This used to branch to a
// separate `local-migrations` folder that was permanently empty, which
// meant `npm run migration:run` (no suffix) silently did nothing while
// `npm run migration:run:prod` was the only command that actually ran
// anything — a real incident (Sep 2026): a person trying to fix their
// LOCAL database's stale schema was told to run `:prod`, which is the
// only thing that would have worked, but which also means any local-fix
// instructions in that shape run against production by construction.
// One folder removes that trap entirely.
export function getMigrationsDir(_nodeEnv = process.env.NODE_ENV): string {
  return 'migrations';
}

function isTypeScript(): boolean {
  return __filename.endsWith('.ts');
}

export function getMigrationsGlob(nodeEnv = process.env.NODE_ENV): string {
  const dir = getMigrationsDir(nodeEnv);
  return isTypeScript()
    ? `src/database/${dir}/*.ts`
    : `dist/database/${dir}/*.js`;
}

// Which connection a caller actually needs — see buildDataSourceOptions.
// This distinction is the fix for a real production incident (Sep 2026):
// the live API was crashing outright with "max clients reached in
// session mode - pool_size: 15", because it was using the SAME
// session-mode/direct connection the migration CLI needs, for every
// ordinary request too. Session mode holds one real Postgres backend
// connection per client for the client's whole lifetime — fine for a
// short-lived migration script, but a serverless API can have several
// function instances alive at once, each wanting its own connection,
// and 15 total disappears fast under even modest concurrent traffic.
export type ConnectionMode = 'app' | 'migration';

const MIGRATION_URL_VARS = [
  'DATABASE_URL',
  // Injected by Vercel's Supabase integration. The pooled sibling
  // (DATABASE_POSTGRES_URL, pgBouncer on 6543) is deliberately not used
  // HERE: transaction pooling breaks the advisory locks and DDL that
  // migrations depend on, and one wrong connection there is a stuck
  // migration. The live app below uses the opposite preference.
  'DATABASE_POSTGRES_URL_NON_POOLING',
] as const;

const APP_URL_VARS = [
  // Same pgBouncer-pooled connection the migration comment above warns
  // migrations away from — that warning doesn't apply here. A
  // transaction-mode pooler multiplexes many logical clients over a
  // much smaller number of real backend connections, which is exactly
  // what a serverless API with several concurrent instances needs, and
  // is the opposite of what was actually deployed before this fix.
  'DATABASE_POSTGRES_URL',
  'DATABASE_URL',
  'DATABASE_POSTGRES_URL_NON_POOLING',
] as const;

// A connection string may carry ?sslmode=..., which node-postgres lets
// override the `ssl` option entirely — and sslmode=require then demands a
// chain that managed providers do not present, failing with
// "self-signed certificate in certificate chain". So the parameter is
// stripped and its intent handed to getSsl(), which knows how to use
// DATABASE_CA_CERT. Everything before the query string is left byte for
// byte, so passwords are never re-encoded.
function resolveUrl(mode: ConnectionMode): { url: string; sslRequested: boolean } | null {
  const vars = mode === 'app' ? APP_URL_VARS : MIGRATION_URL_VARS;
  for (const key of vars) {
    const raw = process.env[key];
    if (!raw) continue;
    const [base, query] = raw.split('?');
    const params = new URLSearchParams(query ?? '');
    const sslMode = params.get('sslmode');
    params.delete('sslmode');
    const rest = params.toString();
    return {
      url: rest ? `${base}?${rest}` : base,
      sslRequested: sslMode !== null && sslMode !== 'disable',
    };
  }
  return null;
}

function getConnection(mode: ConnectionMode): Pick<
  PostgresConnectionOptions,
  'url' | 'host' | 'port' | 'username' | 'password' | 'database'
> {
  const resolved = resolveUrl(mode);
  if (resolved) {
    return { url: resolved.url };
  }
  if (!process.env.POSTGRES_HOST) {
    const vars = mode === 'app' ? APP_URL_VARS : MIGRATION_URL_VARS;
    throw new Error(
      `No database configured for NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}. ` +
        `Set one of ${vars.join(', ')}, or POSTGRES_HOST — in ${getEnvFile()}, or as real environment ` +
        `variables if this is a deployed host. Refusing to fall back to a default, because ` +
        `a "prod" command quietly connecting to localhost is how a local database gets ` +
        `migrated by mistake.`,
    );
  }
  return {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  };
}

// DATABASE_SSL is authoritative when set either way. With it unset, a
// connection string that asked for TLS via sslmode still gets it — that
// intent would otherwise be lost when resolveUrl() strips the parameter.
function getSsl(sslRequestedByUrl: boolean): PostgresConnectionOptions['ssl'] {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL !== 'true' && !sslRequestedByUrl) return false;
  return {
    rejectUnauthorized: Boolean(process.env.DATABASE_CA_CERT),
    ...(process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT }
      : {}),
  };
}

// mode defaults to 'migration' — datasource.ts (the CLI) relies on that
// default and never passes anything; typeorm.config.ts (the live app,
// see below) is the one place that explicitly asks for 'app'.
export function buildDataSourceOptions(mode: ConnectionMode = 'migration'): DataSourceOptions {
  return {
    type: 'postgres',
    ...getConnection(mode),
    ssl: getSsl(resolveUrl(mode)?.sslRequested ?? false),
    entities: ENTITIES,
    migrations: [getMigrationsGlob()],
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    logging: process.env.DATABASE_LOGGING === 'true',
    ...(mode === 'app'
      ? {
          // Conservative cap, not just relying on the pooled connection
          // string alone — belt and suspenders. Each serverless
          // function instance only ever needs a handful of connections
          // for its own concurrent requests, not TypeORM's default
          // pool size (10); keeping this small leaves headroom under
          // the provider's total cap even if several instances are
          // warm at once. Tune upward only alongside actually
          // upgrading the Postgres plan's connection limit.
          extra: { max: 3 },
        }
      : {}),
  };
}
