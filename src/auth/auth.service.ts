import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, UserRole } from '../entities/user.entity';
import { SignupDto, LoginDto } from './dto/auth.dto';
import { EmailService } from '../email/email.service';

// Live Google/Apple OAuth is wired up (see google.strategy.ts /
// apple.strategy.ts). If GOOGLE_CLIENT_ID/SECRET or the Apple equivalents
// aren't set in .env, those routes return a clear "not configured" error
// instead of crashing — see auth.controller.ts / oauth-config.guard.ts.
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
    private email: EmailService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: UserRole.REGISTERED,
      }),
    );
    await this.email.queueWelcomeEmail(user.email, user.name);
    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.issueToken(user);
  }

  // POST /auth/forgot-password — deliberately always returns the same
  // generic response whether or not the email actually has an account,
  // so this endpoint can never be used to enumerate registered emails.
  // The real work only happens internally when a match is found.
  async requestPasswordReset(email: string, resetUrlBase: string) {
    const user = await this.users.findOne({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      user.passwordResetToken = token;
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await this.users.save(user);
      const resetUrl = `${resetUrlBase.replace(/\/$/, '')}/reset-password?token=${token}`;
      await this.email.queuePasswordResetEmail(user.email, user.name, resetUrl);
    }
    return { message: "If that email has an account, we've sent a reset link." };
  }

  // POST /auth/reset-password
  async resetPassword(token: string, newPassword: string) {
    const user = await this.users.findOne({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException('This reset link is invalid or has expired — request a new one.');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await this.users.save(user);
    return { message: 'Password updated — you can now log in with your new password.' };
  }

  // Shared by the Google and Apple callback routes. Finds an existing
  // user by email (so someone who signed up with email/password and later
  // uses "Continue with Google" on the same address lands on the same
  // account, rather than silently creating a duplicate), or creates one.
  async oauthLogin(params: { email: string; name: string; provider: 'google' | 'apple' }) {
    let user = await this.users.findOne({ where: { email: params.email } });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          email: params.email,
          name: params.name || params.email.split('@')[0],
          authProvider: params.provider,
          role: UserRole.REGISTERED,
          // no passwordHash — this account signs in via OAuth. If they
          // later use "forgot password," resetPassword() doesn't check
          // whether one was already set, so that flow doubles as "add a
          // password login to an OAuth-only account" — intentional, not
          // a gap; the reset token still requires access to this same
          // email inbox either way, so it's the same trust boundary as
          // any other password reset.
        }),
      );
      await this.email.queueWelcomeEmail(user.email, user.name);
    }
    return this.issueToken(user);
  }

  // POST /auth/refresh — re-issues a token with the user's *current*
  // role/businessId from the DB. Needed because registering a business
  // updates the User's role server-side, but the token already in the
  // client's hands still says REGISTERED until it's refreshed — without
  // this, the only way to pick up the new role would be logging out and
  // back in, which is a bad flow to put someone through right after they
  // just finished onboarding.
  async refreshToken(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return this.issueToken(user);
  }

  private async issueToken(user: User) {
    const business = await this.users.manager.query(
      `SELECT id FROM businesses WHERE "ownerId" = $1 LIMIT 1`,
      [user.id],
    );
    const businessId = business?.[0]?.id;
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(businessId ? { businessId } : {}),
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
