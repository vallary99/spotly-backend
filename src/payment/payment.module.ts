import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Business } from '../business/entities/business.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { DarajaService } from './daraja.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Business]), SubscriptionModule],
  providers: [PaymentService, DarajaService],
  controllers: [PaymentController],
})
export class PaymentModule {}
