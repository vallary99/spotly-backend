import { MigrationInterface, QueryRunner } from 'typeorm';

// Restructures the notification templates per Val (Sep 2026): timelined
// and indefinite suspensions are still both just suspensions, so
// DEACTIVATION is retired and SUSPENSION's copy is made dynamic enough
// to cover both cases on its own (a reason block and an "until" block
// that are simply blank when not applicable, rather than two separate
// templates with near-identical copy). Adds REACTIVATION, the email
// that was missing entirely for when a suspension is lifted. Adds
// OUTREACH as a real, persistent, admin-editable template — previously
// this content lived only inline in the admin panel's one-off compose
// flow, with no way to save or refine it between sends.
export class RestructureSuspensionAndOutreachTemplates1788600000000
  implements MigrationInterface
{
  name = 'RestructureSuspensionAndOutreachTemplates1788600000000';

  private readonly oldSuspensionBody = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} has been suspended</h1>
  <p>Hi {{ownerName}}, your listing has been hidden from public browse and search on Spotly.</p>
  <p style="background: #FBEFEA; border-radius: 12px; padding: 12px 16px; margin: 16px 0;"><strong>Reason:</strong> {{reason}}</p>
  <p>You can still see and edit your business profile — this isn't a deletion. If you think this was a mistake or want to resolve it, reply to this email and we'll take a look.</p>
</div>`;

  private readonly newSuspensionBody = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} has been suspended</h1>
  <p>Hi {{ownerName}}, your listing has been hidden from public browse and search on Spotly.</p>
  {{reasonBlock}}
  {{untilBlock}}
  <p>You can still see and edit your business profile — this isn't a deletion. If you think this was a mistake or want to resolve it, reply to this email and we'll take a look.</p>
</div>`;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1 WHERE "key" = 'SUSPENSION' AND "body" = $2`,
      [this.newSuspensionBody, this.oldSuspensionBody],
    );

    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "key" = 'DEACTIVATION'`,
    );

    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'REACTIVATION',
        'Business Reactivated',
        '{{businessName}} is visible on Spotly again',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} is back</h1>
  <p>Hi {{ownerName}}, your listing is visible again in public browse and search on Spotly — thanks for your patience.</p>
</div>`,
      ],
    );

    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'OUTREACH',
        'Outreach',
        'A quick idea for your business',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">Let's get you discovered on Spotly</h1>
  <p>Hello,</p>
  <p>Spotly is a discovery platform helping people find great places, experiences and events around Nairobi — and we think you'd be a great fit.</p>
  <p>You'll be able to create your listing, showcase your business with photos and videos, and track how many people view and save your listing through your dashboard.</p>
  <p>Getting listed takes less than 10 minutes through our simple self-onboarding process.</p>
  <p>If you're interested, just reply to this email.</p>
  <p>🌐 spotly.co.ke</p>
  <p>Regards,<br />The Spotly Team</p>
</div>`,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "key" = 'OUTREACH'`);
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "key" = 'REACTIVATION'`);
    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'DEACTIVATION',
        'Business Deactivated',
        '{{businessName}} has been deactivated',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} has been deactivated</h1>
  <p>Hi {{ownerName}}, your listing has been temporarily hidden from public browse and search on Spotly.</p>
  <p>This is routine, not a penalty — your data and profile are untouched, and this can be reversed any time. If you weren't expecting this or have questions, just reply to this email.</p>
</div>`,
      ],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1 WHERE "key" = 'SUSPENSION' AND "body" = $2`,
      [this.oldSuspensionBody, this.newSuspensionBody],
    );
  }
}
