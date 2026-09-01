import { MigrationInterface, QueryRunner } from 'typeorm';

// Fixes a real data bug found while building the admin "group
// neighborhoods by city" view (Sep 2026): the original CREATE TABLE for
// "neighborhoods" declared `"city" character varying UNIQUE` — meaning
// only ONE neighborhood could ever exist per city value, globally. All
// 15 seed rows used city='Nairobi', so only the first ("Westlands")
// ever actually inserted; the other 14 silently failed via the seed's
// `ON CONFLICT DO NOTHING` (which, with no target specified, catches a
// conflict on ANY unique constraint — including this wrong one on
// `city`, not just the intended one on `name`).
//
// Also adds `isHidden` — a soft-hide distinct from deleting a
// neighborhood outright, so removing one from public pickers doesn't
// destroy history for any business already using it.
export class FixNeighborhoodCityUniqueAndAddHidden1787700000000
  implements MigrationInterface
{
  name = 'FixNeighborhoodCityUniqueAndAddHidden1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find and drop whatever Postgres auto-named the wrong UNIQUE
    // constraint on `city`, rather than hardcoding a guessed name —
    // safer if it was generated differently than expected.
    const rows = await queryRunner.query(
      `SELECT tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.table_name = 'neighborhoods'
         AND tc.constraint_type = 'UNIQUE'
         AND kcu.column_name = 'city'`,
    );
    for (const row of rows) {
      await queryRunner.query(
        `ALTER TABLE "neighborhoods" DROP CONSTRAINT "${row.constraint_name}"`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "neighborhoods" ADD "isHidden" boolean NOT NULL DEFAULT false`,
    );

    // Re-run the original seed now that `city` isn't uniquely
    // constrained — `ON CONFLICT DO NOTHING` now only has the (correct)
    // unique constraint on `name` to catch, so "Westlands" (already
    // present) is skipped and the other 14 finally insert.
    const neighborhoods = [
      'Westlands', 'Kilimani', 'CBD', 'Nairobi West', 'Hurlingham',
      'Karura', 'Muthaiga', 'Upper Hill', 'Riverside', 'Lavington',
      'Karen', 'Gigiri', 'Ngong', 'Runda', 'Nairobi South',
    ];
    for (const neighborhood of neighborhoods) {
      await queryRunner.query(
        `INSERT INTO "neighborhoods" ("name", "city") VALUES ($1, $2) ON CONFLICT ("name") DO NOTHING`,
        [neighborhood, 'Nairobi'],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "neighborhoods" DROP COLUMN "isHidden"`);
    // Deliberately not restoring the UNIQUE(city) constraint or
    // removing the backfilled rows — the constraint was a bug, not a
    // feature, and by the time anyone runs `down` real neighborhoods
    // may already reference these rows.
  }
}
