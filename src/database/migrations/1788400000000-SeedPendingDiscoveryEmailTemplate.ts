import { MigrationInterface, QueryRunner } from 'typeorm';

// Fired every 7 days for a business still without a photo (up to 4
// times over a month, then it goes INACTIVE instead) — see
// ListingLifecycleService.sweepPendingListings (Val, Sep 2026).
export class SeedPendingDiscoveryEmailTemplate1788400000000
  implements MigrationInterface
{
  name = 'SeedPendingDiscoveryEmailTemplate1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'PENDING_DISCOVERY',
        'Pending Discovery Reminder',
        "{{businessName}} isn't showing up on Spotly yet",
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">One photo away from being discovered</h1>
  <p>Hi {{ownerName}},</p>
  <p>{{businessName}} is set up on Spotly, but it still isn't visible to people browsing the app —
  that just needs one photo. Add it whenever you're ready and your business goes live right away.</p>
  <p>Best,<br />The Spotly Team</p>
</div>`,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "key" = 'PENDING_DISCOVERY'`,
    );
  }
}
