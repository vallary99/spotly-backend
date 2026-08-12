import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Media } from '../entities/media.entity';
import { Business } from '../entities/business.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { QualityGateService } from './quality-gate.service';
import { StorageService } from './storage.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media, Business]),
    BullModule.registerQueue({ name: 'moderation' }),
    SubscriptionModule,
  ],
  providers: [MediaService, QualityGateService, StorageService],
  controllers: [MediaController],
  exports: [QualityGateService, StorageService],
})
export class MediaModule {}
