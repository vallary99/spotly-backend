import { MigrationInterface, QueryRunner } from 'typeorm';

// Updates the new package pricing/limits (Free/Featured/Premium). Note
// that tier-limits.ts's TIER_LIMITS constant is ONLY the one-time seed
// for a fresh, empty tier_configs table (see TierConfigService) — a
// database that's already been running has real rows there already, so
// changing that constant alone has no effect until this migration
// updates them directly, same pattern as AddExperienceAddonPrice before
// it.
export class UpdateTierPackages1787417935853 implements MigrationInterface {
  name = 'UpdateTierPackages1787417935853';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tier_configs" SET "videoMaxSeconds" = 15 WHERE "tier" = 'STARTER'`,
    );
    await queryRunner.query(
      `UPDATE "tier_configs" SET
        "priceKes" = 1500,
        "photos" = 15,
        "videos" = 2,
        "videoMaxSeconds" = 60,
        "monthlyExperiencesIncluded" = 5,
        "extraFeatures" = ARRAY['Occasional homepage featuring']
       WHERE "tier" = 'GROWTH'`,
    );
    await queryRunner.query(
      `UPDATE "tier_configs" SET
        "priceKes" = 3000,
        "photos" = 30,
        "videos" = 5,
        "videoMaxSeconds" = 90,
        "concurrentExperiences" = 10,
        "extraFeatures" = ARRAY['Priority search placement', 'Occasional homepage featuring', 'Featured on Spotly social media']
       WHERE "tier" = 'PREMIUM'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tier_configs" SET "videoMaxSeconds" = 60 WHERE "tier" = 'STARTER'`,
    );
    await queryRunner.query(
      `UPDATE "tier_configs" SET
        "priceKes" = 1500,
        "photos" = 20,
        "videos" = 3,
        "videoMaxSeconds" = 60,
        "monthlyExperiencesIncluded" = 3,
        "extraFeatures" = ARRAY['Basic business profile', 'Standard discovery']
       WHERE "tier" = 'GROWTH'`,
    );
    await queryRunner.query(
      `UPDATE "tier_configs" SET
        "priceKes" = 4500,
        "photos" = 100,
        "videos" = 50,
        "videoMaxSeconds" = 90,
        "concurrentExperiences" = 10,
        "extraFeatures" = ARRAY['Featured business profile', 'Priority discovery']
       WHERE "tier" = 'PREMIUM'`,
    );
  }
}
