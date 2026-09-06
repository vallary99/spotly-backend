import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailSendLog } from './entities/email-send-log.entity';
import { EmailService } from './email.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, EmailSendLog])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
