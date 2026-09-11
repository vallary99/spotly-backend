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
    businessId: string | null;
    businessName: string | null;
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
          businessIds: params.businessId ? [params.businessId] : [],
          sentByAdminId: null,
        }),
      );
    } catch (err) {
      // Logging failure should never take down the email send itself —
      // same "best-effort" posture as send()'s own error handling below.
      this.logger.warn(`Failed to write send log for ${params.templateName}: ${err}`);
    }
  }

  // Fired on every regular signup (see AuthService.signup). Was
  // hardcoded here rather than a real, admin-editable template like
  // everything else in this file until now — the one inconsistency
  // Val spotted (Sep 2026) when asking whether new users get a welcome
  // email at all. Also fixes a hardcoded localhost link found while
  // migrating it.
  async sendWelcomeEmail(to: string, name: string) {
    const rendered = await this.renderBuiltIn('WELCOME_USER', { name });
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? 'Welcome to Spotly!';
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Welcome to Spotly, ${escapeHtml(name)}!</h1>
          <p>You're in. Start exploring Nairobi's first 200 businesses — save your favorites,
          leave reviews, and find your next spot.</p>
          <p style="margin-top: 24px;">
            <a href="https://spotly.co.ke" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Start exploring
            </a>
          </p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({ templateId, templateName: 'Welcome (New User)', subject, businessId: null, businessName: null });
    return result;
  }

  // Fired once by ListingLifecycleService.sweepUnderusedGalleries, two
  // weeks after a Starter business goes live, if it's still under half
  // its tier's photo allowance (Val, Sep 2026). Starter only — a paid
  // business already knows why it's paying and doesn't need a usage
  // nudge.
  async sendGalleryNudgeEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    currentCount: number,
    maxCount: number,
  ) {
    const vars = { ownerName, businessName, currentCount: String(currentCount), maxCount: String(maxCount) };
    const rendered = await this.renderBuiltIn('GALLERY_NUDGE', vars);
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `You've got more room to grow ${businessName}'s listing`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Your gallery has more room to grow</h1>
          <p>Hi ${escapeHtml(ownerName)}, ${escapeHtml(businessName)} is live on Spotly with
          ${currentCount} of ${maxCount} photos used.</p>
          <p>Businesses with a fuller gallery tend to get more views and saves — it only takes a
          couple of minutes to add more from your dashboard.</p>
          <p style="margin-top: 24px;">
            <a href="https://spotly.co.ke/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Add more photos
            </a>
          </p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({ templateId, templateName: 'Gallery Nudge', subject, businessId, businessName });
    return result;
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

  // Fired from AdminBusinessService.suspend() — timelined and
  // indefinite suspensions are both just suspensions (Val, Sep 2026),
  // so this one template covers both: reason and until are each
  // rendered as their own optional block, blank when not given, rather
  // than needing two near-identical templates (SUSPENSION vs the old
  // DEACTIVATION) to cover a distinction that was really just "was a
  // reason/end-date supplied," not a different kind of email. Logged
  // the same way the other automatic sends are, which this one wasn't
  // doing before despite already being action-triggered.
  async sendSuspensionEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    reason?: string,
    until?: Date | null,
  ) {
    const reasonBlock = reason
      ? `<p style="background: #FBEFEA; border-radius: 12px; padding: 12px 16px; margin: 16px 0;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`
      : '';
    const untilBlock = until
      ? `<p>This is in effect until ${until.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`
      : '';
    const vars = { ownerName, businessName, reasonBlock, untilBlock };
    const rendered = await this.renderBuiltIn('SUSPENSION', vars);
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `Your Spotly listing for ${businessName} has been suspended`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">${escapeHtml(businessName)} has been suspended</h1>
          <p>Hi ${escapeHtml(ownerName)}, your listing has been hidden from public browse and search on Spotly.</p>
          ${reasonBlock}
          ${untilBlock}
          <p>You can still see and edit your business profile — this isn't a deletion. If you think this
          was a mistake or want to resolve it, reply to this email and we'll take a look.</p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({ templateId, templateName: 'Business Suspended', subject, businessId, businessName });
    return result;
  }

  // Fired from AdminBusinessService.unsuspend() — previously this
  // action sent no notification at all, so a business owner would only
  // find out they'd been reinstated by happening to check their
  // dashboard (Val, Sep 2026: "we should have suspension and
  // reactivation templates").
  async sendReactivationEmail(to: string, ownerName: string, businessName: string, businessId: string) {
    const rendered = await this.renderBuiltIn('REACTIVATION', { ownerName, businessName });
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `${businessName} is visible on Spotly again`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">${escapeHtml(businessName)} is back</h1>
          <p>Hi ${escapeHtml(ownerName)}, your listing is visible again in public browse and search on
          Spotly — thanks for your patience.</p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({ templateId, templateName: 'Business Reactivated', subject, businessId, businessName });
    return result;
  }

  // Fired every 7 days (up to 4 times) by
  // ListingLifecycleService.sweepPendingListings for a business that
  // still hasn't uploaded a photo — logged the same way the two welcome
  // emails are (Val, Sep 2026's earlier "the automatic email should
  // also be part of the logs"), since this is exactly that same kind
  // of system-triggered send.
  async sendPendingDiscoveryEmail(to: string, ownerName: string, businessName: string, businessId: string) {
    const rendered = await this.renderBuiltIn('PENDING_DISCOVERY', { ownerName, businessName });
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `${businessName} isn't showing up on Spotly yet`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">One photo away from being discovered</h1>
          <p>Hi ${escapeHtml(ownerName)},</p>
          <p>${escapeHtml(businessName)} is set up on Spotly, but it still isn't visible to people
          browsing the app — that just needs one photo. Add it whenever you're ready and your
          business goes live right away.</p>
          <p>Best,<br />The Spotly Team</p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({
      templateId,
      templateName: 'Pending Discovery Reminder',
      subject,
      businessId,
      businessName,
    });
    return result;
  }

  // Fired automatically the moment a discount is actually granted —
  // whether via the broadcast discount campaign or a single-business
  // grant (see AdminBusinessService) — rather than needing an admin to
  // separately, manually broadcast this template afterward. That
  // manual path used to be the only way this template ever went out,
  // which meant it was easy to forget, and rendering it against a
  // business that was never actually granted a discount would show
  // "0% off" (Val, Sep 2026: "this means the send functionality... will
  // be useless because these emails are prompted by actions" — right,
  // which is why the generic Send button is now hidden for this
  // template in the admin panel; see app/emails/page.tsx).
  async sendDiscountOfferEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    discountPercent: number,
    tier: string,
  ) {
    const vars = { ownerName, businessName, discountPercent: String(discountPercent), tier };
    const rendered = await this.renderBuiltIn('DISCOUNT_OFFER', vars);
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `A discount on your Spotly ${tier} plan`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">${discountPercent}% off, on us</h1>
          <p>Hi ${escapeHtml(ownerName)}, as a thank-you, ${escapeHtml(businessName)} is eligible for
          ${discountPercent}% off the ${escapeHtml(tier)} plan.</p>
          <p style="margin-top: 24px;">
            <a href="https://spotly.co.ke/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Claim it in your dashboard
            </a>
          </p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({ templateId, templateName: 'Discount Offer', subject, businessId, businessName });
    return result;
  }

  // Same reasoning as sendDiscountOfferEmail above, for the free-trial
  // equivalent.
  async sendFreeTrialOfferEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    tier: string,
    days: number,
  ) {
    const vars = { ownerName, businessName, tier, days: String(days) };
    const rendered = await this.renderBuiltIn('FREE_TRIAL_OFFER', vars);
    const templateId = rendered?.id ?? null;
    const subject = rendered?.subject ?? `Try ${tier} free on Spotly`;
    const html =
      rendered?.html ??
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Try ${escapeHtml(tier)}, on the house</h1>
          <p>Hi ${escapeHtml(ownerName)}, ${escapeHtml(businessName)} is eligible for a free
          ${days}-day trial of Spotly's ${escapeHtml(tier)} plan — more photos, more videos, and
          room to host more experiences.</p>
          <p style="margin-top: 24px;">
            <a href="https://spotly.co.ke/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Start your trial
            </a>
          </p>
        </div>
      `;
    const result = await this.send({ to, subject, html });
    await this.logAutomaticSend({ templateId, templateName: 'Free Trial Offer', subject, businessId, businessName });
    return result;
  }


  // requesting frontend's own origin — the same backend serves both
  // spotly-web and spotly-admin, and each needs the link to land on
  // ITS OWN reset-password page, not a hardcoded one.
  // Not admin-editable via the template system, same reasoning as
  // sendPasswordResetEmail below — this is a security-adjacent, correct-
  // by-construction flow, not marketing/announcement copy; keeping it
  // hardcoded means an admin can't accidentally break the verification
  // link by editing a template.
  async sendVerificationEmail(to: string, name: string, verifyUrl: string) {
    return this.send({
      to,
      subject: 'Verify your email for Spotly',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
          <h1 style="color: #7A3C2C; font-size: 22px;">Verify your email</h1>
          <p>Hi ${escapeHtml(name)}, one quick step to finish setting up your Spotly account — confirm this is really your email address. This link expires in 24 hours.</p>
          <p style="margin-top: 24px;">
            <a href="${verifyUrl}" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
              Verify email
            </a>
          </p>
          <p style="margin-top: 24px; font-size: 13px; color: #9E6B4A;">
            Didn't create a Spotly account? You can safely ignore this email.
          </p>
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

  queueGalleryNudgeEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    currentCount: number,
    maxCount: number,
  ): void {
    runInBackground(this.logger, `gallery-nudge ${to}`, () =>
      this.sendGalleryNudgeEmail(to, ownerName, businessName, businessId, currentCount, maxCount),
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

  queueSuspensionEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    reason?: string,
    until?: Date | null,
  ): void {
    runInBackground(this.logger, `suspension ${to}`, () =>
      this.sendSuspensionEmail(to, ownerName, businessName, businessId, reason, until),
    );
  }

  queueReactivationEmail(to: string, ownerName: string, businessName: string, businessId: string): void {
    runInBackground(this.logger, `reactivation ${to}`, () =>
      this.sendReactivationEmail(to, ownerName, businessName, businessId),
    );
  }

  queuePendingDiscoveryEmail(to: string, ownerName: string, businessName: string, businessId: string): void {
    runInBackground(this.logger, `pending-discovery ${to}`, () =>
      this.sendPendingDiscoveryEmail(to, ownerName, businessName, businessId),
    );
  }

  queueDiscountOfferEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    discountPercent: number,
    tier: string,
  ): void {
    runInBackground(this.logger, `discount-offer ${to}`, () =>
      this.sendDiscountOfferEmail(to, ownerName, businessName, businessId, discountPercent, tier),
    );
  }

  queueFreeTrialOfferEmail(
    to: string,
    ownerName: string,
    businessName: string,
    businessId: string,
    tier: string,
    days: number,
  ): void {
    runInBackground(this.logger, `trial-offer ${to}`, () =>
      this.sendFreeTrialOfferEmail(to, ownerName, businessName, businessId, tier, days),
    );
  }

  queuePasswordResetEmail(to: string, name: string, resetUrl: string): void {
    runInBackground(this.logger, `password-reset ${to}`, () =>
      this.sendPasswordResetEmail(to, name, resetUrl),
    );
  }

  queueVerificationEmail(to: string, name: string, verifyUrl: string): void {
    runInBackground(this.logger, `email-verification ${to}`, () =>
      this.sendVerificationEmail(to, name, verifyUrl),
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
