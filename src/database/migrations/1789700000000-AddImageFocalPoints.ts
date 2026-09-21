import { MigrationInterface, QueryRunner } from 'typeorm';

// Val, Sep 2026: "allow user to move the images they upload to be used
// on business cover or event cover... not just having a default crop
// line." Media gets real columns (one row per image already); the
// Experience side gets a URL->{x,y} map since its images are a plain
// string array, not a table.
export class AddImageFocalPoints1789700000000 implements MigrationInterface {
  name = 'AddImageFocalPoints1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" ADD "focalX" double precision`);
    await queryRunner.query(`ALTER TABLE "media" ADD "focalY" double precision`);
    await queryRunner.query(`ALTER TABLE "experiences" ADD "imageFocalPoints" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "imageFocalPoints"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "focalY"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "focalX"`);
  }
}
