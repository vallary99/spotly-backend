import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { runInBackground } from '../common/utils/background.util';

// Wraps Resend (resend.com) for transactional and general-update email.
// Chosen over SES/SendGrid/Postmark for MVP because its free tier (3,000
// emails/month, 100/day) comfortably covers welcome emails + occasional
// broadcast updates for the first cohort of users, its API is a single
// call with no domain-verification friction to get started (you can send
// from their shared domain immediately, then move to your own domain
// once you have one), and pricing beyond free is still cheap (~$20/mo
// for 50k emails) if usage grows past the free tier.
//
// Without RESEND_API_KEY set, this logs what it would have sent instead
// of calling the real API — same posture as DarajaService/StorageService,
// so signup/onboarding never breaks just because email isn't configured
// yet.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  private get fromAddress(): string {
    // Resend's shared "onboarding@resend.dev" sender works immediately
    // with no setup, but only delivers to the account owner's own email
    // during testing — verify your own domain in the Resend dashboard
    // and set EMAIL_FROM before relying on this for real users.
    return (
      this.config.get<string>('EMAIL_FROM') || 'Spotly <onboarding@resend.dev>'
    );
  }

  async send(params: { to: string; subject: string; html: string }) {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not set — simulating email. Would send "${params.subject}" to ${params.to}.`,
      );
      return { simulated: true };
    }
    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { simulated: false };
    } catch (err) {
      // Email failures should never break the request that triggered
      // them (signup, business registration, etc.) — log and move on.
      this.logger.error(
        `Failed to send email to ${params.to}: ${(err as Error).message}`,
      );
      return { simulated: false, failed: true };
    }
  }

  async sendWelcomeEmail(to: string, name: string) {
    return this.send({
      to,
      subject: 'Welcome to Spotly!',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Welcome to Spotly, ${escapeHtml(name)}!</h1>
          <p>You're in. Start exploring Nairobi's first 200 businesses — save your favorites,
          leave reviews, and find your next spot.</p>
          <p style="margin-top: 24px;">
            <a href="${'http://localhost:3001'}" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Start exploring
            </a>
          </p>
        </div>
      `,
    });
  }

  async sendBusinessWelcomeEmail(to: string, businessName: string) {
    return this.send({
      to,
      subject: `${businessName} is live on Spotly!`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">${escapeHtml(businessName)} is live!</h1>
          <p>Your business is now discoverable on Spotly. Head to your Business Owner Surface
          to add photos, track views, and manage experiences.</p>
        </div>
      `,
    });
  }

  // resetUrl is built by the caller (AuthService), which is handed the
  // requesting frontend's own origin — the same backend serves both
  // spotly-web and spotly-admin, and each needs the link to land on
  // ITS OWN reset-password page, not a hardcoded one.
  async sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
    return this.send({
      to,
      subject: 'Reset your Spotly password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Reset your password</h1>
          <p>Hi ${escapeHtml(name)}, we got a request to reset your Spotly password. This link expires in 1 hour.</p>
          <p style="margin-top: 24px;">
            <a href="${resetUrl}" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Reset password
            </a>
          </p>
          <p style="margin-top: 24px; font-size: 13px; color: #9E6B4A;">
            Didn't request this? You can safely ignore this email — your password won't change unless you click the link above.
          </p>
        </div>
      `,
    });
  }

  // ---------- Fire-and-forget helpers ----------
  // Other modules (AuthService, BusinessService, AdminEmailService) call
  // these instead of send()/sendWelcomeEmail() directly, so a slow or
  // failing email API call never adds latency to the request that
  // triggered it (signup, business registration). These used to enqueue
  // a BullMQ job; they now dispatch in-process and return immediately.
  // Delivery is best-effort either way — send() already swallows and
  // logs API failures rather than retrying.

  queueWelcomeEmail(to: string, name: string): void {
    runInBackground(this.logger, `welcome-user ${to}`, () =>
      this.sendWelcomeEmail(to, name),
    );
  }

  queueBusinessWelcomeEmail(to: string, businessName: string): void {
    runInBackground(this.logger, `welcome-business ${to}`, () =>
      this.sendBusinessWelcomeEmail(to, businessName),
    );
  }

  queuePasswordResetEmail(to: string, name: string, resetUrl: string): void {
    runInBackground(this.logger, `password-reset ${to}`, () =>
      this.sendPasswordResetEmail(to, name, resetUrl),
    );
  }

  // For general updates/announcements — e.g. a loop calling this once
  // per recipient to broadcast a platform update, since there's no
  // in-app notification system in MVP (BRD Section 19).
  queueGeneralEmail(to: string, subject: string, html: string): void {
    runInBackground(this.logger, `general ${to}`, () =>
      this.send({ to, subject, html }),
    );
  }
}

function escapeHtml(str: string): string {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}
