// Extracted from business.entity.ts (Val, Sep 2026 — real production
// error) — business.entity.ts and payment.entity.ts already imported
// each other (for the payments/business relations), which worked fine
// as long as every cross-reference was a lazy thunk (@ManyToOne(() =>
// Business, ...)). Adding a DIRECT value reference — @Column({ enum:
// SubscriptionTier }) on Payment.targetTier — evaluates immediately at
// decorator time instead of lazily, and tripped over the existing
// cycle: whichever of the two files was still mid-evaluation left the
// other's export undefined at that exact moment, so TypeORM saw
// `enum: undefined` and refused to start.
//
// This file has zero imports, so nothing importing it can ever
// participate in a cycle through it. business.entity.ts re-exports
// SubscriptionTier from here, so every other file's existing
// `import { SubscriptionTier } from '.../business.entity'` keeps
// working unchanged — only payment.entity.ts needed to change its
// import source, to the one place guaranteed not to be mid-evaluation.
export enum SubscriptionTier {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  PREMIUM = 'PREMIUM',
}
