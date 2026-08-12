import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

// Registered unconditionally in AuthModule (with 'not-configured'
// fallback values below so PassportStrategy's constructor never throws
// on missing config) — the actual gating happens one level up, in
// GoogleAuthGuard, which checks GOOGLE_CLIENT_ID/SECRET are real before
// ever letting a request reach this strategy. So the app boots cleanly
// either way; hitting /auth/google without real credentials configured
// gets a clear 503 from the guard, not a broken redirect from here.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: { emails?: { value: string }[]; displayName?: string },
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Google account has no public email.'), false);
    }
    done(null, { email, name: profile.displayName || email.split('@')[0] });
  }
}
