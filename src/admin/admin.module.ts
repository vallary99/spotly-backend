import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../business/entities/business.entity';
import { User } from '../auth/entities/user.entity';
import { UsageEvent } from '../tasks/entities/usage-event.entity';
import { ModerationQueueItem } from '../tasks/entities/moderation-queue-item.entity';
import { Media } from '../media/entities/media.entity';
import { EmailTemplate } from '../email/entities/email-template.entity';
import { EmailSendLog } from '../email/entities/email-send-log.entity';
import { Payment } from '../payment/entities/payment.entity';
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
