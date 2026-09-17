import { MigrationInterface, QueryRunner } from 'typeorm';

// Two related fixes discovered investigating Experience Hosts (Val, Sep
// 2026): a successful SUBSCRIPTION payment never actually changed
// business.tier (targetTier was used to price the charge, then
// discarded — nothing carried it to resolution), and a successful
// EXPERIENCE_ADDON payment had nothing to grant at all (the tier config
// already priced this — experienceAddonPriceKes — but it was never
// wired to anything, which is the direct cause of a Starter-tier
// Experience Host having no way to create an experience, paid or not).
export class AddTargetTierAndExperienceAddonCredit1789300000000
  implements MigrationInterface
{
  name = 'AddTargetTierAndExperienceAddonCredit1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A dedicated enum type, matching TypeORM's own per-column naming
    // convention — businesses.tier and businesses.trialOfferTier each
    // already have their own separate Postgres enum type despite
    // sharing the same TypeScript enum, so payments.targetTier gets
    // its own too rather than incorrectly reusing businesses_tier_enum.
    await queryRunner.query(
      `CREATE TYPE "public"."payments_targettier_enum" AS ENUM('STARTER', 'GROWTH', 'PREMIUM')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "targetTier" "public"."payments_targettier_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "paidExperienceAddonsAvailable" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "paidExperienceAddonsAvailable"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "targetTier"`);
    await queryRunner.query(`DROP TYPE "public"."payments_targettier_enum"`);
  }
}
