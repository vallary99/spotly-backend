import { MigrationInterface, QueryRunner } from 'typeorm';

// Companion to profileViews/savesCount — a share button click is now
// tracked the same way (Val, Sep 2026: "add shares on that row").
// These three fields also switched from a rolling 30-day window to
// lifetime totals in this same round, but that's a pure application-
// logic change (UsageService.sweepRollingCounters) with no schema
// impact — nothing to migrate for that part.
export class AddSharesCountToBusinesses1789000000000
  implements MigrationInterface
{
  name = 'AddSharesCountToBusinesses1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "sharesCount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "sharesCount"`);
  }
}
