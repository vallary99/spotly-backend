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
}

export enum SubscriptionTier {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  PREMIUM = 'PREMIUM',
}

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

  @Column()
  name: string;

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

  // Rolling 30-day counters, maintained by the usage-sweep queue job
  @Column({ default: 0 })
  profileViews: number;

  @Column({ default: 0 })
  savesCount: number;

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
