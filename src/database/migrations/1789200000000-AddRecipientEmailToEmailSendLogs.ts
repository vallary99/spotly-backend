import { MigrationInterface, QueryRunner } from 'typeorm';

// Splits the recipient's actual email address into its own column,
// separate from businessName — a manual outreach send to a prospect
// (no registered business) used to store the raw email IN businessName
// as a workaround, conflating "who this went to" with "which business
// this concerns" (Val, Sep 2026).
export class AddRecipientEmailToEmailSendLogs1789200000000
  implements MigrationInterface
{
  name = 'AddRecipientEmailToEmailSendLogs1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" ADD "recipientEmail" character varying`,
    );
    // Backfill: the old rows that stuffed an email into businessName
    // for a businessId-less (prospect) send — recognizable as
    // businessId IS NULL AND businessName LIKE '%@%'. Move it over and
    // null out businessName, matching how new rows are now written.
    await queryRunner.query(`
      UPDATE "email_send_logs"
      SET "recipientEmail" = "businessName", "businessName" = NULL
      WHERE "businessId" IS NULL AND "businessName" LIKE '%@%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_send_logs" DROP COLUMN "recipientEmail"`);
  }
}
