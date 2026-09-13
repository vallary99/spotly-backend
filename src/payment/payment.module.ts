import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Business } from '../business/entities/business.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { DarajaService } from './daraja.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Business]), SubscriptionModule],
  providers: [PaymentService, DarajaService, PaymentReconciliationService],
  controllers: [PaymentController],
  exports: [PaymentReconciliationService],
})
export class PaymentModule {}
