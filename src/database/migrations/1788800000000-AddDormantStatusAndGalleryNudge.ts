import { MigrationInterface, QueryRunner } from 'typeorm';

// Three additions (Val, Sep 2026):
// 1. DORMANT joins PENDING/ACTIVE/INACTIVE on listingStatus — a
//    business that's discoverable (has a photo, unlike INACTIVE) but
//    meaningfully underusing its free-tier allowance.
// 2. businesses.galleryNudgeSentAt — tracks the one-time nudge so the
//    sweep knows when the follow-up window has elapsed, and so a
//    business that later grows its gallery can cleanly reset.
// 3. WELCOME_USER (bringing the general signup email — previously
//    hardcoded, not admin-editable like everything else — into the
//    same template system) and GALLERY_NUDGE (the new one-time nudge
//    itself), both logged to Send History like every other automatic
//    email in this app.
export class AddDormantStatusAndGalleryNudge1788800000000
  implements MigrationInterface
{
  name = 'AddDormantStatusAndGalleryNudge1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safe to run inside a transaction as of Postgres 12+ as long as
    // the new value isn't used within the same transaction, which it
    // isn't here.
    await queryRunner.query(
      `ALTER TYPE "public"."businesses_listingstatus_enum" ADD VALUE 'DORMANT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "galleryNudgeSentAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'WELCOME_USER',
        'Welcome (New User)',
        'Welcome to Spotly!',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">Welcome to Spotly, {{name}}!</h1>
  <p>You're in. Start exploring Nairobi's first 200 businesses — save your favorites,
  leave reviews, and find your next spot.</p>
  <p style="margin-top: 24px;">
    <a href="https://spotly.co.ke" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
      Start exploring
    </a>
  </p>
</div>`,
      ],
    );

    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'GALLERY_NUDGE',
        'Gallery Nudge',
        "You've got more room to grow {{businessName}}'s listing",
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">Your gallery has more room to grow</h1>
  <p>Hi {{ownerName}}, {{businessName}} is live on Spotly with {{currentCount}} of {{maxCount}} photos used.</p>
  <p>Businesses with a fuller gallery tend to get more views and saves — it only takes a
  couple of minutes to add more from your dashboard.</p>
  <p style="margin-top: 24px;">
    <a href="https://spotly.co.ke/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
      Add more photos
    </a>
  </p>
</div>`,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "key" = 'GALLERY_NUDGE'`);
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "key" = 'WELCOME_USER'`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "galleryNudgeSentAt"`);
    // Postgres has no ALTER TYPE ... DROP VALUE — removing DORMANT
    // cleanly requires recreating the enum type from scratch (and
    // reassigning every column that uses it), which isn't safe to do
    // automatically in a down migration. If this migration is ever
    // reverted, that step needs doing by hand.
  }
}
