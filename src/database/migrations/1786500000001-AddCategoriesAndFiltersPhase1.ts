import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoriesAndFiltersPhase1786500000001 implements MigrationInterface {
  name = 'AddCategoriesAndFiltersPhase1786500000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum for ReservationPolicy
    await queryRunner.query(
      `CREATE TYPE "public"."reservation_policy_enum" AS ENUM('RESERVATION_ONLY', 'WALK_IN_ONLY', 'BOTH')`
    );

    // Create categories table
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL UNIQUE, "description" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), PRIMARY KEY ("id"))`
    );

    // Create neighborhoods table
    await queryRunner.query(
      `CREATE TABLE "neighborhoods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL UNIQUE, "city" character varying UNIQUE, "description" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), PRIMARY KEY ("id"))`
    );

    // Create quick_filter_groups table
    await queryRunner.query(
      `CREATE TABLE "quick_filter_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "label" character varying NOT NULL UNIQUE, "icon" character varying, "sortOrder" integer NOT NULL DEFAULT 0, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), PRIMARY KEY ("id"))`
    );

    // Create junction table for quick_filter_group_categories
    await queryRunner.query(
      `CREATE TABLE "quick_filter_group_categories" ("quickFilterGroupId" uuid NOT NULL, "categoryId" uuid NOT NULL, PRIMARY KEY ("quickFilterGroupId", "categoryId"))`
    );

    // Add foreign keys for junction table
    await queryRunner.query(
      `ALTER TABLE "quick_filter_group_categories" ADD CONSTRAINT "FK_quick_filter_group_categories_quickFilterGroupId" FOREIGN KEY ("quickFilterGroupId") REFERENCES "quick_filter_groups"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "quick_filter_group_categories" ADD CONSTRAINT "FK_quick_filter_group_categories_categoryId" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE`
    );

    // Update businesses table
    // IMPORTANT: add the new columns FIRST, backfill their values from
    // the old `category`/`phone` columns, and only THEN drop the old
    // columns. The original version of this migration dropped
    // `category`/`phone` before the new columns even existed, which
    // silently destroyed every existing business's category and phone
    // number with no way to recover them — caught before this ever ran
    // against a database with real registered businesses in it (Sep
    // 2026). If you're reading this in an environment where the old
    // (data-destroying) version already ran, this fix can't undo that —
    // check backups.

    // Add new columns
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "categories" text array NOT NULL DEFAULT '{}'`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "callPhone" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "whatsappPhone" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "budgetMin" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "budgetMax" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "reservationPolicy" "public"."reservation_policy_enum"`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "firstCohortPremiumTrial" boolean NOT NULL DEFAULT false`
    );

    // Backfill the new columns from the old ones BEFORE dropping them —
    // every existing business's single `category` becomes a one-item
    // `categories` array, and `phone` becomes `callPhone` (the number
    // it was actually used for — a call — not WhatsApp, which is new
    // and has nothing to backfill from).
    await queryRunner.query(
      `UPDATE "businesses" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL AND "category" != ''`
    );
    await queryRunner.query(
      `UPDATE "businesses" SET "callPhone" = "phone" WHERE "phone" IS NOT NULL AND "phone" != ''`
    );

    // Only now is it safe to drop the old columns.
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "category"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "phone"`);

    // Update experiences table
    await queryRunner.query(
      `ALTER TABLE "experiences" ADD "budgetMin" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "experiences" ADD "budgetMax" double precision`
    );

    // Seed initial categories (from SEED_CATEGORIES in business.service.ts)
    const categories = [
      // Creative Boost
      'Pottery Studio', 'Painting Studio', 'Cake Decorating', 'Candle Making', 'Crafts Studio', 'Photography Studio',
      // Art & Galleries
      'Art Gallery', 'Art Studio', 'Art Installation', 'Exhibition Space',
      // Culture & Heritage
      'Museum', 'Cultural Centre', 'Heritage Site', 'Cultural Experience',
      // Live Music & Karaoke
      'Live Music Venue', 'Acoustic Session Venue', 'Karaoke Bar',
      // Dance
      'Dance Class', 'Dance Studio', 'Social Dancing Venue', 'Dance Performance Venue',
      // Nightlife
      'Nightclub', 'Lounge', 'Late-Night Venue',
      // Adrenaline Boost
      'Go-Karting', 'Paintball', 'Ziplining', 'Climbing Gym', 'Roller Skating Rink', 'Ice Skating Rink',
      // Gaming
      'Arcade', 'VR Gaming', 'Gaming Lounge', 'Esports Venue', 'Simulator Experience',
      // Wildlife & Nature
      'Scenic View Point', 'Picnic Spot', 'Hiking Trail', 'Camping Site', 'Garden', 'Park',
      // Beauty & Wellness
      'Spa', 'Massage', 'Fitness', 'Yoga Studio', 'Salon', 'Wellness Centre',
      // Sports
      'Sports Ground', 'Training Facility', 'Sports Court', 'Swimming Pool',
      // Shopping
      'Antique Store', 'Farmers Market', 'Thrift Store', 'Boutique',
      // Workshops & Classes
      'Cooking Class', 'Educational Workshop', 'Demonstration Experience',
      // Restaurants & Cafés
      'Restaurant', 'Cafe', 'Bakery', 'Diner', 'Specialty Food Spot',
      // Platters & Buffets
      'Buffet', 'Sharing Platters Spot', 'Nyama Choma Spot', 'Choma Base', 'Street Food', 'Group Dining Venue',
      // Drinks & Cocktails
      'Cocktail Bar', 'Wine Bar', 'Brewery', 'Specialty Drinks Spot',
    ];

    for (const category of categories) {
      await queryRunner.query(
        `INSERT INTO "categories" ("name") VALUES ($1) ON CONFLICT DO NOTHING`,
        [category]
      );
    }

    // Seed neighborhoods for Nairobi
    const neighborhoods = [
      'Westlands', 'Kilimani', 'CBD', 'Nairobi West', 'Hurlingham',
      'Karura', 'Muthaiga', 'Upper Hill', 'Riverside', 'Lavington',
      'Karen', 'Gigiri', 'Ngong', 'Runda', 'Nairobi South',
    ];

    for (const neighborhood of neighborhoods) {
      await queryRunner.query(
        `INSERT INTO "neighborhoods" ("name", "city") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [neighborhood, 'Nairobi']
      );
    }

    // Seed quick filter groups with existing category mappings (from frontend UI)
    const filterGroups = [
      { label: "Restaurants & Cafés", icon: "bi-egg-fried", categories: ["Restaurant", "Cafe", "Bakery", "Diner", "Specialty Food Spot"] },
      { label: "Platters & Buffets", icon: "bi-basket2", categories: ["Buffet", "Sharing Platters Spot", "Nyama Choma Spot", "Choma Base", "Street Food", "Group Dining Venue"] },
      { label: "Drinks & Cocktails", icon: "bi-cup-straw", categories: ["Cocktail Bar", "Wine Bar", "Brewery", "Specialty Drinks Spot"] },
      { label: "Nightlife", icon: "bi-moon-stars", categories: ["Nightclub", "Lounge", "Late-Night Venue"] },
      { label: "Beauty & Wellness", icon: "bi-flower2", categories: ["Spa", "Massage", "Fitness", "Yoga Studio", "Salon", "Wellness Centre"] },
      { label: "Shopping", icon: "bi-bag", categories: ["Antique Store", "Farmers Market", "Thrift Store", "Boutique"] },
      { label: "Wildlife & Nature", icon: "bi-tree", categories: ["Scenic View Point", "Picnic Spot", "Hiking Trail", "Camping Site", "Garden", "Park"] },
      { label: "Live Music & Karaoke", icon: "bi-mic", categories: ["Live Music Venue", "Acoustic Session Venue", "Karaoke Bar"] },
      { label: "Adrenaline Boost", icon: "bi-lightning-charge", categories: ["Go-Karting", "Paintball", "Ziplining", "Climbing Gym", "Roller Skating Rink", "Ice Skating Rink"] },
      { label: "Gaming", icon: "bi-controller", categories: ["Arcade", "VR Gaming", "Gaming Lounge", "Esports Venue", "Simulator Experience"] },
      { label: "Sports", icon: "bi-trophy", categories: ["Sports Ground", "Training Facility", "Sports Court", "Swimming Pool"] },
      { label: "Workshops & Classes", icon: "bi-mortarboard", categories: ["Cooking Class", "Educational Workshop", "Demonstration Experience"] },
      { label: "Dance", icon: "bi-music-note-beamed", categories: ["Dance Class", "Dance Studio", "Social Dancing Venue", "Dance Performance Venue"] },
      { label: "Culture & Heritage", icon: "bi-bank", categories: ["Museum", "Cultural Centre", "Heritage Site", "Cultural Experience"] },
      { label: "Art & Galleries", icon: "bi-easel", categories: ["Art Gallery", "Art Studio", "Art Installation", "Exhibition Space"] },
      { label: "Creative Boost", icon: "bi-palette", categories: ["Pottery Studio", "Painting Studio", "Cake Decorating", "Candle Making", "Crafts Studio", "Photography Studio"] },
    ];

    for (let sortOrder = 0; sortOrder < filterGroups.length; sortOrder++) {
      const group = filterGroups[sortOrder];
      const result = await queryRunner.query(
        `INSERT INTO "quick_filter_groups" ("label", "icon", "sortOrder") VALUES ($1, $2, $3) RETURNING "id"`,
        [group.label, group.icon, sortOrder]
      );
      const groupId = result[0].id;

      // Link categories to this group
      for (const categoryName of group.categories) {
        await queryRunner.query(
          `INSERT INTO "quick_filter_group_categories" ("quickFilterGroupId", "categoryId") 
           SELECT $1, "id" FROM "categories" WHERE "name" = $2 
           ON CONFLICT DO NOTHING`,
          [groupId, categoryName]
        );
      }
    }

    // Mark first 100 businesses as firstCohortPremiumTrial (ordered by creation date)
    await queryRunner.query(
      `UPDATE "businesses" SET "firstCohortPremiumTrial" = true 
       WHERE "id" IN (SELECT "id" FROM "businesses" ORDER BY "createdAt" ASC LIMIT 100)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE "quick_filter_group_categories" DROP CONSTRAINT "FK_quick_filter_group_categories_categoryId"`
    );
    await queryRunner.query(
      `ALTER TABLE "quick_filter_group_categories" DROP CONSTRAINT "FK_quick_filter_group_categories_quickFilterGroupId"`
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE "quick_filter_group_categories"`);
    await queryRunner.query(`DROP TABLE "quick_filter_groups"`);
    await queryRunner.query(`DROP TABLE "neighborhoods"`);
    await queryRunner.query(`DROP TABLE "categories"`);

    // Revert businesses table changes
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "firstCohortPremiumTrial"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "reservationPolicy"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "budgetMax"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "budgetMin"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "whatsappPhone"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "callPhone"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "categories"`);

    // Recreate old columns (with defaults)
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "phone" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "category" character varying NOT NULL DEFAULT 'General'`
    );

    // Revert experiences table changes
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "budgetMax"`);
    await queryRunner.query(`ALTER TABLE "experiences" DROP COLUMN "budgetMin"`);

    // Drop enum
    await queryRunner.query(`DROP TYPE "public"."reservation_policy_enum"`);
  }
}
