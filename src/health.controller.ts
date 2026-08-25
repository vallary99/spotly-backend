import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private config: ConfigService) {}

  @Public()
  @Get()
  root() {
    return { service: 'spotly-api', status: 'ok' };
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // GET /health/config — self-diagnostic for the stubbed integrations.
  // Never returns actual secret values, only whether each is set, so
  // it's safe to leave enabled and just check in a browser when
  // something "isn't working" but you're not sure if it's the .env
  // that didn't load or a genuine external-service problem.
  @Public()
  @Get('health/config')
  configStatus() {
    const has = (key: string) => Boolean(this.config.get<string>(key));
    return {
      google: {
        configured: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET'),
        clientIdPresent: has('GOOGLE_CLIENT_ID'),
        clientSecretPresent: has('GOOGLE_CLIENT_SECRET'),
        callbackUrl: this.config.get('GOOGLE_CALLBACK_URL') || null,
      },
      mpesa: {
        configured: has('MPESA_CONSUMER_KEY') && has('MPESA_CONSUMER_SECRET'),
      },
      storage: {
        // Cloudinary is the only configurable backend; unconfigured means
        // uploads land on local disk (fine for dev, not for production).
        configured:
          has('CLOUDINARY_CLOUD_NAME') &&
          has('CLOUDINARY_API_KEY') &&
          has('CLOUDINARY_API_SECRET'),
      },
      email: {
        configured: has('RESEND_API_KEY'),
      },
      frontendUrl: this.config.get('FRONTEND_URL') || null,
    };
  }
}
