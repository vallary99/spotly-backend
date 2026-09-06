import { MigrationInterface, QueryRunner } from 'typeorm';

// A newly created business has zero photos yet — they're added in a
// separate dashboard step, never at creation itself — which meant the
// existing WELCOME_BUSINESS template ("{{businessName}} is live on
// Spotly!") was firing at exactly the moment that was least true: the
// business has no photo yet and genuinely isn't visible to public
// discovery (Val, Sep 2026). This template replaces it AT CREATION
// TIME specifically; WELCOME_BUSINESS now instead fires once a
// business's first photo is actually approved (see
// MediaService.submitForQualityCheck) — that's the moment it's
// actually true.
export class SeedNeedsPhotoEmailTemplate1787800000000
  implements MigrationInterface
{
  name = 'SeedNeedsPhotoEmailTemplate1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'WELCOME_NEEDS_PHOTO',
        'Welcome Email (needs a photo)',
        'Welcome to Spotly! 📍',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">Welcome to Spotly! 📍</h1>
  <p>Hello,</p>
  <p>Welcome to Spotly! We're excited to have {{businessName}} on board. 🎉</p>
  <p>Your business profile has been created. There's just one quick step left: upload at least one image to your profile so your business can be discovered on Spotly.</p>
  <p>Thank you for joining us!</p>
  <p>Best,<br />The Spotly Team</p>
</div>`,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "key" = 'WELCOME_NEEDS_PHOTO'`,
    );
  }
}
