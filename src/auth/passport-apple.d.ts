declare module 'passport-apple' {
  import { Strategy as PassportStrategy } from 'passport-strategy';

  export interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    privateKeyString?: string;
    privateKeyPath?: string;
    callbackURL: string;
    scope?: string[];
    passReqToCallback?: boolean;
  }

  export interface Profile {
    id?: string;
    email?: string;
    name?: { firstName?: string; lastName?: string };
  }

  export type VerifyCallback = (error: unknown, user?: unknown, info?: unknown) => void;

  export class Strategy extends PassportStrategy {
    constructor(options: AppleStrategyOptions);
    constructor(
      options: AppleStrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        idToken: unknown,
        profile: Profile,
        done: VerifyCallback,
      ) => void,
    );
  }
}
