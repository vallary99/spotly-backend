import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Experience } from './entities/experience.entity';
import { Business } from '../business/entities/business.entity';
import { ExperienceService } from './experience.service';
import { ExperienceController } from './experience.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([Experience, Business]), SubscriptionModule, MediaModule],
  providers: [ExperienceService],
  controllers: [ExperienceController],
  exports: [TypeOrmModule],
})
export class ExperienceModule {}
