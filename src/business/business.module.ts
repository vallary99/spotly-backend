import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Business } from '../entities/business.entity';
import { User } from '../entities/user.entity';
import { Experience } from '../entities/experience.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Media } from '../entities/media.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, User, Experience, UsageEvent, Media]),
    BullModule.registerQueue({ name: 'usage' }),
    EmailModule,
  ],
  providers: [BusinessService],
  controllers: [BusinessController],
  exports: [TypeOrmModule, BusinessService],
})
export class BusinessModule {}
