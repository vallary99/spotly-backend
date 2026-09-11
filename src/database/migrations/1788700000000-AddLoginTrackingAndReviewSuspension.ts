import { MigrationInterface, QueryRunner } from 'typeorm';

// Three additions for the admin panel's new business detail view (Val,
// Sep 2026): users.lastLoginAt (stamped on every token issuance, see
// AuthService.issueToken), users.reviewsSuspended (platform-wide
// review-posting restriction, distinct from a full account
// suspension), and businesses.wentLiveAt (the moment listingStatus
// first became ACTIVE, distinct from createdAt).
export class AddLoginTrackingAndReviewSuspension1788700000000
  implements MigrationInterface
{
  name = 'AddLoginTrackingAndReviewSuspension1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "lastLoginAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "reviewsSuspended" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "wentLiveAt" TIMESTAMP WITH TIME ZONE`,
    );
    // Backfill: any business already ACTIVE clearly went live at some
    // point before now — createdAt is the best available approximation
    // for existing businesses (the real, precise moment wasn't
    // recorded before this migration), rather than leaving it null and
    // making an already-live business look like it never went live.
    await queryRunner.query(`
      UPDATE "businesses" SET "wentLiveAt" = "createdAt"
      WHERE "listingStatus" = 'ACTIVE' AND "wentLiveAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "wentLiveAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "reviewsSuspended"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLoginAt"`);
  }
}
