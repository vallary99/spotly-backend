import { MigrationInterface, QueryRunner } from 'typeorm';

// Full-text search across name (highest relevance), category, and
// description (previously never searched at all — see SearchService).
// Deliberately a functional/expression GIN index rather than a stored
// generated tsvector column: TypeORM's synchronize-free migration flow
// still has to coexist with entities that don't know about this column,
// and an expression index needs no schema change to the businesses
// table itself, just an index computed from existing columns.
export class AddBusinessSearchIndex1786487207957 implements MigrationInterface {
  name = 'AddBusinessSearchIndex1786487207957';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_business_search" ON "businesses" USING GIN ((
        setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("category", '')), 'B') ||
        setweight(to_tsvector('english', coalesce("description", '')), 'C')
      ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_business_search"`);
  }
}
