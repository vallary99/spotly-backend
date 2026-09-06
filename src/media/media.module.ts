import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { Business } from '../business/entities/business.entity';
import { User } from '../auth/entities/user.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { QualityGateService } from './quality-gate.service';
import { StorageService } from './storage.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { TasksModule } from '../tasks/tasks.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media, Business, User]),
    TasksModule,
    SubscriptionModule,
    EmailModule,
  ],
  providers: [MediaService, QualityGateService, StorageService],
  controllers: [MediaController],
  exports: [QualityGateService, StorageService],
})
export class MediaModule {}
