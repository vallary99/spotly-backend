// One-time, safe "catch up my schema" tool — run locally, never
// exposed over HTTP. Since switching off `synchronize: true` in favor
// of real migrations, anyone whose database was last touched before
// that switch (or before some of the more recent entity fields were
// added — trial/discount fields, password reset tokens, etc.) is
// missing columns the app now expects, which surfaces as a raw 500 the
// moment a query touches one of them (e.g. logging in, since that reads
// the User row).
//
// This uses TypeORM's own schema-diffing (the same mechanism
// `synchronize: true` used) to ADD whatever's missing — new columns,
// new tables (EmailTemplate, TierConfig, etc.), new indexes — without
// dropping or altering anything that already exists correctly. It's
// safe to run more than once; if your schema's already current, it's a
// no-op.
//
// Usage (from the spotly-api folder):
//   npm run sync-schema
import { AppDataSource } from '../src/data-source';

async function main() {
  console.log("Connecting and comparing your database against the app's current entities...");
  await AppDataSource.initialize();
  // false = non-destructive: only adds what's missing, never drops a
  // column/table/index just because it's not (or no longer) in an
  // entity — that's a real, deliberate schema decision, not something
  // a sync tool should ever make unilaterally.
  await AppDataSource.synchronize(false);
  console.log('Done — your database now has every table, column, and index the app currently expects.');
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Something went wrong:', err.message);
  process.exit(1);
});
