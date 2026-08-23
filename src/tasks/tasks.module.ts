import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from '../media/entities/media.entity';
import { ModerationQueueItem } from './entities/moderation-queue-item.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { Business } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';
import { ModerationService } from './moderation.service';
import { UsageService } from './usage.service';
import { BillingService } from './billing.service';
import { ExperienceExpiryService } from './experience-expiry.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Media,
      ModerationQueueItem,
      UsageEvent,
      Business,
      Experience,
    ]),
  ],
  providers: [
    ModerationService,
    UsageService,
    BillingService,
    ExperienceExpiryService,
    SchedulerService,
  ],
  exports: [
    ModerationService,
    UsageService,
    BillingService,
    ExperienceExpiryService,
  ],
})
export class TasksModule {}
