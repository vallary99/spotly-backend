import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../entities/business.entity';
import { User } from '../entities/user.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { ModerationQueueItem } from '../entities/moderation-queue-item.entity';
import { Media } from '../entities/media.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSendLog } from '../entities/email-send-log.entity';
import { Payment } from '../entities/payment.entity';
import { AdminController } from './admin.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminBusinessService } from './admin-business.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminEmailService } from './admin-email.service';
import { AdminTransactionsService } from './admin-transactions.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, User, UsageEvent, ModerationQueueItem, Media, EmailTemplate, EmailSendLog, Payment]),
    EmailModule,
  ],
  controllers: [AdminController],
  providers: [AdminAnalyticsService, AdminBusinessService, AdminModerationService, AdminEmailService, AdminTransactionsService],
})
export class AdminModule {}
