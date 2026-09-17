import { MigrationInterface, QueryRunner } from 'typeorm';

// Val, Sep 2026: "limited or unlimited attendees and pay in advance or
// at the venue or both... an optional instructions field."
export class AddCapacityPaymentTimingAndInstructionsToExperiences1789500000000
  implements MigrationInterface
{
  name = 'AddCapacityPaymentTimingAndInstructionsToExperiences1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiences" ADD "capacity" integer`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."experiences_paymenttiming_enum" AS ENUM('ADVANCE', 'AT_VENUE', 'EITHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiences" ADD "paymentTiming" "public"."experiences_paymenttiming_enum" NOT NULL DEFAULT 'AT_VENUE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiences" ADD "instructions" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "instructions"`);
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "paymentTiming"`);
    await queryRunner.query(`DROP TYPE "public"."experiences_paymenttiming_enum"`);
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "capacity"`);
  }
}
