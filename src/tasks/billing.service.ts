import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  Business,
  SubscriptionStatus,
  SubscriptionTier,
} from '../business/entities/business.entity';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
  ) {}

  async sweepExpiredGracePeriods(): Promise<void> {
    const expired = await this.businesses.find({
      where: {
        subscriptionStatus: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: LessThanOrEqual(new Date()),
      },
    });
    for (const business of expired) {
      business.tier = SubscriptionTier.STARTER;
      business.subscriptionStatus = SubscriptionStatus.DOWNGRADED;
      business.gracePeriodEndsAt = null;
      await this.businesses.save(business);
      this.logger.log(
        `Business ${business.id} downgraded to Starter after grace period expiry.`,
      );
    }
  }
}
