import { MigrationInterface, QueryRunner } from 'typeorm';

// Switches AdminEmailService.send() from logging one aggregated row per
// campaign ("recipientCount: 2") to one row per actual recipient
// business — Val, Sep 2026, after a broadcast send to 2 businesses
// showed as a single "2 recipients" row with no way to tell which two
// without opening businessIds. Nullable and additive rather than
// replacing recipientCount/businessIds outright: the couple of rows
// that already exist from before this change stay readable exactly as
// they were: an aggregate count and a JSON array, not this row's
// business.
export class AddBusinessToEmailSendLog1788000000000
  implements MigrationInterface
{
  name = 'AddBusinessToEmailSendLog1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" ADD "businessId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" ADD "businessName" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" DROP COLUMN "businessName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" DROP COLUMN "businessId"`,
    );
  }
}
