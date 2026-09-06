import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resend } from 'resend';
import { runInBackground } from '../common/utils/background.util';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailSendLog } from './entities/email-send-log.entity';

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

  constructor(
    private config: ConfigService,
    @InjectRepository(EmailTemplate) private templates: Repository<EmailTemplate>,
    @InjectRepository(EmailSendLog) private sendLogs: Repository<EmailSendLog>,
  ) {
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

  // Looks up one of the 5 built-in templates by its stable `key` (see
  // EmailTemplate entity) and renders {{var}} placeholders against the
  // given values. Returns null if the row's missing (deleted, or the
  // seed migration hasn't run yet) — every call site below falls back
  // to a hardcoded copy in that case, so email sending never breaks
  // just because the DB template is absent, same defensive posture as
  // TierConfigService.getLimits' fallback to TIER_LIMITS.
  private async renderBuiltIn(
    key: string,
    vars: Record<string, string>,
  ): Promise<{ id: string; subject: string; html: string } | null> {
    const row = await this.templates.findOne({ where: { key } });
    if (!row) return null;
    const render = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
    return { id: row.id, subject: render(row.subject), html: render(row.body) };
  }

  // Gives the two automatic welcome emails an entry in the same Send
  // History table AdminEmailService's broadcasts already write to
  // (Val, Sep 2026: "can you confirm the automatic email will also be
  // part of the logs?" — it wasn't, this is what adds it).
  // sentByAdminId is always null here — that's specifically what tells
  // the admin panel to show "System" instead of an admin's name for
  // this row.
  private async logAutomaticSend(params: {
    templateId: string | null;
    templateName: string;
    subject: string;
    businessId: string;
    businessName: string;
  }) {
    try {
      await this.sendLogs.save(
        this.sendLogs.create({
          templateId: params.templateId,
          templateName: params.templateName,
          subject: params.subject,
          businessId: params.businessId,
          businessName: params.businessName,
          filters: {},
          recipientCount: 1,
          businessIds: [params.businessId],
          sentByAdminId: null,
        }),
      );
    } catch (err) {
      // Logging failure should never take down the email send itself —
      // same "best-effort" posture as send()'s own error handling below.
      this.logger.warn(`Failed to write send log for ${params.templateName}: ${err}`);
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

  // Admin-editable via the "Welcome Email (needs a photo)" built-in
  // template — falls back to this hardcoded copy if that row's ever
  // missing. Fires at business creation, replacing the old always-fires
  // sendBusinessWelcomeEmail call there — a brand new business has zero
  // photos and genuinely isn't visible to public discovery yet, so
  // saying "is live" at that exact moment was never accurate (Val, Sep
  // 2026). sendBusinessWelcomeEmail now fires later instead, once a
  // business's first photo is actually approved — see
  // MediaService.submitForQualityCheck.
  async sendBusinessNeedsPhotoEmail(to: string, businessName: string, businessId: string) {
    const rendered = await this.renderBuiltIn('WELCOME_NEEDS_PHOTO', { businessName });
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? 'Welcome to Spotly! 📍';
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Welcome to Spotly! 📍</h1>
          <p>Hello,</p>
          <p>Welcome to Spotly! We're excited to have ${escapeHtml(businessName)} on board. 🎉</p>
          <p>Your business profile has been created. There's just one quick step left: upload at
          least one image to your profile so your business can be discovered on Spotly.</p>
          <p>Thank you for joining us!</p>
          <p>Best,<br />The Spotly Team</p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({
      templateId,
      templateName: 'Welcome Email (needs a photo)',
      subject,
      businessId,
      businessName,
    });
    return result;
  }

  // Admin-editable via the "Welcome Email" built-in template (see
  // spotly-admin's Email Templates page) — falls back to this
  // hardcoded copy if that row's ever missing, so registration/business
  // approval never breaks over an email-content edit gone wrong.
  async sendBusinessWelcomeEmail(to: string, businessName: string, businessId: string) {
    const rendered = await this.renderBuiltIn('WELCOME_BUSINESS', { businessName });
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `${businessName} is now live on Spotly! 🎉`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">${escapeHtml(businessName)} is now live on Spotly! 🎉</h1>
          <p>Your business is now visible for discovery on Spotly! 🎉 We're so excited to have you
          join the Spotly community.</p>
          <p>You can also see how many people visit and save your business profile directly from
          your dashboard.</p>
          <p>We're happy to have you with us and look forward to helping more people discover your
          business. 📍</p>
          <p>Best,<br />The Spotly Team</p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({
      templateId,
      templateName: 'Welcome Email (business live)',
      subject,
      businessId,
      businessName,
    });
    return result;
  }

  // Fired from AdminBusinessService.suspend() when an admin gives an
  // actual reason — a real policy-violation suspension, not a routine
  // deactivation (see sendDeactivationEmail below for that lighter
  // case). Silently does nothing if the built-in template's missing —
  // an admin action shouldn't throw just because a notification email
  // couldn't be composed.
  async sendSuspensionEmail(to: string, ownerName: string, businessName: string, reason: string) {
    const rendered = await this.renderBuiltIn('SUSPENSION', { ownerName, businessName, reason });
    if (!rendered) {
      this.logger.warn(`SUSPENSION built-in template missing — no email sent to ${to}.`);
      return { simulated: true };
    }
    return this.send({ to, ...rendered });
  }

  // Fired from AdminBusinessService.suspend() when no reason was given
  // — the admin dashboard's one-click "Deactivate" action. Same
  // fallback posture as sendSuspensionEmail.
  async sendDeactivationEmail(to: string, ownerName: string, businessName: string) {
    const rendered = await this.renderBuiltIn('DEACTIVATION', { ownerName, businessName });
    if (!rendered) {
      this.logger.warn(`DEACTIVATION built-in template missing — no email sent to ${to}.`);
      return { simulated: true };
    }
    return this.send({ to, ...rendered });
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

  queueBusinessWelcomeEmail(to: string, businessName: string, businessId: string): void {
    runInBackground(this.logger, `welcome-business ${to}`, () =>
      this.sendBusinessWelcomeEmail(to, businessName, businessId),
    );
  }

  queueBusinessNeedsPhotoEmail(to: string, businessName: string, businessId: string): void {
    runInBackground(this.logger, `welcome-business-needs-photo ${to}`, () =>
      this.sendBusinessNeedsPhotoEmail(to, businessName, businessId),
    );
  }

  queueSuspensionEmail(to: string, ownerName: string, businessName: string, reason: string): void {
    runInBackground(this.logger, `suspension ${to}`, () =>
      this.sendSuspensionEmail(to, ownerName, businessName, reason),
    );
  }

  queueDeactivationEmail(to: string, ownerName: string, businessName: string): void {
    runInBackground(this.logger, `deactivation ${to}`, () =>
      this.sendDeactivationEmail(to, ownerName, businessName),
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
