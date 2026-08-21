import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

// Wraps AuthGuard('google') with a config-presence check, so hitting
// /auth/google before real credentials are set returns a clear, friendly
// error instead of passport attempting (and failing) an OAuth redirect
// with placeholder values.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.config.get('GOOGLE_CLIENT_ID') || !this.config.get('GOOGLE_CLIENT_SECRET')) {
      throw new ServiceUnavailableException(
        'Google sign-in isn\'t configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the backend .env.',
      );
    }
    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
