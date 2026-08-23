import * as dotenv from 'dotenv';
import * as path from 'path';
import { getEnvFile } from './env-file';

export function loadEnv(): string {
  const envFile = getEnvFile();
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  return envFile;
}
