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

// Entities still live beside the module that owns them; this only lists
// them, so registration never depends on scanning the filesystem.
//
// A `dist/**/*.entity.js` glob is resolved against process.cwd() at
// runtime, and matches nothing the moment the deployed layout differs
// from the local one. On Vercel the compiled files land under
// /var/task/src, so the glob found zero entities and the first
// repository call died with "No metadata for TierConfig was found" —
// after a clean boot and a full route table, which makes it look like
// anything but a config problem.
//
// Static imports are also what lets a bundler see these files at all:
// nothing statically references an entity that is only reached by glob,
// so it can be dropped from the bundle entirely.
//
// IMPORTANT: adding a new entity file means adding it here too — static
// registration trades "never forget to update a list" (the glob's
// upside) for "never silently fail to find an entity on a deploy target
// whose file layout differs from local" (the glob's actual failure mode
// on Vercel).
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
