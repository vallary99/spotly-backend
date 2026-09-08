import { MigrationInterface, QueryRunner } from 'typeorm';

// Separate from subscriptionStatus (billing) — this is about whether a
// business is actually discoverable, which today just means "has an
// approved photo." Backfilled based on that exact condition so this
// migration doesn't retroactively mark long-standing, already-visible
// businesses as PENDING (Val, Sep 2026: businesses without a photo
// should show as pending, then inactive after a month of no photo).
export class AddListingStatusToBusinesses1788300000000
  implements MigrationInterface
{
  name = 'AddListingStatusToBusinesses1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."businesses_listingstatus_enum" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "listingStatus" "public"."businesses_listingstatus_enum" NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "lastPendingReminderAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`
      UPDATE "businesses" SET "listingStatus" = 'ACTIVE'
      WHERE EXISTS (
        SELECT 1 FROM "media"
        WHERE "media"."businessId" = "businesses"."id"
          AND "media"."type" = 'PHOTO'
          AND "media"."status" = 'APPROVED'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" DROP COLUMN "lastPendingReminderAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" DROP COLUMN "listingStatus"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."businesses_listingstatus_enum"`,
    );
  }
}
