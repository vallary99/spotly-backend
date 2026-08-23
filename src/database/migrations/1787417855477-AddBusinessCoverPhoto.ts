import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets a business owner pick which of their own approved photos leads
// their card/homepage thumbnail (see BusinessService.setCoverPhoto),
// instead of always defaulting to whichever photo happened to be
// uploaded first. Nullable, no default — null means "no explicit
// choice made," which BusinessService.attachRatingsAndStripMetrics
// already treats identically to how every business behaved before
// this column existed (oldest approved photo first).
export class AddBusinessCoverPhoto1787417855477 implements MigrationInterface {
  name = 'AddBusinessCoverPhoto1787417855477';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "coverMediaId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" DROP COLUMN "coverMediaId"`,
    );
  }
}
