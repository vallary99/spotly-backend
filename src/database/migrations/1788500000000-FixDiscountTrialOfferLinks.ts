import { MigrationInterface, QueryRunner } from 'typeorm';

// DISCOUNT_OFFER and FREE_TRIAL_OFFER were seeded with a hardcoded
// http://localhost:3001/dashboard link in their call-to-action button —
// meaning every discount/trial email ever sent in production pointed
// recipients at a dev-only URL that wouldn't even resolve for them.
// Found while wiring these templates to fire automatically when a
// discount/trial is actually granted (Val, Sep 2026). Only touches the
// link itself, not the rest of either template's copy — and only if
// the content still matches what was originally seeded, same
// clobber-avoidance as UpdateWelcomeBusinessEmailCopy.
export class FixDiscountTrialOfferLinks1788500000000
  implements MigrationInterface
{
  name = 'FixDiscountTrialOfferLinks1788500000000';

  private readonly oldUrl = 'http://localhost:3001/dashboard';
  private readonly newUrl = 'https://spotly.co.ke/dashboard';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of ['DISCOUNT_OFFER', 'FREE_TRIAL_OFFER']) {
      await queryRunner.query(
        `UPDATE "email_templates" SET "body" = REPLACE("body", $1, $2) WHERE "key" = $3 AND "body" LIKE '%' || $1 || '%'`,
        [this.oldUrl, this.newUrl, key],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const key of ['DISCOUNT_OFFER', 'FREE_TRIAL_OFFER']) {
      await queryRunner.query(
        `UPDATE "email_templates" SET "body" = REPLACE("body", $1, $2) WHERE "key" = $3 AND "body" LIKE '%' || $1 || '%'`,
        [this.newUrl, this.oldUrl, key],
      );
    }
  }
}
