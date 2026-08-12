import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Media } from '../entities/media.entity';
import { ModerationQueueItem } from '../entities/moderation-queue-item.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Business } from '../entities/business.entity';
import { Experience } from '../entities/experience.entity';
import { ModerationProcessor } from './moderation.processor';
import { UsageProcessor } from './usage.processor';
import { BillingProcessor } from './billing.processor';
import { ExperienceExpiryProcessor } from './experience-expiry.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'moderation' },
      { name: 'usage' },
      { name: 'billing' },
      { name: 'experience-expiry' },
    ),
    TypeOrmModule.forFeature([Media, ModerationQueueItem, UsageEvent, Business, Experience]),
  ],
  providers: [ModerationProcessor, UsageProcessor, BillingProcessor, ExperienceExpiryProcessor],
  exports: [BullModule],
})
export class QueueModule implements OnModuleInit {
  constructor(
    @InjectQueue('usage') private usageQueue: Queue,
    @InjectQueue('experience-expiry') private experienceExpiryQueue: Queue,
  ) {}

  // Registers the two sweep jobs described in earlier review notes:
  // usage-counter rollup (backs FR-12.2's threshold check) and experience
  // auto-expiry (FR-9.3). Both are cheap, idempotent, and safe to re-run.
  // bullmq@6 moved repeatable scheduling from Queue.add({repeat}) to a
  // dedicated Job Scheduler API.
  async onModuleInit() {
    await this.usageQueue.upsertJobScheduler(
      'usage-sweep-hourly',
      { every: 60 * 60 * 1000 }, // hourly
      { name: 'sweep-rolling-counters', data: {} },
    );
    await this.experienceExpiryQueue.upsertJobScheduler(
      'experience-expiry-sweep',
      { every: 15 * 60 * 1000 }, // every 15 min
      { name: 'sweep-expired', data: {} },
    );
  }
}
