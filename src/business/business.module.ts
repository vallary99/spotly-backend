import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from './entities/business.entity';
import { User } from '../auth/entities/user.entity';
import { Experience } from '../experience/entities/experience.entity';
import { UsageEvent } from '../tasks/entities/usage-event.entity';
import { Media } from '../media/entities/media.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { EmailModule } from '../email/email.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, User, Experience, UsageEvent, Media]),
    TasksModule,
    EmailModule,
  ],
  providers: [BusinessService],
  controllers: [BusinessController],
  exports: [TypeOrmModule, BusinessService],
})
export class BusinessModule {}
