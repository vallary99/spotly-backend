import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../business/entities/business.entity';
import { EmailService } from '../email/email.service';

export interface AdminBusinessFilters {
  city?: string;
  category?: string;
  tier?: string;
  isSuspended?: boolean;
  isHiddenGem?: boolean;
  registeredAfter?: string; // ISO date
  registeredBefore?: string;
  minProfileViews?: number;
  minSavesCount?: number;
  sortBy?: 'createdAt' | 'profileViews' | 'savesCount' | 'name';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

@Injectable()
export class AdminBusinessService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    private email: EmailService,
  ) {}

  // GET /admin/businesses — the filterable table. Every filter below is
  // an independent andWhere, so any combination applies concurrently
  // (e.g. city=Nairobi + tier=STARTER + registeredAfter=... all at
  // once) rather than one replacing another — same "concurrent filters"
  // principle as the consumer-facing quick filters.
  async findAll(filters: AdminBusinessFilters) {
    const qb = this.businesses.createQueryBuilder('b').leftJoinAndSelect('b.owner', 'owner');

    if (filters.city) qb.andWhere('b.city = :city', { city: filters.city });
    // `categories` is a text[] column (a business can hold up to 5), so
    // this checks array membership rather than equality — see the same
    // fix in BusinessService.applyListingFilters.
    if (filters.category) qb.andWhere(':category = ANY(b.categories)', { category: filters.category });
    if (filters.tier) qb.andWhere('b.tier = :tier', { tier: filters.tier });
    if (filters.isSuspended !== undefined) qb.andWhere('b."isSuspended" = :sus', { sus: filters.isSuspended });
    if (filters.isHiddenGem !== undefined) qb.andWhere('b."isHiddenGem" = :hg', { hg: filters.isHiddenGem });
    if (filters.registeredAfter) qb.andWhere('b."createdAt" >= :after', { after: filters.registeredAfter });
    if (filters.registeredBefore) qb.andWhere('b."createdAt" <= :before', { before: filters.registeredBefore });
    if (filters.minProfileViews != null) qb.andWhere('b."profileViews" >= :mpv', { mpv: filters.minProfileViews });
    if (filters.minSavesCount != null) qb.andWhere('b."savesCount" >= :msc', { msc: filters.minSavesCount });

    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'DESC';
    // "Top 100 registered in a city" = sortBy createdAt (or profileViews
    // for "best-performing" instead of "earliest") + city filter above +
    // limit 100 — no separate "topN" concept needed, this combination
    // covers it and anything else built the same way.
    qb.orderBy(`b.${sortBy}`, sortOrder).take(filters.limit ?? 50).skip(filters.offset ?? 0);

    const [results, total] = await qb.getManyAndCount();
    return {
      total,
      results: results.map((b) => ({
        id: b.id,
        name: b.name,
        // Kept as a single display string for the admin table (which
        // still has one "Category" column) even though a business can
        // now hold up to 5 — joined rather than picking just the first
        // so nothing is silently hidden from the admin's view.
        category: (b.categories && b.categories.length > 0) ? b.categories.join(', ') : '',
        city: b.city,
        neighborhood: b.neighborhood,
        tier: b.tier,
        subscriptionStatus: b.subscriptionStatus,
        profileViews: b.profileViews,
        savesCount: b.savesCount,
        isSuspended: b.isSuspended,
        suspendedUntil: b.suspendedUntil,
        isHiddenGem: b.isHiddenGem,
        isGrandfathered: b.isGrandfathered,
        discountPercent: b.discountPercent,
        isTrialing: b.isTrialing,
        trialOfferTier: b.trialOfferTier,
        ownerEmail: b.owner?.email,
        ownerName: b.owner?.name,
        createdAt: b.createdAt,
      })),
    };
  }

  // PUT /admin/businesses/:id/suspend
  // PUT /admin/businesses/:id/suspend — also used by the admin UI's
  // lighter-weight "Deactivate" action (no reason required there, see
  // SuspendBusinessDto), which is why reason defaults rather than being
  // required at this layer too. Notifies the owner either way — an
  // actual explanation for a real suspension, a lighter no-explanation
  // notice for a routine deactivation — using the matching built-in
  // template (see EmailService.sendSuspensionEmail/sendDeactivationEmail).
  // Neither type of email existed before this; suspending/deactivating
  // silently left the owner with no idea their listing had disappeared.
  async suspend(id: string, reason: string | undefined, until: string | null) {
    const business = await this.businesses.findOne({ where: { id }, relations: ['owner'] });
    if (!business) throw new NotFoundException('Business not found.');
    const isRealSuspension = !!reason;
    business.isSuspended = true;
    business.suspensionReason = reason ?? 'Deactivated by admin.';
    business.suspendedUntil = until ? new Date(until) : null;
    const saved = await this.businesses.save(business);

    if (business.owner?.email) {
      if (isRealSuspension) {
        this.email.queueSuspensionEmail(business.owner.email, business.owner.name, business.name, reason as string);
      } else {
        this.email.queueDeactivationEmail(business.owner.email, business.owner.name, business.name);
      }
    }

    return saved;
  }

  // PUT /admin/businesses/:id/unsuspend
  async unsuspend(id: string) {
    const business = await this.businesses.findOne({ where: { id } });
    if (!business) throw new NotFoundException('Business not found.');
    business.isSuspended = false;
    business.suspensionReason = null;
    business.suspendedUntil = null;
    return this.businesses.save(business);
  }

  // PUT /admin/businesses/:id/hidden-gem — fulfills "the system will
  // automatically pick that, or give the admin the power to choose that
  // in the admin dashboard later." No automatic detection exists yet,
  // so this is currently the only way isHiddenGem ever becomes true.
  async setHiddenGem(id: string, value: boolean) {
    const business = await this.businesses.findOne({ where: { id } });
    if (!business) throw new NotFoundException('Business not found.');
    business.isHiddenGem = value;
    return this.businesses.save(business);
  }

  // POST /admin/businesses/discount-campaign — the reward program.
  // Applies a discount to every business matching the given filters in
  // one shot, reusing the exact same filter shape as findAll() above so
  // "top 100 registered in Nairobi" (or any other combination) means
  // the same thing whether you're just looking at the list or about to
  // reward everyone in it.
  // POST /admin/businesses/discount-campaign — the reward program.
  // Applies a discount to every business matching the given filters in
  // one shot, reusing the exact same filter shape as findAll() above so
  // "top 100 registered in Nairobi" (or any other combination) means
  // the same set of businesses whether you're looking at the list or
  // about to reward everyone in it.
  //
  // Starter businesses are excluded, not just skipped silently — a %
  // off a free tier is meaningless, and Starter's actual upsell lever
  // is a trial (see grantTrialOffer below), not a discount.
  async applyDiscountCampaign(filters: AdminBusinessFilters, discountPercent: number) {
    if (discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException('discountPercent must be between 0 and 100.');
    }
    const { results } = await this.findAll({ ...filters, limit: filters.limit ?? 1000 });
    const eligible = results.filter((r) => r.tier !== 'STARTER');
    const excludedStarterCount = results.length - eligible.length;
    const ids = eligible.map((r) => r.id);
    if (ids.length === 0) {
      return { affected: 0, excludedStarterCount, message: 'No eligible (non-Starter) businesses matched these filters.' };
    }
    await this.businesses
      .createQueryBuilder()
      .update(Business)
      .set({ discountPercent })
      .whereInIds(ids)
      .execute();
    return { affected: ids.length, excludedStarterCount, businessIds: ids };
  }

  // POST /admin/businesses/trial-campaign — the Starter-tier equivalent
  // of a discount. Grants ELIGIBILITY only (see the entity comment on
  // trialOfferTier for why this is two-step) — the business owner still
  // has to click "Start Trial" themselves for the clock to actually
  // start.
  async grantTrialOffer(filters: AdminBusinessFilters, tier: 'GROWTH' | 'PREMIUM', days: number) {
    if (days < 1 || days > 90) {
      throw new BadRequestException('days must be between 1 and 90.');
    }
    const { results } = await this.findAll({ ...filters, tier: 'STARTER', limit: filters.limit ?? 1000 });
    const ids = results.map((r) => r.id);
    if (ids.length === 0) {
      return { affected: 0, message: 'No Starter-tier businesses matched these filters.' };
    }
    await this.businesses
      .createQueryBuilder()
      .update(Business)
      .set({ trialOfferTier: tier as any, trialOfferDays: days })
      .whereInIds(ids)
      .execute();
    return { affected: ids.length, businessIds: ids };
  }
}
