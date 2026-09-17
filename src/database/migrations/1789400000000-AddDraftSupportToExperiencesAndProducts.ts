import { MigrationInterface, QueryRunner } from 'typeorm';

// Val, Sep 2026: "Add option to save experience draft and catalogue
// drafts." A genuine reversal of Experience's earlier "every field
// deliberately required" design (see CreateExperienceDto's own
// comment) — a draft skips full validation and the tier limit
// entirely, and never appears in any public query until explicitly
// published.
export class AddDraftSupportToExperiencesAndProducts1789400000000
  implements MigrationInterface
{
  name = 'AddDraftSupportToExperiencesAndProducts1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "experiences" ALTER COLUMN "startsAt" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "experiences" ADD "isDraft" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "price" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "products" ADD "isDraft" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "isDraft"`);
    // Not reverting price back to NOT NULL — any real draft rows
    // created in the meantime would violate that constraint, and this
    // is a down migration, not a data-loss tool.
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "isDraft"`);
  }
}
