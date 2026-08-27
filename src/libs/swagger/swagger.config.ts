import { DocumentBuilder } from '@nestjs/swagger';
import { createRequire } from 'module';

const { version } = createRequire(__filename)('../../../package.json') as {
  version: string;
};

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Spotly API')
    .setDescription(
      [
        'Backend API for Spotly, a discovery platform for Nairobi businesses and the experiences they host.',
        '',
        '**Authentication.** Routes are protected by default and opt out with `@Public()`,',
        'so guest browsing is explicit rather than accidental. Sign in at',
        '`POST /auth/login` (or `POST /auth/signup`) and pass the returned token as',
        '`Authorization: Bearer <token>` via **Authorize** above.',
        '',
        'Three roles gate access: `REGISTERED` (any signed-in user), `BUSINESS_OWNER`',
        '(gained by registering a business), and `ADMIN`. Registering a business',
        'changes your role, so call `POST /auth/refresh` afterwards — the token has to',
        'be reissued to carry it, and calls will 403 until you do.',
        '',
        '**Tier limits are enforced server-side.** Photo counts, video counts and length,',
        'and concurrent experiences are all checked against the business subscription',
        'tier, so a 403 from a media or experience route is usually a package limit',
        'rather than a permissions problem.',
        '',
        '**Integrations degrade rather than fail.** With no credentials configured,',
        'M-Pesa payments and email run in a clearly-labelled simulated mode and media',
        'uploads are written to local disk. Check `GET /health/config` to see what is',
        'actually wired up.',
        '',
        'Download the specification: [OpenAPI JSON](/api/docs-json)',
      ].join('\n'),
    )
    .setVersion(version)
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'JWT from POST /auth/login or /auth/signup. Re-issue with POST /auth/refresh after registering a business, otherwise the token still carries the old role.',
    })
    .addTag(
      'Health',
      'Liveness and a non-secret view of which integrations are configured.',
    )
    .addTag(
      'Auth',
      'Signup, login, password reset, token refresh, and Google OAuth.',
    )
    .addTag(
      'Businesses',
      'Business profiles, listings and the owner dashboard.',
    )
    .addTag(
      'Experiences',
      'Time-bound events a business hosts. They expire into a permanent hosting history rather than being deleted.',
    )
    .addTag('Reviews', 'Ratings and written reviews left on a business.')
    .addTag('Bookmarks', 'Saved businesses and experiences.')
    .addTag('Search', 'Cross-entity search.')
    .addTag('Home', 'The composed home feed rails.')
    .addTag(
      'Media',
      'Photo and video upload. Every item passes an automated quality gate (resolution, blur, duration) before it publishes, and is perceptually hashed for duplicate detection.',
    )
    .addTag('Subscriptions', 'Tiers, what each package includes, and trials.')
    .addTag('Payments', 'M-Pesa Daraja STK Push and its callback.')
    .addTag(
      'Admin',
      'Staff-only: analytics, moderation queue, business suspension, campaigns and email templates.',
    )
    .build();
}
