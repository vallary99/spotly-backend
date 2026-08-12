// One-time bootstrap tool — run locally, never exposed over HTTP. This
// is the intended way to create your first (and any future) admin
// account, so nobody has to touch SQL directly.
//
// Usage:
//   npx ts-node scripts/grant-admin.ts someone@example.com
//
// Reads the same DATABASE_URL from .env that the app itself uses, so
// there's nothing extra to configure — if `npm run start` connects to
// the right database, so does this.
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../src/entities/user.entity';
import { Business } from '../src/entities/business.entity';
import { Media } from '../src/entities/media.entity';
import { Experience } from '../src/entities/experience.entity';
import { Review } from '../src/entities/review.entity';
import { Bookmark } from '../src/entities/bookmark.entity';
import { Payment } from '../src/entities/payment.entity';
import { UsageEvent } from '../src/entities/usage-event.entity';
import { ModerationQueueItem } from '../src/entities/moderation-queue-item.entity';
import { TierConfig } from '../src/entities/tier-config.entity';
import { EmailTemplate } from '../src/entities/email-template.entity';
import { EmailSendLog } from '../src/entities/email-send-log.entity';

dotenv.config();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node scripts/grant-admin.ts <email>');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is not set — make sure you\'re running this from the spotly-api folder, with a real .env file present (same one the app itself uses).',
    );
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    // Same full entity list as src/config/typeorm.config.ts — TypeORM
    // needs the whole relation graph registered to resolve metadata
    // correctly (User -> Business -> Media -> ... cascades), even
    // though this script only ever touches the users table directly.
    entities: [
      User,
      Business,
      Media,
      Experience,
      Review,
      Bookmark,
      Payment,
      UsageEvent,
      ModerationQueueItem,
      TierConfig,
      EmailTemplate,
      EmailSendLog,
    ],
    synchronize: false,
  });

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
    console.log('They need to log out and back in to spotly-admin for this to take effect (the JWT has to be reissued to carry the new role).');
  }

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Something went wrong:', err.message);
  process.exit(1);
});
