import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1786487037234 implements MigrationInterface {
    name = 'InitialSchema1786487037234'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."media_type_enum" AS ENUM('PHOTO', 'VIDEO')`);
        await queryRunner.query(`CREATE TYPE "public"."media_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED')`);
        await queryRunner.query(`CREATE TABLE "media" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "businessId" uuid NOT NULL, "type" "public"."media_type_enum" NOT NULL, "url" character varying NOT NULL, "storageKey" character varying NOT NULL, "status" "public"."media_status_enum" NOT NULL DEFAULT 'PENDING', "rejectReason" character varying, "durationSeconds" integer, "isDuplicateFlag" boolean NOT NULL DEFAULT false, "perceptualHash" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e134e5766462769246e57819cc" ON "media" ("businessId") `);
        await queryRunner.query(`CREATE INDEX "IDX_538d45a7ad40b5a64df3f2149f" ON "media" ("perceptualHash") `);
        await queryRunner.query(`CREATE TABLE "experiences" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "businessId" uuid NOT NULL, "title" character varying NOT NULL, "description" text, "images" text array NOT NULL DEFAULT '{}', "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endsAt" TIMESTAMP WITH TIME ZONE, "location" character varying, "price" double precision, "category" character varying, "isExpired" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_884f0913a63882712ea578e7c85" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_528dfb9992fdafa7e07ff9362f" ON "experiences" ("businessId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a64df4d8fb7e6c9e38793f53c3" ON "experiences" ("startsAt") `);
        await queryRunner.query(`CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "businessId" uuid NOT NULL, "userId" uuid NOT NULL, "rating" integer NOT NULL, "text" text, "photos" text array NOT NULL DEFAULT '{}', "visitDate" TIMESTAMP WITH TIME ZONE, "helpfulCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_cc0eafa31f7a1d0d15a25b96849" UNIQUE ("businessId", "userId"), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d17ce9c119d29c7ec8c884044c" ON "reviews" ("businessId") `);
        await queryRunner.query(`CREATE TYPE "public"."payments_provider_enum" AS ENUM('MPESA')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_purpose_enum" AS ENUM('SUBSCRIPTION', 'EXPERIENCE_ADDON')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "businessId" uuid NOT NULL, "provider" "public"."payments_provider_enum" NOT NULL DEFAULT 'MPESA', "purpose" "public"."payments_purpose_enum" NOT NULL, "amount" double precision NOT NULL, "currency" character varying NOT NULL DEFAULT 'KES', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "checkoutRequestId" character varying, "merchantRequestId" character varying, "mpesaReceiptNumber" character varying, "rawCallback" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9628bb768218b756d120c5e545" ON "payments" ("businessId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_00e4aead8133d32e131133df67" ON "payments" ("checkoutRequestId") WHERE "checkoutRequestId" IS NOT NULL`);
        await queryRunner.query(`CREATE TABLE "usage_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "businessId" uuid NOT NULL, "type" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c9f17d50873fab2c46615f542bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1d3ebba89beb6e6aebe5bd8fef" ON "usage_events" ("businessId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "bookmarks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "businessId" uuid, "experienceId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4a95cd52a2d06f39b6fd762080e" UNIQUE ("userId", "businessId", "experienceId"), CONSTRAINT "PK_7f976ef6cecd37a53bd11685f32" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c6065536f2f6de3a0163e19a58" ON "bookmarks" ("userId") `);
        await queryRunner.query(`CREATE TYPE "public"."businesses_type_enum" AS ENUM('VENUE', 'EXPERIENCE_HOST')`);
        await queryRunner.query(`CREATE TYPE "public"."businesses_tier_enum" AS ENUM('STARTER', 'GROWTH', 'PREMIUM')`);
        await queryRunner.query(`CREATE TYPE "public"."businesses_subscriptionstatus_enum" AS ENUM('ACTIVE', 'GRACE_PERIOD', 'DOWNGRADED')`);
        await queryRunner.query(`CREATE TYPE "public"."businesses_trialoffertier_enum" AS ENUM('STARTER', 'GROWTH', 'PREMIUM')`);
        await queryRunner.query(`CREATE TABLE "businesses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL, "type" "public"."businesses_type_enum" NOT NULL, "name" character varying NOT NULL, "category" character varying NOT NULL, "description" text, "phone" character varying, "email" character varying, "address" character varying, "website" character varying, "latitude" double precision, "longitude" double precision, "hours" jsonb, "amenities" text array NOT NULL DEFAULT '{}', "city" character varying DEFAULT 'Nairobi', "neighborhood" character varying, "tier" "public"."businesses_tier_enum" NOT NULL DEFAULT 'STARTER', "subscriptionStatus" "public"."businesses_subscriptionstatus_enum" NOT NULL DEFAULT 'ACTIVE', "isGrandfathered" boolean NOT NULL DEFAULT false, "discountPercent" integer NOT NULL DEFAULT '0', "trialOfferTier" "public"."businesses_trialoffertier_enum", "trialOfferDays" integer, "trialEndsAt" TIMESTAMP WITH TIME ZONE, "isTrialing" boolean NOT NULL DEFAULT false, "isHiddenGem" boolean NOT NULL DEFAULT false, "isSuspended" boolean NOT NULL DEFAULT false, "suspendedUntil" TIMESTAMP WITH TIME ZONE, "suspensionReason" text, "gracePeriodEndsAt" TIMESTAMP WITH TIME ZONE, "profileViews" integer NOT NULL DEFAULT '0', "savesCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_02e7bfb8e766e8e0ef449cc0f36" UNIQUE ("ownerId"), CONSTRAINT "REL_02e7bfb8e766e8e0ef449cc0f3" UNIQUE ("ownerId"), CONSTRAINT "PK_bc1bf63498dd2368ce3dc8686e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7dd31c475f1c245ab56cfa035f" ON "businesses" ("category") `);
        await queryRunner.query(`CREATE INDEX "IDX_9a2f08e67188581cea72b06cf5" ON "businesses" ("city") `);
        await queryRunner.query(`CREATE INDEX "IDX_416643e6d9fa850e2b88774c78" ON "businesses" ("neighborhood") `);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('REGISTERED', 'BUSINESS_OWNER', 'ADMIN')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying NOT NULL, "passwordHash" character varying, "passwordResetToken" character varying, "passwordResetExpiresAt" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "authProvider" character varying NOT NULL DEFAULT 'email', "role" "public"."users_role_enum" NOT NULL DEFAULT 'REGISTERED', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "moderation_queue_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "mediaId" character varying NOT NULL, "reason" character varying NOT NULL, "resolved" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5b10728f2aa10c303753814ce8d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tier_configs_tier_enum" AS ENUM('STARTER', 'GROWTH', 'PREMIUM')`);
        await queryRunner.query(`CREATE TABLE "tier_configs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tier" "public"."tier_configs_tier_enum" NOT NULL, "priceKes" integer NOT NULL, "photos" integer NOT NULL, "videos" integer NOT NULL, "videoMaxSeconds" integer NOT NULL, "concurrentExperiences" integer, "monthlyExperiencesIncluded" integer, "extraFeatures" text array NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_13b906d0bc83ba18ef175c3539a" UNIQUE ("tier"), CONSTRAINT "PK_305326bb77155bee2753bcdd67d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "email_templates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "subject" character varying NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_06c564c515d8cdb40b6f3bfbbb4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "email_send_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "templateId" uuid, "templateName" character varying NOT NULL, "subject" character varying NOT NULL, "filters" jsonb NOT NULL, "recipientCount" integer NOT NULL, "businessIds" jsonb NOT NULL, "sentByAdminId" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d4e59e3bd1bbd5c4f07875c82ff" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "media" ADD CONSTRAINT "FK_e134e5766462769246e57819cca" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "experiences" ADD CONSTRAINT "FK_528dfb9992fdafa7e07ff9362ff" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_d17ce9c119d29c7ec8c884044cb" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_9628bb768218b756d120c5e5454" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usage_events" ADD CONSTRAINT "FK_086a59b56c648ccbe3df05c70b9" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookmarks" ADD CONSTRAINT "FK_c6065536f2f6de3a0163e19a584" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookmarks" ADD CONSTRAINT "FK_8e3da900435bd1f1a450a601f3f" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "businesses" ADD CONSTRAINT "FK_02e7bfb8e766e8e0ef449cc0f36" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" DROP CONSTRAINT "FK_02e7bfb8e766e8e0ef449cc0f36"`);
        await queryRunner.query(`ALTER TABLE "bookmarks" DROP CONSTRAINT "FK_8e3da900435bd1f1a450a601f3f"`);
        await queryRunner.query(`ALTER TABLE "bookmarks" DROP CONSTRAINT "FK_c6065536f2f6de3a0163e19a584"`);
        await queryRunner.query(`ALTER TABLE "usage_events" DROP CONSTRAINT "FK_086a59b56c648ccbe3df05c70b9"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_9628bb768218b756d120c5e5454"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_d17ce9c119d29c7ec8c884044cb"`);
        await queryRunner.query(`ALTER TABLE "experiences" DROP CONSTRAINT "FK_528dfb9992fdafa7e07ff9362ff"`);
        await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "FK_e134e5766462769246e57819cca"`);
        await queryRunner.query(`DROP TABLE "email_send_logs"`);
        await queryRunner.query(`DROP TABLE "email_templates"`);
        await queryRunner.query(`DROP TABLE "tier_configs"`);
        await queryRunner.query(`DROP TYPE "public"."tier_configs_tier_enum"`);
        await queryRunner.query(`DROP TABLE "moderation_queue_items"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_416643e6d9fa850e2b88774c78"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a2f08e67188581cea72b06cf5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7dd31c475f1c245ab56cfa035f"`);
        await queryRunner.query(`DROP TABLE "businesses"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_trialoffertier_enum"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_subscriptionstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_tier_enum"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6065536f2f6de3a0163e19a58"`);
        await queryRunner.query(`DROP TABLE "bookmarks"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1d3ebba89beb6e6aebe5bd8fef"`);
        await queryRunner.query(`DROP TABLE "usage_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_00e4aead8133d32e131133df67"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9628bb768218b756d120c5e545"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_purpose_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_provider_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d17ce9c119d29c7ec8c884044c"`);
        await queryRunner.query(`DROP TABLE "reviews"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a64df4d8fb7e6c9e38793f53c3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_528dfb9992fdafa7e07ff9362f"`);
        await queryRunner.query(`DROP TABLE "experiences"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_538d45a7ad40b5a64df3f2149f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e134e5766462769246e57819cc"`);
        await queryRunner.query(`DROP TABLE "media"`);
        await queryRunner.query(`DROP TYPE "public"."media_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."media_type_enum"`);
    }

}
