import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailService } from './email.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
