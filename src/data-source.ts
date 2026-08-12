import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './entities/user.entity';
import { Business } from './entities/business.entity';
import { Media } from './entities/media.entity';
import { Experience } from './entities/experience.entity';
import { Review } from './entities/review.entity';
import { Bookmark } from './entities/bookmark.entity';
import { Payment } from './entities/payment.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { ModerationQueueItem } from './entities/moderation-queue-item.entity';
import { TierConfig } from './entities/tier-config.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailSendLog } from './entities/email-send-log.entity';

dotenv.config();

// Used by the TypeORM CLI (see package.json's migration:* scripts) —
// npm run migration:generate / migration:run / migration:revert. Kept
// separate from src/config/typeorm.config.ts (the NestJS-wrapped
// version the app actually boots with) because the CLI needs a plain
// DataSource instance, not a ConfigModule-registered factory.
export const AppDataSource = new DataSource({
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
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
