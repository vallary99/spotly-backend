import { MigrationInterface, QueryRunner } from 'typeorm';

// Experience.category never had any real use (no frontend filter ever
// queried by it) — replaced with ticketingLink, which real events
// actually need. Also formalizes the bookmarks.experienceId -> 
// experiences.id relationship as a real foreign key, which existed as a
// bare column before but was never actually enforced or navigable.
export class ExperienceTicketingAndBookmarkFk1786518147139 implements MigrationInterface {
  name = 'ExperienceTicketingAndBookmarkFk1786518147139';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "experiences" ADD "ticketingLink" character varying`);
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "category"`);
    // bookmarks.experienceId was created as a bare varchar column (it
    // never had a real relation before), while experiences.id is uuid —
    // Postgres won't let a foreign key reference a mismatched type, so
    // this has to be converted first.
    await queryRunner.query(`ALTER TABLE "bookmarks" ALTER COLUMN "experienceId" TYPE uuid USING "experienceId"::uuid`);
    await queryRunner.query(`
      ALTER TABLE "bookmarks"
      ADD CONSTRAINT "FK_bookmarks_experienceId"
      FOREIGN KEY ("experienceId") REFERENCES "experiences"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookmarks" DROP CONSTRAINT "FK_bookmarks_experienceId"`);
    await queryRunner.query(`ALTER TABLE "bookmarks" ALTER COLUMN "experienceId" TYPE character varying`);
    await queryRunner.query(`ALTER TABLE "experiences" ADD "category" character varying`);
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "ticketingLink"`);
  }
}
