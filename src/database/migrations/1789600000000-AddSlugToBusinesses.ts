import { MigrationInterface, QueryRunner } from 'typeorm';

// Val, Sep 2026 SEO spec, Section 1 — permanent, human-readable public
// URLs (/{city}/{slug}), replacing the raw /businesses/{id} scheme
// (which stays working as a permanent redirect, handled in
// spotly-web, not here). Unique per (city, slug), not globally — the
// URL already disambiguates by city.
export class AddSlugToBusinesses1789600000000 implements MigrationInterface {
  name = 'AddSlugToBusinesses1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" ADD "slug" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_businesses_city_slug" ON "businesses" ("city", "slug")`,
    );

    // Backfill — same algorithm as BusinessService.generateUniqueSlug,
    // reimplemented here in plain JS/SQL since a migration can't import
    // application code. Processes oldest-first so the business that
    // was actually there first keeps the plain slug on any collision,
    // and later ones get the neighborhood/numbered variant.
    const businesses: Array<{ id: string; name: string; city: string | null; neighborhood: string | null }> =
      await queryRunner.query(
        `SELECT id, name, city, neighborhood FROM "businesses" ORDER BY "createdAt" ASC`,
      );

    const slugify = (text: string): string =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'business';

    const usedSlugsByCity = new Map<string, Set<string>>();

    for (const b of businesses) {
      const city = b.city || 'Nairobi';
      const used = usedSlugsByCity.get(city) ?? new Set<string>();
      const base = slugify(b.name);

      let slug = base;
      if (used.has(slug) && b.neighborhood) {
        slug = `${base}-${slugify(b.neighborhood)}`;
      }
      let counter = 2;
      while (used.has(slug)) {
        slug = `${base}-${counter}`;
        counter++;
      }

      used.add(slug);
      usedSlugsByCity.set(city, used);
      await queryRunner.query(`UPDATE "businesses" SET "slug" = $1 WHERE "id" = $2`, [slug, b.id]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_businesses_city_slug"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "slug"`);
  }
}
