import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, SubscriptionTier } from '../entities/business.entity';
import { UPGRADE_THRESHOLD, TierLimit } from './tier-limits';
import { TierConfigService } from './tier-config.service';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    private tierConfig: TierConfigService,
  ) {}

  // GET /subscriptions/tiers — catalogue (PRD Section 14), DB-backed and
  // editable rather than a static constant.
  async getTierCatalogue() {
    return this.tierConfig.getAll();
  }

  // Lazy check, same instinct as suspension's suspendedUntil — no
  // scheduled job, just correct itself the next time this business is
  // actually read. Reverts `tier` back to STARTER and clears the trial
  // flags once trialEndsAt has passed.
  private async revertExpiredTrial(business: Business): Promise<Business> {
    if (business.isTrialing && business.trialEndsAt && business.trialEndsAt < new Date()) {
      business.tier = SubscriptionTier.STARTER;
      business.isTrialing = false;
      business.trialEndsAt = null;
      business.trialOfferTier = null;
      business.trialOfferDays = null;
      return this.businesses.save(business);
    }
    return business;
  }

  // GET /businesses/:id/subscription — current tier + whether the usage
  // threshold has been crossed (FR-12.2), for the Business Owner Surface
  // upgrade CTA (FR-10.1).
  async getStatus(businessId: string) {
    let business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    business = await this.revertExpiredTrial(business);

    const shouldPromptUpgrade =
      business.tier !== SubscriptionTier.PREMIUM &&
      (business.profileViews >= UPGRADE_THRESHOLD.profileViews ||
        business.savesCount >= UPGRADE_THRESHOLD.saves);
    return {
      tier: business.tier,
      status: business.subscriptionStatus,
      isGrandfathered: business.isGrandfathered,
      discountPercent: business.discountPercent,
      // Trial offer — present only when an admin has granted eligibility
      // but the owner hasn't activated it yet ("Try Premium for free").
      trialOffer:
        business.trialOfferTier && !business.isTrialing
          ? { tier: business.trialOfferTier, days: business.trialOfferDays }
          : null,
      // Active trial — present once the owner has actually clicked
      // Start Trial, so the UI can show a countdown instead of the offer.
      activeTrial: business.isTrialing ? { tier: business.tier, endsAt: business.trialEndsAt } : null,
      limits: await this.tierConfig.getLimits(business.tier),
      usage: { profileViews: business.profileViews, savesCount: business.savesCount },
      shouldPromptUpgrade,
      upgradeMessage: shouldPromptUpgrade
        ? `You've had ${business.profileViews} people view your listing this month — Growth gets you into more searches.`
        : null,
    };
  }

  // POST /businesses/:id/start-trial — activates an admin-granted trial
  // offer. Deliberately owner-initiated (not something admin-granting
  // triggers immediately) — see the entity comment on trialOfferTier.
  async startTrial(businessId: string, ownerId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this business.');
    }
    if (!business.trialOfferTier || !business.trialOfferDays) {
      throw new BadRequestException('No trial offer is available for this business.');
    }
    if (business.isTrialing) {
      throw new BadRequestException('A trial is already active.');
    }
    business.tier = business.trialOfferTier;
    business.isTrialing = true;
    business.trialEndsAt = new Date(Date.now() + business.trialOfferDays * 24 * 60 * 60 * 1000);
    return this.businesses.save(business);
  }

  // Called after a successful payment (see PaymentService) — FR-12.1/12.5:
  // grandfathered businesses get a permanent discount rather than
  // free-forever when they convert.
  async applyTierUpgrade(businessId: string, tier: SubscriptionTier, ownerId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this business.');
    }
    business.tier = tier;
    business.subscriptionStatus = 'ACTIVE' as any;
    business.gracePeriodEndsAt = null;
    // A real paid upgrade supersedes any trial in progress.
    business.isTrialing = false;
    business.trialEndsAt = null;
    return this.businesses.save(business);
  }
}
