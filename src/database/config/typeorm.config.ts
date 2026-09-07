import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source-options';

// 'app' mode — the live API needs the pooled connection, not the
// session-mode one migrations use (see data-source-options.ts's
// ConnectionMode comment for the actual incident this fixes).
export default registerAs('typeorm', (): TypeOrmModuleOptions =>
  buildDataSourceOptions('app'),
);
