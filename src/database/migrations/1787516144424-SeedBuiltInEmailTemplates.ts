import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds a stable `key` lookup column to email_templates (see the entity
// comment) and seeds the 5 built-in templates: the business-live
// welcome email (migrated off its old hardcoded copy in
// EmailService.sendBusinessWelcomeEmail — see that method for the
// fallback if this row's ever deleted), suspension/deactivation
// notices (now actually sent — previously neither fired at all, see
// AdminBusinessService.suspend), and two ready-to-use broadcast
// templates for the existing discount/trial campaign flows.
export class SeedBuiltInEmailTemplates1787516144424 implements MigrationInterface {
  name = 'SeedBuiltInEmailTemplates1787516144424';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_templates" ADD "key" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_templates" ADD CONSTRAINT "UQ_email_templates_key" UNIQUE ("key")`,
    );

    const insert = (key: string, name: string, subject: string, body: string) =>
      queryRunner.query(
        `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
        [key, name, subject, body],
      );

    await insert(
      'WELCOME_BUSINESS',
      'Welcome Email (business live)',
      '{{businessName}} is live on Spotly!',
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} is live!</h1>
  <p>Your business is now discoverable on Spotly. Head to your Business Owner Surface to add photos, track views, and manage experiences.</p>
</div>`,
    );

    await insert(
      'SUSPENSION',
      'Business Suspended',
      'Your Spotly listing for {{businessName}} has been suspended',
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} has been suspended</h1>
  <p>Hi {{ownerName}}, your listing has been hidden from public browse and search on Spotly.</p>
  <p style="background: #FBEFEA; border-radius: 12px; padding: 12px 16px; margin: 16px 0;"><strong>Reason:</strong> {{reason}}</p>
  <p>You can still see and edit your business profile — this isn't a deletion. If you think this was a mistake or want to resolve it, reply to this email and we'll take a look.</p>
</div>`,
    );

    await insert(
      'DEACTIVATION',
      'Business Deactivated',
      'Your Spotly listing for {{businessName}} has been deactivated',
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} has been deactivated</h1>
  <p>Hi {{ownerName}}, your listing has been temporarily hidden from public browse and search on Spotly.</p>
  <p>This is routine, not a penalty — your data and profile are untouched, and this can be reversed any time. If you weren't expecting this or have questions, just reply to this email.</p>
</div>`,
    );

    await insert(
      'DISCOUNT_OFFER',
      'Discount Offer',
      'A discount on your Spotly {{tier}} plan',
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{discountPercent}}% off, on us</h1>
  <p>Hi {{ownerName}}, as a thank-you, {{businessName}} is eligible for {{discountPercent}}% off the {{tier}} plan.</p>
  <p style="margin-top: 24px;">
    <a href="http://localhost:3001/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
      Claim it in your dashboard
    </a>
  </p>
</div>`,
    );

    await insert(
      'FREE_TRIAL_OFFER',
      'Free Trial Offer',
      'Try {{tier}} free on Spotly',
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">Try {{tier}}, on the house</h1>
  <p>Hi {{ownerName}}, {{businessName}} is eligible for a free trial of Spotly's {{tier}} plan — more photos, more videos, and room to host more experiences.</p>
  <p style="margin-top: 24px;">
    <a href="http://localhost:3001/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
      Start your trial
    </a>
  </p>
</div>`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "key" IN ('WELCOME_BUSINESS', 'SUSPENSION', 'DEACTIVATION', 'DISCOUNT_OFFER', 'FREE_TRIAL_OFFER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_templates" DROP CONSTRAINT "UQ_email_templates_key"`,
    );
    await queryRunner.query(`ALTER TABLE "email_templates" DROP COLUMN "key"`);
  }
}
