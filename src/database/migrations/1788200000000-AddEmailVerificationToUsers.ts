import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds real email-ownership verification (Val, Sep 2026: "at the moment
// we just allow users and businesses to create accounts without
// verifying whether the emails are legit"). Mirrors the existing
// forgot-password token pattern exactly — a random token + expiry,
// single active one per user, cleared once consumed — see
// AuthService.requestPasswordReset/resetPassword for the sibling flow
// this is modeled on.
//
// Every EXISTING account is backfilled as already-verified: this is
// about catching new signups with fake/typo'd emails going forward, not
// retroactively locking out everyone who already has a real, working
// account today.
export class AddEmailVerificationToUsers1788200000000
  implements MigrationInterface
{
  name = 'AddEmailVerificationToUsers1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationToken" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationExpiresAt" TIMESTAMP`,
    );
    await queryRunner.query(`UPDATE "users" SET "emailVerified" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationExpiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationToken"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerified"`);
  }
}
