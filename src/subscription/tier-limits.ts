import { SubscriptionTier } from '../business/entities/business.entity';

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
    videoMaxSeconds: 15,
    concurrentExperiences: 0, // pay-per-event add-on only
    monthlyExperiencesIncluded: 0,
    extraFeatures: [],
    experienceAddonPriceKes: 500, // no subscription revenue at all on this tier, so the add-on carries more of the real cost
  },
  // Displayed to users as "Featured" (the GROWTH enum value itself is
  // kept as-is — renaming it would mean a DB migration touching every
  // existing business's `tier` column and every Payment/trial row that
  // references it, for a purely cosmetic change; the frontend maps
  // GROWTH -> "Featured" for display, see tierLabel() in dashboard).
  [SubscriptionTier.GROWTH]: {
    priceKes: 1500,
    photos: 15,
    videos: 2,
    videoMaxSeconds: 60,
    concurrentExperiences: null, // governed by monthlyExperiencesIncluded + per-event add-on, not a live cap — see ExperienceService.create
    monthlyExperiencesIncluded: 5,
    // "Occasional homepage featuring" is enforced in HomeService.getHome
    // (a rotating slot reserved for GROWTH/PREMIUM businesses), not just
    // a label — see the comment there.
    extraFeatures: ['Occasional homepage featuring'],
    experienceAddonPriceKes: 300,
  },
  [SubscriptionTier.PREMIUM]: {
    priceKes: 3000,
    photos: 30,
    videos: 5,
    videoMaxSeconds: 90,
    concurrentExperiences: 10, // concurrently-live cap, not monthly (FR-11.2)
    monthlyExperiencesIncluded: null,
    // "Priority search placement" is enforced in BusinessService.findAll
    // (tier-ordered results); "Occasional homepage featuring" in
    // HomeService.getHome, same mechanism as GROWTH above. "Featured on
    // Spotly social media" is a manual/operational promise (your team
    // posting about a business), not something the app can automate —
    // kept here only as a marketing bullet.
    extraFeatures: ['Priority search placement', 'Occasional homepage featuring', 'Featured on Spotly social media'],
    experienceAddonPriceKes: 300,
  },
};

// Usage-triggered upgrade thresholds (FR-12.2)
export const UPGRADE_THRESHOLD = {
  profileViews: 500,
  saves: 40,
  windowDays: 30,
};
