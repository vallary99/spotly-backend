import { MigrationInterface, QueryRunner } from 'typeorm';

// Two independent pieces, bundled into one migration since they're both
// small, Sep 2026 product decisions:
//
// 1. A generic system_config key/value table (see SystemConfigService),
//    seeded with the admin-configurable "max categories per business"
//    cap (default 5, per Val: "cap at 5 for now but make it
//    configurable by admin").
//
// 2. A backfill for the earlier AddCategoriesAndFiltersPhase1 migration,
//    which flagged the first 100 businesses `firstCohortPremiumTrial =
//    true` but never actually granted them a trial OFFER
//    (trialOfferTier/trialOfferDays) — so the flag existed with nothing
//    for the owner to activate. BusinessService.create() now sets both
//    together for every new first-100 business going forward; this
//    catches whichever ones were already in the DB before that code
//    shipped. Only businesses that haven't already used/lost the offer
//    (no tier set, not currently trialing) are touched, so this can't
//    clobber a real, already-in-progress or already-converted account.
export class SystemConfigAndCohortBackfill1787600000000 implements MigrationInterface {
  name = 'SystemConfigAndCohortBackfill1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "system_config" ("key" character varying NOT NULL, "value" text NOT NULL, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_system_config_key" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `INSERT INTO "system_config" ("key", "value") VALUES ('maxCategoriesPerBusiness', '5') ON CONFLICT DO NOTHING`,
    );

    await queryRunner.query(
      `UPDATE "businesses" SET "trialOfferTier" = 'PREMIUM', "trialOfferDays" = 30
       WHERE "firstCohortPremiumTrial" = true
         AND "trialOfferTier" IS NULL
         AND "isTrialing" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "system_config"`);
    // Deliberately not reverting the trialOfferTier/Days backfill — an
    // owner may have already seen and be relying on that offer by the
    // time anyone runs `down`, and un-granting it out from under them
    // would be a worse outcome than leaving a harmless extra offer in
    // place on rollback.
  }
}
