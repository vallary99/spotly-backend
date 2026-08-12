import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'email' })],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService, BullModule],
})
export class EmailModule {}
