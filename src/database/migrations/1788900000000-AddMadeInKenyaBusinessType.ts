import { MigrationInterface, QueryRunner } from 'typeorm';

// A third business type (Val, Sep 2026) — makers whose listing is a
// product catalogue, not a venue or bookable experience. Gated by a
// new approvalStatus (defaulting APPROVED, so Venue/Experience Host
// are entirely unaffected) since the whole point is verifying the
// "actually made in Kenya" claim before anything publishes.
export class AddMadeInKenyaBusinessType1788900000000
  implements MigrationInterface
{
  name = 'AddMadeInKenyaBusinessType1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."businesses_type_enum" ADD VALUE 'MADE_IN_KENYA'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."businesses_madeinkenyacategory_enum" AS ENUM('FASHION', 'BEAUTY', 'ART_CRAFTS', 'JEWELLERY_ACCESSORIES', 'GIFTS_LIFESTYLE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "madeInKenyaCategory" "public"."businesses_madeinkenyacategory_enum"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."businesses_approvalstatus_enum" AS ENUM('APPROVED', 'PENDING', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "approvalStatus" "public"."businesses_approvalstatus_enum" NOT NULL DEFAULT 'APPROVED'`,
    );

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "businessId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "price" double precision NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'KES',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_products_businessId" ON "products" ("businessId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_business" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "productId" uuid NOT NULL,
        "url" character varying NOT NULL,
        "storageKey" character varying NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_images" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_images_productId" ON "product_images" ("productId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "FK_product_images_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'MADE_IN_KENYA_APPROVED',
        'Made in Kenya — Approved',
        "You're approved! Start adding {{businessName}}'s products",
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">Welcome to Made in Kenya</h1>
  <p>Hi {{ownerName}}, {{businessName}} has been approved. You can now add photos and start
  posting products to your catalogue.</p>
  <p style="margin-top: 24px;">
    <a href="https://spotly.co.ke/dashboard" style="background:#C7653A;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;">
      Go to your dashboard
    </a>
  </p>
</div>`,
      ],
    );

    await queryRunner.query(
      `INSERT INTO "email_templates" ("key", "name", "subject", "body") VALUES ($1, $2, $3, $4)`,
      [
        'MADE_IN_KENYA_REJECTED',
        'Made in Kenya — Not Approved',
        'An update on your Spotly application',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #43352F;">
  <h1 style="color: #7A3C2C; font-size: 22px;">We couldn't approve {{businessName}} this time</h1>
  <p>Hi {{ownerName}}, thanks for applying to list {{businessName}} on Spotly's Made in Kenya
  collection. We weren't able to approve it this time.</p>
  {{reasonBlock}}
  <p>If you have questions, just reply to this email.</p>
</div>`,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "key" = 'MADE_IN_KENYA_REJECTED'`);
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "key" = 'MADE_IN_KENYA_APPROVED'`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "approvalStatus"`);
    await queryRunner.query(`DROP TYPE "public"."businesses_approvalstatus_enum"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "madeInKenyaCategory"`);
    await queryRunner.query(`DROP TYPE "public"."businesses_madeinkenyacategory_enum"`);
    // Postgres has no ALTER TYPE ... DROP VALUE — removing MADE_IN_KENYA
    // from businesses_type_enum cleanly requires recreating the enum
    // type from scratch, not safe to automate here (same situation as
    // the DORMANT listingStatus addition earlier).
  }
}
