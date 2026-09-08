import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from '../media/entities/media.entity';
import { ModerationQueueItem } from './entities/moderation-queue-item.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { Business } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';
import { User } from '../auth/entities/user.entity';
import { ModerationService } from './moderation.service';
import { UsageService } from './usage.service';
import { BillingService } from './billing.service';
import { ExperienceExpiryService } from './experience-expiry.service';
import { ListingLifecycleService } from './listing-lifecycle.service';
import { SchedulerService } from './scheduler.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Media,
      ModerationQueueItem,
      UsageEvent,
      Business,
      Experience,
      User,
    ]),
    EmailModule,
  ],
  providers: [
    ModerationService,
    UsageService,
    BillingService,
    ExperienceExpiryService,
    ListingLifecycleService,
    SchedulerService,
  ],
  exports: [
    ModerationService,
    UsageService,
    BillingService,
    ExperienceExpiryService,
    ListingLifecycleService,
  ],
})
export class TasksModule {}
