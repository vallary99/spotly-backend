import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Media } from '../../media/entities/media.entity';
import { Experience } from '../../experience/entities/experience.entity';
import { Review } from '../../review/entities/review.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { UsageEvent } from '../../tasks/entities/usage-event.entity';
import { Bookmark } from '../../bookmark/entities/bookmark.entity';

export enum BusinessType {
  VENUE = 'VENUE',
  EXPERIENCE_HOST = 'EXPERIENCE_HOST',
  // A third onboarding path (Val, Sep 2026) — makers whose "listing" is
  // really a product catalogue, not a venue or a bookable experience.
  // Gated by approvalStatus below rather than being immediately live
  // like the other two types, since the whole point is verifying the
  // "actually made in Kenya" claim before anything publishes.
  MADE_IN_KENYA = 'MADE_IN_KENYA',
}

export enum MadeInKenyaCategory {
  FASHION = 'FASHION',
  BEAUTY = 'BEAUTY',
  ART_CRAFTS = 'ART_CRAFTS',
  JEWELLERY_ACCESSORIES = 'JEWELLERY_ACCESSORIES',
  GIFTS_LIFESTYLE = 'GIFTS_LIFESTYLE',
}

export enum ApprovalStatus {
  // Default APPROVED for Venue/Experience Host — this gate only
  // actually matters for MADE_IN_KENYA; the other two types have never
  // needed manual sign-off before publishing and shouldn't start now.
  APPROVED = 'APPROVED',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
}

export { SubscriptionTier } from './subscription-tier.enum';
import { SubscriptionTier } from './subscription-tier.enum';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  DOWNGRADED = 'DOWNGRADED',
}

export enum ReservationPolicy {
  RESERVATION_ONLY = 'RESERVATION_ONLY',
  WALK_IN_ONLY = 'WALK_IN_ONLY',
  BOTH = 'BOTH',
}

