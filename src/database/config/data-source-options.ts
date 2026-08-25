import { DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { getEnvFile } from '../../libs/env/env-file';
import { ENTITIES } from './entities';

export function getMigrationsDir(nodeEnv = process.env.NODE_ENV): string {
  return nodeEnv === 'local' ? 'local-migrations' : 'migrations';
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

const URL_VARS = [
  'DATABASE_URL',
  // Injected by Vercel's Supabase integration. The pooled sibling
  // (DATABASE_POSTGRES_URL, pgBouncer on 6543) is deliberately not used:
  // transaction pooling breaks the advisory locks and DDL that migrations
  // depend on, and one wrong connection there is a stuck migration.
  'DATABASE_POSTGRES_URL_NON_POOLING',
] as const;

// A connection string may carry ?sslmode=..., which node-postgres lets
// override the `ssl` option entirely — and sslmode=require then demands a
// chain that managed providers do not present, failing with
// "self-signed certificate in certificate chain". So the parameter is
// stripped and its intent handed to getSsl(), which knows how to use
// DATABASE_CA_CERT. Everything before the query string is left byte for
// byte, so passwords are never re-encoded.
function resolveUrl(): { url: string; sslRequested: boolean } | null {
  for (const key of URL_VARS) {
    const raw = process.env[key];
    if (!raw) continue;
    const [base, query] = raw.split('?');
    const params = new URLSearchParams(query ?? '');
    const mode = params.get('sslmode');
    params.delete('sslmode');
    const rest = params.toString();
    return {
      url: rest ? `${base}?${rest}` : base,
      sslRequested: mode !== null && mode !== 'disable',
    };
  }
  return null;
}

function getConnection(): Pick<
  PostgresConnectionOptions,
  'url' | 'host' | 'port' | 'username' | 'password' | 'database'
> {
  const resolved = resolveUrl();
  if (resolved) {
    return { url: resolved.url };
  }
  if (!process.env.POSTGRES_HOST) {
    throw new Error(
      `No database configured for NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}. ` +
        `Set one of ${URL_VARS.join(', ')}, or POSTGRES_HOST — in ${getEnvFile()}, or as real environment ` +
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

export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    ...getConnection(),
    ssl: getSsl(resolveUrl()?.sslRequested ?? false),
    entities: ENTITIES,
    migrations: [getMigrationsGlob()],
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    logging: process.env.DATABASE_LOGGING === 'true',
  };
}
