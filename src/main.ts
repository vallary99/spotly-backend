import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { buildSwaggerConfig } from './libs/swagger/swagger.config';

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

  // Swagger at /api/docs. Registered on the express adapter rather than
  // as Nest controllers, so the global JwtAuthGuard never sees them.
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, buildSwaggerConfig()),
    {
      customSiteTitle: 'Spotly API',
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: {
        docExpansion: 'none',
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        persistAuthorization: true,
      },
    },
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Spotly API listening on http://localhost:${port}`);
  console.log(`API docs on http://localhost:${port}/api/docs`);
}
bootstrap();
