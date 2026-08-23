import { DataSource } from 'typeorm';
import { loadEnv } from '../../libs/env/load-env';
import {
  buildDataSourceOptions,
  getMigrationsDir,
} from './data-source-options';

const envFile = loadEnv();

console.log(
  `[typeorm] NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} · env file: ${envFile} · migrations: src/database/${getMigrationsDir()}`,
);

export const AppDataSource = new DataSource(buildDataSourceOptions());
