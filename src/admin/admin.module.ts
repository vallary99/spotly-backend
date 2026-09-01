import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../business/entities/business.entity';
import { Category } from '../business/entities/category.entity';
import { Neighborhood } from '../business/entities/neighborhood.entity';
import { QuickFilterGroup } from '../business/entities/quick-filter-group.entity';
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
import { AdminConfigService } from './admin-config.service';
import { EmailModule } from '../email/email.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SystemConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Category, Neighborhood, QuickFilterGroup, User, UsageEvent, ModerationQueueItem, Media, EmailTemplate, EmailSendLog, Payment]),
    EmailModule,
    SubscriptionModule,
    SystemConfigModule,
  ],
  controllers: [AdminController],
  providers: [AdminAnalyticsService, AdminBusinessService, AdminModerationService, AdminEmailService, AdminTransactionsService, AdminConfigService],
})
export class AdminModule {}
