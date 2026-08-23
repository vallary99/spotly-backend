import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionTier } from '../../business/entities/business.entity';

// Subscription tier definitions, editable by an admin (see admin module)
// instead of hardcoded in tier-limits.ts. Seeded on first boot from that
// file's original defaults (see tier-config.service.ts), so existing
// deployments don't lose their pricing on upgrade.
@Entity('tier_configs')
export class TierConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SubscriptionTier, unique: true })
  tier: SubscriptionTier;

  @Column({ type: 'int' })
  priceKes: number;

  @Column({ type: 'int' })
  photos: number;

  @Column({ type: 'int' })
  videos: number;

  @Column({ type: 'int' })
  videoMaxSeconds: number;

  // null = not a concurrently-live cap for this tier (governed by
  // monthlyExperiencesIncluded + pay-per-event add-on instead)
  @Column({ type: 'int', nullable: true })
  concurrentExperiences: number | null;

  // null = not a monthly-included cap for this tier (governed by
  // concurrentExperiences instead)
  @Column({ type: 'int', nullable: true })
  monthlyExperiencesIncluded: number | null;

  // Free-text marketing bullets beyond the numeric limits above, e.g.
  // "Featured business profile", "Priority discovery" — these aren't
  // enforced anywhere server-side, they're just what the tier card
  // displays underneath the hard limits.
  @Column({ type: 'text', array: true, default: [] })
  extraFeatures: string[];

  // Per-event fee for hosting an experience beyond what this tier
  // includes (FR-13.1) — computed server-side at charge time (see
  // PaymentService.initiate), not trusted from the client.
  @Column({ type: 'int', default: 300 })
  experienceAddonPriceKes: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
