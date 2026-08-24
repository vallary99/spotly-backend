import { DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { getEnvFile } from '../../libs/env/env-file';

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
  if (!process.env.POSTGRES_HOST) {
    throw new Error(
      `No database configured for NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}. ` +
        `Set DATABASE_URL or POSTGRES_HOST — in ${getEnvFile()}, or as real environment ` +
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
