import { MigrationInterface, QueryRunner } from 'typeorm';

// A promotional deal/offer for a business (Val, Sep 2026) — deliberately
// separate from experiences (see the Offer entity's own comment).
// Available to Venue and Made in Kenya businesses only, not Experience
// Host. "Is this active" is computed at query time from the dates, not
// a stored flag — no sweep dependency for this feature at all.
export class AddOffers1789100000000 implements MigrationInterface {
  name = 'AddOffers1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."offers_scheduletype_enum" AS ENUM('SINGLE_DAY', 'DATE_RANGE', 'WEEKLY')`,
    );
    await queryRunner.query(`
      CREATE TABLE "offers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "businessId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "scheduleType" "public"."offers_scheduletype_enum" NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date,
        "daysOfWeek" text[] NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_offers_businessId" ON "offers" ("businessId")`);
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "FK_offers_business" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "offers"`);
    await queryRunner.query(`DROP TYPE "public"."offers_scheduletype_enum"`);
  }
}
