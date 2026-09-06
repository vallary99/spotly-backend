import { MigrationInterface, QueryRunner } from 'typeorm';

// Updates the WELCOME_BUSINESS row seeded back in
// SeedBuiltInEmailTemplates rather than editing that migration in
// place — it may already have run against production, and migrations
// that already ran are treated as immutable history here; a content
// change gets its own migration instead (Val, Sep 2026).
export class UpdateWelcomeBusinessEmailCopy1787900000000
  implements MigrationInterface
{
  name = 'UpdateWelcomeBusinessEmailCopy1787900000000';

  private readonly newSubject = '{{businessName}} is now live on Spotly! 🎉';
  private readonly newBody = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} is now live on Spotly! 🎉</h1>
  <p>Your business is now visible for discovery on Spotly! 🎉 We're so excited to have you join the Spotly community.</p>
  <p>You can also see how many people visit and save your business profile directly from your dashboard.</p>
  <p>We're happy to have you with us and look forward to helping more people discover your business. 📍</p>
  <p>Best,<br />The Spotly Team</p>
</div>`;

  private readonly oldSubject = '{{businessName}} is live on Spotly!';
  private readonly oldBody = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">{{businessName}} is live!</h1>
  <p>Your business is now discoverable on Spotly. Head to your Business Owner Surface to add photos, track views, and manage experiences.</p>
</div>`;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only overwrites if the content still matches what was originally
    // seeded — if someone's already customized this via the admin
    // panel's Email Templates page since then, this migration leaves
    // their edit alone rather than silently clobbering it.
    await queryRunner.query(
      `UPDATE "email_templates" SET "subject" = $1, "body" = $2 WHERE "key" = 'WELCOME_BUSINESS' AND "subject" = $3 AND "body" = $4`,
      [this.newSubject, this.newBody, this.oldSubject, this.oldBody],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "email_templates" SET "subject" = $1, "body" = $2 WHERE "key" = 'WELCOME_BUSINESS'`,
      [this.oldSubject, this.oldBody],
    );
  }
}
