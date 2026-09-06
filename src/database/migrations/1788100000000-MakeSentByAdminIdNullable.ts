import { MigrationInterface, QueryRunner } from 'typeorm';

// Automatic emails (the two welcome variants, triggered by signup or
// first-photo-approval, not an admin clicking anything) are about to
// start writing their own EmailSendLog rows too — see EmailService's
// new logSend() — so sentByAdminId needs to allow null for those, with
// null meaning "the system sent this, not an admin" (Val, Sep 2026:
// "id[if] the new design shows one log row per business... replaced by
// whoever clicked Send, Admin or System").
export class MakeSentByAdminIdNullable1788100000000
  implements MigrationInterface
{
  name = 'MakeSentByAdminIdNullable1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" ALTER COLUMN "sentByAdminId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_send_logs" ALTER COLUMN "sentByAdminId" SET NOT NULL`,
    );
  }
}
