import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source-options';

export default registerAs('typeorm', (): TypeOrmModuleOptions =>
  buildDataSourceOptions(),
);
