import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the per-tier experience add-on price used by PaymentService to
// compute EXPERIENCE_ADDON charges server-side (closing what used to be
// a client-trusted-amount gap, same class of issue the SUBSCRIPTION
// amount fix closed earlier). Column-level default covers Growth/
// Premium correctly; Starter is set explicitly afterward since it
// carries a different, deliberately higher value (see tier-limits.ts).
export class AddExperienceAddonPrice1786520103441 implements MigrationInterface {
  name = 'AddExperienceAddonPrice1786520103441';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tier_configs" ADD "experienceAddonPriceKes" integer NOT NULL DEFAULT 300`,
    );
    await queryRunner.query(
      `UPDATE "tier_configs" SET "experienceAddonPriceKes" = 500 WHERE "tier" = 'STARTER'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tier_configs" DROP COLUMN "experienceAddonPriceKes"`,
    );
  }
}
