import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // NFR-6: DTO-driven server-side validation
      transform: true,
    }),
  );
  app.useGlobalFilters(new DatabaseExceptionFilter());
  // Serves locally-persisted media uploads (see StorageService) at
  // /uploads/... when no real S3/R2 is configured — this is what makes
  // uploaded photos actually render in local development. Irrelevant
  // once real cloud storage is wired up; nothing gets written here then.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Spotly API listening on http://localhost:${port}`);
}
bootstrap();
