import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-apple';
import { ConfigService } from '@nestjs/config';

// Guarded in AuthModule: only meaningfully active when APPLE_CLIENT_ID/
// TEAM_ID/KEY_ID/PRIVATE_KEY are present (see oauth-config.guard.ts),
// so the app boots cleanly without them. Apple's private key is the .p8
// file downloaded from the Apple Developer portal — store its contents
// (not a file path) in APPLE_PRIVATE_KEY.
@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('APPLE_CLIENT_ID') || 'not-configured',
      teamID: config.get<string>('APPLE_TEAM_ID') || 'not-configured',
      keyID: config.get<string>('APPLE_KEY_ID') || 'not-configured',
      privateKeyString: config.get<string>('APPLE_PRIVATE_KEY') || 'not-configured',
      callbackURL: config.get<string>('APPLE_CALLBACK_URL') || 'http://localhost:3000/auth/apple/callback',
      scope: ['email', 'name'],
      passReqToCallback: false,
    });
  }

  // Apple only sends `profile` populated on the very first sign-in;
  // passport-apple merges the decoded ID token's email into it on
  // subsequent sign-ins too, so this stays reliable either way.
  async validate(accessToken: string, refreshToken: string, idToken: unknown, profile: Profile) {
    const email = profile?.email;
    if (!email) {
      throw new Error('Apple did not return an email for this account.');
    }
    const name = profile?.name
      ? `${profile.name.firstName ?? ''} ${profile.name.lastName ?? ''}`.trim()
      : email.split('@')[0];
    return { email, name: name || email.split('@')[0] };
  }
}
