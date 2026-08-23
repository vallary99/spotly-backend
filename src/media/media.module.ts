import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { Business } from '../business/entities/business.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { QualityGateService } from './quality-gate.service';
import { StorageService } from './storage.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media, Business]),
    TasksModule,
    SubscriptionModule,
  ],
  providers: [MediaService, QualityGateService, StorageService],
  controllers: [MediaController],
  exports: [QualityGateService, StorageService],
})
export class MediaModule {}
