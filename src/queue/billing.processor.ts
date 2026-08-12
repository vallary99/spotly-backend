import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, SubscriptionStatus, SubscriptionTier } from '../entities/business.entity';

@Processor('billing')
export class BillingProcessor extends WorkerHost {
  constructor(@InjectRepository(Business) private businesses: Repository<Business>) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'check-grace-period-expiry') {
      const business = await this.businesses.findOne({ where: { id: job.data.businessId } });
      if (!business) return;
      // If still unpaid when the delayed job fires, soft-downgrade to
      // Starter. Content, media, and reviews are never touched — only
      // tier and status change (FR-12.4).
      if (business.subscriptionStatus === SubscriptionStatus.GRACE_PERIOD) {
        business.tier = SubscriptionTier.STARTER;
        business.subscriptionStatus = SubscriptionStatus.DOWNGRADED;
        business.gracePeriodEndsAt = null;
        await this.businesses.save(business);
      }
    }
  }
}
