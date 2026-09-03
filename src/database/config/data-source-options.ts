import { DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

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

export function getEntitiesGlob(): string {
  return isTypeScript() ? 'src/**/*.entity.ts' : 'dist/**/*.entity.js';
}

function getConnection(): Pick<
  PostgresConnectionOptions,
  'url' | 'host' | 'port' | 'username' | 'password' | 'database'
> {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL };
  }
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  };
}

function getSsl(): PostgresConnectionOptions['ssl'] {
  if (process.env.DATABASE_SSL !== 'true') return false;
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
    ssl: getSsl(),
    entities: [getEntitiesGlob()],
    migrations: [getMigrationsGlob()],
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    logging: process.env.DATABASE_LOGGING === 'true',
  };
}
