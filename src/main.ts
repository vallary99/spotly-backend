import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { buildSwaggerConfig } from './libs/swagger/swagger.config';
import { buildSwaggerHtml } from './libs/swagger/swagger-ui';

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
  // /uploads/... when Cloudinary isn't configured — this is what makes
  // uploaded photos actually render in local development. Irrelevant
  // once Cloudinary is wired up; nothing gets written here then.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Swagger at /api/docs, with the spec at /api/docs-json. Both are served
  // straight off the express instance rather than as Nest controllers, so
  // the global JwtAuthGuard never sees them.
  //
  // The page is built here instead of via SwaggerModule.setup() because
  // that serves the UI assets from node_modules/swagger-ui-dist on disk,
  // which a serverless deploy does not bundle — see buildSwaggerHtml().
  const title = 'Spotly API';
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  const html = buildSwaggerHtml('/api/docs-json', title);
  const server = app.getHttpAdapter().getInstance();
  server.get('/api/docs-json', (_req, res) => res.json(document));
  server.get('/api/docs', (_req, res) => res.type('html').send(html));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Spotly API listening on http://localhost:${port}`);
  console.log(`API docs on http://localhost:${port}/api/docs`);
}
bootstrap();