export enum ListingStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  // Still discoverable (has at least one photo, unlike INACTIVE) but
  // meaningfully underusing its free-tier allowance — e.g. one photo
  // out of five, months in. A DIFFERENT concept from INACTIVE, which
  // means zero photos and actually hidden from public search; DORMANT
  // businesses are fully visible the whole time (Val, Sep 2026: folded
  // into this same field rather than a separate flag, since none of
  // these values actually gate visibility anywhere in the codebase —
  // this field is informational, not enforcement). Paid tiers never
  // get this — they already know why they're paying (Val).
  DORMANT = 'DORMANT',
}

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ownerId: string;

  @OneToOne(() => User, (user) => user.business)
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ type: 'enum', enum: BusinessType })
  type: BusinessType;

  // Only meaningful when type === MADE_IN_KENYA; null otherwise. One
  // category per business, not a multi-select (Val, Sep 2026) — each
  // product's own category is simply whichever one its business has,
  // no separate per-product field needed.
  @Column({ type: 'enum', enum: MadeInKenyaCategory, nullable: true })
  madeInKenyaCategory: MadeInKenyaCategory | null;

  // Drives the new "Business Approvals" admin action — a Made in Kenya
  // business starts PENDING and can't post products or show publicly
  // until approved. Venue/Experience Host never touch this beyond
  // their default.
  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.APPROVED })
  approvalStatus: ApprovalStatus;

  @Column()
  name: string;

  // Val, Sep 2026 SEO spec — the human-readable part of the permanent
  // public URL (/{city}/{slug}), generated once at creation and never
  // auto-regenerated on a later rename (Section 1: "the URL should
  // remain stable"). Unique per city, not globally — see the composite
  // index in the migration — since the URL already disambiguates by
  // city, two businesses in different cities can share a slug with no
  // collision. Nullable only because existing rows need backfilling by
  // migration before this can be made NOT NULL.
  @Index()
  @Column({ type: 'varchar', nullable: true })
  slug: string | null;

  // Multiple categories (max 5 configurable by admin)
  @Column({ type: 'text', array: true, default: [] })
  categories: string[]; // Replaces old single 'category' column

  @Column({ type: 'float', nullable: true })
  budgetMin: number; // Optional minimum budget

  @Column({ type: 'float', nullable: true })
  budgetMax: number; // Optional maximum budget

  @Column({ type: 'enum', enum: ReservationPolicy, nullable: true })
  reservationPolicy: ReservationPolicy; // RESERVATION_ONLY | WALK_IN_ONLY | BOTH

  @Column({ nullable: true, type: 'text' })
  description: string;

  // Separate phone numbers for calls and WhatsApp
  @Column({ nullable: true })
  callPhone: string; // For phone calls

  @Column({ nullable: true })
  whatsappPhone: string; // For WhatsApp (opens web or app)

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  website: string;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ type: 'jsonb', nullable: true })
  hours: Record<string, { open: string; close: string } | null>;

  @Column({ type: 'text', array: true, default: [] })
  amenities: string[];

  @Index()
  @Column({ nullable: true, default: 'Nairobi' })
  city: string;

  @Index()
  @Column({ nullable: true })
  neighborhood: string; // Westlands | Kilimani | CBD | ...

  @Column({
    type: 'enum',
    enum: SubscriptionTier,
    default: SubscriptionTier.STARTER,
  })
  tier: SubscriptionTier;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  subscriptionStatus: SubscriptionStatus;

  @Column({ default: false })
  isGrandfathered: boolean; // one of the first 200 free-cohort businesses

  // One of the first 100 businesses, auto-enrolled in premium trial
  // but must still explicitly opt-in (activate the offer)
  @Column({ default: false })
  firstCohortPremiumTrial: boolean;

  // Admin-set via the reward program (see AdminController's
  // businesses/discount endpoint) — a plain percentage (0-100) applied
  // to whatever tier the business upgrades to, checked server-side at
  // charge time (see PaymentService.initiate), not just displayed.
  // Distinct from isGrandfathered above: that's a fixed historical
  // cohort marker, this is an ordinary, editable numeric discount any
  // business could have for any reason an admin campaign defines.
  @Column({ type: 'int', default: 0 })
  discountPercent: number;

  // Free-trial offer system — the alternative to a discount for Starter
  // businesses specifically (a % off KES 0 means nothing, so instead
  // they can be offered a taste of a paid tier at no cost). Two-step by
  // design: an admin grants ELIGIBILITY (these two fields), but the
  // business owner has to actually click "Start Trial" themselves (see
  // BusinessController's start-trial endpoint) for the clock to start —
  // otherwise a trial granted today could silently burn down before the
  // owner even notices it exists.
  @Column({ type: 'enum', enum: SubscriptionTier, nullable: true })
  trialOfferTier: SubscriptionTier | null;

  @Column({ type: 'int', nullable: true })
  trialOfferDays: number | null;

  // Set only once the owner activates the offer above. While this is in
  // the future, `tier` has already been bumped to trialOfferTier — see
  // BusinessService's trial-expiry check, which reverts `tier` back to
  // STARTER once this passes (same lazy-check-at-read-time pattern as
  // suspension's suspendedUntil, not a scheduled job).
  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({ default: false })
  isTrialing: boolean;

  // Self-declared at registration used to be possible; now admin-only
  // (see AdminController's businesses/:id/hidden-gem endpoint) — "the
  // system will automatically pick that, or give the admin the power to
  // choose that." Deliberately separate from `category`: this is a
  // quality/vibe tag that can apply to a business of ANY category, not
  // a business type of its own, which is why it's a boolean here rather
  // than living in the category taxonomy.
  @Column({ default: false })
  isHiddenGem: boolean;

  // Owner-chosen photo to use as this business's card/homepage
  // thumbnail. Null means "no explicit choice made" — the app falls
  // back to the oldest approved photo (first ever uploaded), same
  // behavior as before this column existed. No FK constraint (media
  // rows can be deleted independently); MediaService/BusinessService
  // both defensively fall back to the default when this points at a
  // photo that's since been removed or unapproved.
  @Column({ type: 'varchar', nullable: true })
  coverMediaId: string | null;

  // Admin-only suspension (see AdminController). A suspended business is
  // excluded from public listing/search/home (same EXISTS-based gate as
  // "must have an approved photo" — see applyListingFilters) but keeps
  // its data intact; the owner can still see and edit their own profile
  // in the dashboard so it's not a silent, confusing removal, they see
  // exactly why they're not showing up publicly.
  @Column({ default: false })
  isSuspended: boolean;

  // null = indefinite suspension (admin must manually lift it); a real
  // date = auto-expires, checked alongside isSuspended in the listing
  // gate rather than needing a scheduled job to flip a boolean back.
  @Column({ type: 'timestamptz', nullable: true })
  suspendedUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  suspensionReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  gracePeriodEndsAt: Date | null;

  // Discoverability lifecycle — separate from subscriptionStatus above,
  // which is about billing, not visibility. PENDING from creation until
  // the first photo is approved (see MediaService.submitForQualityCheck,
  // which flips this to ACTIVE at that moment); a still-PENDING business
  // gets reminder emails every 7 days for a month (see
  // ListingLifecycleService.sweepPendingListings), then INACTIVE after
  // 30 days with still no photo. Uploading a photo at ANY point —
  // including after going INACTIVE — flips this back to ACTIVE
  // immediately; INACTIVE isn't a ban, just a "gone cold" label (Val,
  // Sep 2026).
  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.PENDING })
  listingStatus: ListingStatus;

  // Null until the first reminder fires; re-stamped on every reminder
  // after that. The sweep computes "7 days since whichever is more
  // recent, this or createdAt" rather than hardcoding calendar days 7/
  // 14/21/28 from creation — same result, but survives the sweep
  // running late or being down for a stretch without double-sending or
  // permanently losing a cycle.
  @Column({ type: 'timestamptz', nullable: true })
  lastPendingReminderAt: Date | null;

  // Stamped the moment listingStatus first becomes ACTIVE (see
  // MediaService.submitForQualityCheck) — distinct from createdAt,
  // which is just when the business record was made; a business can
  // sit PENDING for days or weeks before actually going live with its
  // first approved photo (Val, Sep 2026: "went live on"). Once set,
  // this never changes again — a later INACTIVE→ACTIVE revival (after
  // 30 days with no photo) doesn't overwrite the ORIGINAL go-live
  // moment, since that's still a true historical fact about the
  // business.
  @Column({ type: 'timestamptz', nullable: true })
  wentLiveAt: Date | null;

  // Stamped when the one-time "you're underusing your gallery" nudge
  // fires (see ListingLifecycleService.sweepUnderusedGalleries) — two
  // weeks after wentLiveAt, if still under half the tier's photo
  // allowance. If still under half two weeks after THIS timestamp, the
  // business goes DORMANT. Cleared (along with DORMANT, back to
  // ACTIVE) the moment the business crosses back over half its
  // allowance — a slow month doesn't leave a business stuck labeled
  // DORMANT forever after one later burst of uploads (Val, Sep 2026).
  @Column({ type: 'timestamptz', nullable: true })
  galleryNudgeSentAt: Date | null;

  // Lifetime totals (Val, Sep 2026: "let's have them as total until we
  // introduce an analytics page" — was a rolling 30-day window before
  // this), maintained by the usage-sweep queue job. The underlying
  // usage_events log is untouched either way, so a real time-windowed
  // view can be rebuilt from it later without new tracking.
  @Column({ default: 0 })
  profileViews: number;

  @Column({ default: 0 })
  savesCount: number;

  @Column({ default: 0 })
  sharesCount: number;

  // Incremented when an EXPERIENCE_ADDON payment succeeds, decremented
  // when ExperienceService.create() consumes one to allow an experience
  // beyond the tier's included allowance (Val, Sep 2026) — completes a
  // feature that was already fully priced in tier config
  // (experienceAddonPriceKes) but never actually wired to anything,
  // which is why a Starter-tier Experience Host had no way to create
  // an experience at all, paid or not.
  @Column({ default: 0 })
  paidExperienceAddonsAvailable: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Media, (media) => media.business)
  media: Media[];

  @OneToMany(() => Experience, (experience) => experience.business)
  experiences: Experience[];

  @OneToMany(() => Review, (review) => review.business)
  reviews: Review[];

  @OneToMany(() => Payment, (payment) => payment.business)
  payments: Payment[];

  @OneToMany(() => UsageEvent, (event) => event.business)
  usageEvents: UsageEvent[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.business)
  bookmarks: Bookmark[];
}
