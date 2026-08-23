import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../business/entities/business.entity';
import { TierConfig } from './entities/tier-config.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { TierConfigService } from './tier-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([Business, TierConfig])],
  providers: [SubscriptionService, TierConfigService],
  controllers: [SubscriptionController],
  exports: [SubscriptionService, TierConfigService],
})
export class SubscriptionModule {}
