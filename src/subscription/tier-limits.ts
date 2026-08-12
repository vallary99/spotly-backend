import { SubscriptionTier } from '../entities/business.entity';

export interface TierLimit {
  priceKes: number;
  photos: number;
  videos: number;
  videoMaxSeconds: number;
  concurrentExperiences: number | null; // null = unlimited count but still capped by videoMaxSeconds etc; Premium uses a real number (10)
  monthlyExperiencesIncluded: number | null;
  extraFeatures: string[];
  // FR-13.1's "per-event add-on" fee for hosting an experience beyond
  // what a tier includes — was previously trusted from the client
  // entirely (see PaymentService.initiate before this field existed),
  // the same class of bug the subscription-amount fix closed earlier.
  experienceAddonPriceKes: number;
}

// PRD Section 14 / BRD FR-11.1-11.2 — enforced server-side, not just in the UI.
// This is only the SEED data for a fresh database (see TierConfigService) —
// every part of the app reads live values from the database, not this
// constant directly, so a change here only takes effect for a database
// that hasn't been seeded yet.
export const TIER_LIMITS: Record<SubscriptionTier, TierLimit> = {
  [SubscriptionTier.STARTER]: {
    priceKes: 0,
    photos: 5,
    videos: 1,
    videoMaxSeconds: 60,
    concurrentExperiences: 0, // pay-per-event add-on only
    monthlyExperiencesIncluded: 0,
    extraFeatures: [],
    experienceAddonPriceKes: 500, // no subscription revenue at all on this tier, so the add-on carries more of the real cost
  },
  [SubscriptionTier.GROWTH]: {
    priceKes: 1500,
    photos: 20,
    videos: 3,
    videoMaxSeconds: 60,
    concurrentExperiences: null, // governed by monthly included + per-event add-on, not a live cap
    monthlyExperiencesIncluded: 3,
    extraFeatures: ['Basic business profile', 'Standard discovery'],
    experienceAddonPriceKes: 300,
  },
  [SubscriptionTier.PREMIUM]: {
    priceKes: 4500,
    photos: 100,
    // Real cap, not "unlimited" — storing arbitrary video volume gets
    // expensive fast, and 50 is still a materially generous jump from
    // Growth's 3 without an open-ended cost/abuse risk.
    videos: 50,
    videoMaxSeconds: 90,
    concurrentExperiences: 10, // concurrently-live cap, not monthly (FR-11.2)
    monthlyExperiencesIncluded: null,
    extraFeatures: ['Featured business profile', 'Priority discovery'],
    experienceAddonPriceKes: 300,
  },
};

// Usage-triggered upgrade thresholds (FR-12.2)
export const UPGRADE_THRESHOLD = {
  profileViews: 500,
  saves: 40,
  windowDays: 30,
};
