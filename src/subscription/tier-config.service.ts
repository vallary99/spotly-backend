import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TierConfig } from '../entities/tier-config.entity';
import { SubscriptionTier } from '../entities/business.entity';
import { TIER_LIMITS, TierLimit } from './tier-limits';

// Single source of truth for subscription tier pricing/limits, backed by
// the database (see TierConfig entity) instead of hardcoded in
// tier-limits.ts, so it's editable without a code deploy — see
// SubscriptionService.updateTier() for where this is currently exposed.
//
// NOTE: this is deliberately reachable by any authenticated business
// owner for now, not gated behind a real admin permission — a proper
// admin project (with its own separate access point) is planned but
// explicitly deferred, per instruction. Anyone touching this later
// should add a real permission check before this ships to real users.
//
// tier-limits.ts's TIER_LIMITS constant is kept only as the one-time
// seed data for a fresh database — every other part of the app should
// go through this service, not that constant, directly.
@Injectable()
export class TierConfigService implements OnModuleInit {
  constructor(@InjectRepository(TierConfig) private repo: Repository<TierConfig>) {}

  // Runs once at boot. If the tier_configs table is empty (fresh
  // database, or upgrading from before this feature existed), seeds it
  // from tier-limits.ts's original hardcoded values, so behavior is
  // identical to before until someone actually edits a tier through the
  // dashboard.
  async onModuleInit() {
    const count = await this.repo.count();
    if (count > 0) return;
    const rows = Object.entries(TIER_LIMITS).map(([tier, limits]) =>
      this.repo.create({ tier: tier as SubscriptionTier, ...limits }),
    );
    await this.repo.save(rows);
  }

  async getAll(): Promise<Record<SubscriptionTier, TierLimit>> {
    const rows = await this.repo.find();
    const result = {} as Record<SubscriptionTier, TierLimit>;
    for (const row of rows) {
      result[row.tier] = this.toLimit(row);
    }
    return result;
  }

  async getLimits(tier: SubscriptionTier): Promise<TierLimit> {
    const row = await this.repo.findOne({ where: { tier } });
    if (!row) {
      // Shouldn't happen once seeded, but fall back to the hardcoded
      // default rather than throwing, so a missing row never blocks a
      // real upload/experience-creation request.
      return TIER_LIMITS[tier];
    }
    return this.toLimit(row);
  }

  // Partial update — only provided fields change, so editing just the
  // price doesn't require resending every other limit too.
  async updateTier(tier: SubscriptionTier, dto: Partial<TierLimit>): Promise<TierLimit> {
    const row = await this.repo.findOne({ where: { tier } });
    if (!row) {
      throw new Error(`No tier config row for ${tier} — this should have been seeded at boot.`);
    }
    Object.assign(row, dto);
    await this.repo.save(row);
    // Re-fetch rather than returning the in-memory `row`: TypeORM's
    // save() correctly ignores `undefined`-valued fields when building
    // the SQL UPDATE (so an unset field in a partial DTO is left
    // untouched in the database, which is correct), but the in-memory
    // object still carries those `undefined`s from Object.assign above —
    // returning it as-is produces a response that looks like several
    // fields were wiped, even though the actual persisted data is fine.
    // Re-fetching guarantees the response reflects true database state.
    const fresh = await this.repo.findOneOrFail({ where: { tier } });
    return this.toLimit(fresh);
  }

  private toLimit(row: TierConfig): TierLimit {
    return {
      priceKes: row.priceKes,
      photos: row.photos,
      videos: row.videos,
      videoMaxSeconds: row.videoMaxSeconds,
      concurrentExperiences: row.concurrentExperiences,
      monthlyExperiencesIncluded: row.monthlyExperiencesIncluded,
      extraFeatures: row.extraFeatures ?? [],
      experienceAddonPriceKes: row.experienceAddonPriceKes,
    };
  }
}
