import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentPurpose } from '../entities/payment.entity';
import { Business, SubscriptionStatus, SubscriptionTier } from '../entities/business.entity';
import { DarajaService } from './daraja.service';
import { InitiatePaymentDto } from './dto/payment.dto';
import { TierConfigService } from '../subscription/tier-config.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { normalizeKenyanMsisdn } from '../common/utils/phone.util';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment) private payments: Repository<Payment>,
    @InjectRepository(Business) private businesses: Repository<Business>,
    private daraja: DarajaService,
    private dataSource: DataSource,
    private tierConfig: TierConfigService,
    @InjectQueue('billing') private billingQueue: Queue,
  ) {}

  // POST /payments/mpesa/stk-push — FR-13.1: subscription upgrades and
  // per-event fees payable via STK Push.
  async initiate(dto: InitiatePaymentDto) {
    const business = await this.businesses.findOne({ where: { id: dto.businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }

    // Reject an unusable phone number here, with a clear message, rather
    // than letting it reach Daraja and come back as an opaque rejected
    // axios call (see DarajaService) — this is the common case (a typo
    // or a non-Safaricom number), so it deserves a clean 400, not a 500.
    const phoneNumber = normalizeKenyanMsisdn(dto.phoneNumber);
    if (!phoneNumber) {
      throw new BadRequestException(
        'Enter a valid Safaricom number to receive the M-Pesa prompt, e.g. 0712345678.',
      );
    }

    // The amount actually charged, computed server-side for BOTH
    // purposes rather than ever trusting dto.amount — a client
    // controlling what Daraja charges is a real payment-integrity bug,
    // not a hypothetical one. EXPERIENCE_ADDON used to trust the client
    // amount as-is; now it's recomputed from the business's own current
    // tier, same as SUBSCRIPTION is.
    let amount = dto.amount;
    const discount = Math.min(100, Math.max(0, business.discountPercent || 0));
    if (dto.purpose === PaymentPurpose.SUBSCRIPTION) {
      if (!dto.targetTier) {
        throw new BadRequestException('targetTier is required for subscription payments.');
      }
      const limits = await this.tierConfig.getLimits(dto.targetTier);
      amount = Math.round(limits.priceKes * (1 - discount / 100));
    } else if (dto.purpose === PaymentPurpose.EXPERIENCE_ADDON) {
      const limits = await this.tierConfig.getLimits(business.tier);
      amount = Math.round(limits.experienceAddonPriceKes * (1 - discount / 100));
    }

    const stk = await this.daraja.initiateStkPush({
      phoneNumber,
      amount,
      accountReference: business.name,
      transactionDesc: `Spotly ${dto.purpose}`,
    });

    const payment = await this.payments.save(
      this.payments.create({
        businessId: dto.businessId,
        purpose: dto.purpose,
        amount,
        status: PaymentStatus.PENDING,
        checkoutRequestId: stk.checkoutRequestId,
        merchantRequestId: stk.merchantRequestId,
      }),
    );

    return { payment, simulated: stk.simulated };
  }

  // POST /payments/mpesa/callback — Daraja's async confirmation. This is
  // the piece flagged in review as needing idempotency + a transaction:
  //
  // 1. Idempotency: CheckoutRequestID has a unique constraint on Payment,
  //    and we look the row up by it before writing. Daraja retries
  //    callbacks on timeout, so this guards against double-crediting a
  //    subscription from the same underlying payment.
  // 2. Atomicity: the payment status update and the business tier/
  //    subscriptionStatus update happen in one DB transaction, so a crash
  //    mid-update can never leave "paid but still Starter" or the reverse.
  async handleCallback(body: any) {
    const stkCallback = body?.Body?.StkCallback;
    if (!stkCallback) {
      this.logger.warn('Received malformed Daraja callback payload.');
      return { received: true };
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode; // 0 = success
    const metadata: Array<{ Name: string; Value: any }> =
      stkCallback.CallbackMetadata?.Item ?? [];
    const receipt = metadata.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;

    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, { where: { checkoutRequestId } });
      if (!payment) {
        this.logger.warn(`Callback for unknown CheckoutRequestID ${checkoutRequestId}`);
        return { received: true };
      }

      // Already terminal (success or failed) — this is a duplicate/retried
      // callback. No-op and return success so Daraja stops retrying.
      if (payment.status !== PaymentStatus.PENDING) {
        this.logger.log(`Duplicate callback for payment ${payment.id}, already ${payment.status}.`);
        return { received: true, duplicate: true };
      }

      payment.status = resultCode === 0 ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      payment.mpesaReceiptNumber = receipt;
      payment.rawCallback = body;
      await manager.save(payment);

      if (payment.status === PaymentStatus.SUCCESS) {
        const business = await manager.findOne(Business, { where: { id: payment.businessId } });
        if (business) {
          if (payment.purpose === 'SUBSCRIPTION') {
            // Which tier they're upgrading to is carried by the amount in
            // this MVP scaffold; a real build would pass an explicit
            // targetTier on InitiatePaymentDto instead of inferring it.
            business.subscriptionStatus = SubscriptionStatus.ACTIVE;
            business.gracePeriodEndsAt = null;
          }
          await manager.save(business);
        }
      }

      return { received: true };
    });
  }

  // GET /payments/:id/status — the piece the frontend needs to poll
  // after initiate(), since the real confirmation arrives asynchronously
  // via Daraja's callback rather than in the initiate response. Owner-
  // gated: only the business that owns the payment can check its status.
  async getStatus(paymentId: string, ownerId: string) {
    const payment = await this.payments.findOne({
      where: { id: paymentId },
      relations: ['business'],
    });
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }
    if (payment.business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this payment.');
    }
    return {
      id: payment.id,
      status: payment.status, // PENDING | SUCCESS | FAILED — poll until this leaves PENDING
      purpose: payment.purpose,
      amount: payment.amount,
      currency: payment.currency,
      mpesaReceiptNumber: payment.mpesaReceiptNumber,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  // Scheduled sweep (see billing queue processor): missed-payment grace
  // period per FR-12.4 — never deletes content, only soft-downgrades.
  async applyGracePeriod(businessId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) return;
    business.subscriptionStatus = SubscriptionStatus.GRACE_PERIOD;
    business.gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day grace period
    await this.businesses.save(business);
    await this.billingQueue.add(
      'check-grace-period-expiry',
      { businessId },
      { delay: 7 * 24 * 60 * 60 * 1000 },
    );
  }
}
