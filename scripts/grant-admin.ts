// One-time bootstrap tool — run locally, never exposed over HTTP. This
// is the intended way to create your first (and any future) admin
// account, so nobody has to touch SQL directly.
//
// Usage:
//   npm run grant-admin -- someone@example.com          # .env.local
//   npm run grant-admin:prod -- someone@example.com     # .env.prod
//
// Connects exactly the way the app does — same env file for the current
// NODE_ENV, same entities — so if `npm run start:dev` reaches the right
// database, so does this.
import { DataSource } from 'typeorm';
import { User } from '../src/auth/entities/user.entity';
import { loadEnv } from '../src/libs/env/load-env';
import { buildDataSourceOptions } from '../src/database/config/data-source-options';

const envFile = loadEnv();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run grant-admin -- <email>');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_HOST) {
    console.error(
      `No database configured — expected DATABASE_URL or POSTGRES_* in ${envFile}. Run this from the spotly-api folder with that file present.`,
    );
    process.exit(1);
  }

  console.log(`Connecting using ${envFile}...`);
  // Shares the app's connection options, which register the whole entity
  // graph — TypeORM needs that to resolve metadata correctly
  // (User -> Business -> Media -> ... cascades), even though this script
  // only ever touches the users table directly.
  const dataSource = new DataSource(buildDataSourceOptions());

  await dataSource.initialize();
  const users = dataSource.getRepository(User);

  const user = await users.findOne({ where: { email } });
  if (!user) {
    console.error(
      `No account found for ${email}. They need to sign up first (through the app, or via POST /auth/signup) — this script only changes an existing account's role, it doesn't create one.`,
    );
    await dataSource.destroy();
    process.exit(1);
  }

  if (user.role === 'ADMIN') {
    console.log(`${email} is already an admin — nothing to do.`);
  } else {
    user.role = 'ADMIN' as any;
    await users.save(user);
    console.log(`Done — ${email} now has admin access.`);
    console.log(
      'They need to log out and back in to spotly-admin for this to take effect (the JWT has to be reissued to carry the new role).',
    );
  }

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Something went wrong:', err.message);
  process.exit(1);
});
