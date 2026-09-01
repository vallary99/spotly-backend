import { User } from '../../auth/entities/user.entity';
import { Business } from '../../business/entities/business.entity';
import { Category } from '../../business/entities/category.entity';
import { Neighborhood } from '../../business/entities/neighborhood.entity';
import { QuickFilterGroup } from '../../business/entities/quick-filter-group.entity';
import { Media } from '../../media/entities/media.entity';
import { Experience } from '../../experience/entities/experience.entity';
import { Review } from '../../review/entities/review.entity';
import { Bookmark } from '../../bookmark/entities/bookmark.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { UsageEvent } from '../../tasks/entities/usage-event.entity';
import { ModerationQueueItem } from '../../tasks/entities/moderation-queue-item.entity';
import { TierConfig } from '../../subscription/entities/tier-config.entity';
import { EmailTemplate } from '../../email/entities/email-template.entity';
import { EmailSendLog } from '../../email/entities/email-send-log.entity';
import { SystemConfig } from '../../config/entities/system-config.entity';

// IMPORTANT: adding a new entity file means adding it here too.
export const ENTITIES = [
  User,
  Business,
  Category,
  Neighborhood,
  QuickFilterGroup,
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
  SystemConfig,
];
