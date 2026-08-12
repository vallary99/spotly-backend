import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Business } from '../entities/business.entity';
import { Media } from '../entities/media.entity';
import { Experience } from '../entities/experience.entity';
import { Review } from '../entities/review.entity';
import { Bookmark } from '../entities/bookmark.entity';
import { Payment } from '../entities/payment.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { ModerationQueueItem } from '../entities/moderation-queue-item.entity';
import { TierConfig } from '../entities/tier-config.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSendLog } from '../entities/email-send-log.entity';

export default registerAs(
  'typeorm',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
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
    // Real migrations now (see src/migrations/, src/data-source.ts, and
    // the migration:* npm scripts) — synchronize used to be true here
    // for the MVP scaffold phase; a schema drift on a live database with
    // real user data is a much worse problem than in dev, so this is
    // the one thing from that phase that genuinely had to change before
    // anything resembling production use.
    synchronize: false,
    migrationsRun: false, // run explicitly via `npm run migration:run`, not silently on every boot
    logging: false,
  }),
);
