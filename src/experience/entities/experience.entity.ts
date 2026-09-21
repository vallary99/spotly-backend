import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';

// Val, Sep 2026: "pay in advance or at the venue or both" — kept in
// this same file (not extracted like SubscriptionTier had to be) since
// nothing outside the experience module needs it, so there's no
// cross-entity circular-import risk to guard against here.
export enum ExperiencePaymentTiming {
  ADVANCE = 'ADVANCE',
  AT_VENUE = 'AT_VENUE',
  EITHER = 'EITHER',
}

@Entity('experiences')
export class Experience {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.experiences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', array: true, default: [] })
  images: string[];

  // Val, Sep 2026: same "move the image to show what you prioritize
  // most" feature as Media.focalX/focalY, but images here is a plain
  // string[] rather than a proper one-row-per-image table, so this is
  // a map from image URL to its focal point instead of columns on a
  // row. Null/missing entry means center, same reasoning as Media.
  @Column({ type: 'jsonb', nullable: true })
  imageFocalPoints: Record<string, { x: number; y: number }> | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ nullable: true })
  location: string; // treated as a free-text address, same as Business.address — no separate geocoding yet

  @Column({ type: 'float', nullable: true })
  price: number;

  @Column({ type: 'float', nullable: true })
  budgetMin: number; // Optional minimum budget for this experience

  @Column({ type: 'float', nullable: true })
  budgetMax: number; // Optional maximum budget for this experience

  // Replaces the old `category` field — category never had any actual
  // use (no experience filtering by it existed anywhere in the
  // frontend), whereas a ticketing link is something real events
  // genuinely need: where to actually buy in, if it's not a simple
  // walk-in.
  @Column({ type: 'varchar', nullable: true })
  ticketingLink: string | null;

  // Val, Sep 2026: "limited or unlimited attendees" — null means
  // unlimited; a number is the actual cap. Deliberately not enforced
  // anywhere yet (no booking/RSVP system exists to count real
  // attendees against it) — it's informational for now, shown to
  // whoever's browsing, not a hard server-side limit.
  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  // Val, Sep 2026: "pay in advance or at the venue or both."
  @Column({ type: 'enum', enum: ExperiencePaymentTiming, default: ExperiencePaymentTiming.AT_VENUE })
  paymentTiming: ExperiencePaymentTiming;

  // Val, Sep 2026: an optional field for anything attendees should
  // know beyond the core listing — what to bring, parking, dress code,
  // etc. Shown behind a "More instructions" link on the public side
  // rather than always inline, since this can run long and isn't
  // essential to deciding whether to attend in the first place.
  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  // flipped by the scheduled expiry job once startsAt/endsAt passes,
  // at which point the experience becomes part of Hosting History
  @Column({ default: false })
  isExpired: boolean;

  // Val, Sep 2026: "add option to save experience draft" — a genuine
  // reversal of this entity's earlier design ("every field deliberately
  // required... not a partial one filled in later," see
  // CreateExperienceDto). A draft skips that validation and the tier
  // concurrent/monthly limit entirely (it isn't "hosted" yet, so
  // shouldn't count against either), and never appears in any public
  // query — only in the owner's own management view, until they
  // explicitly publish it (ExperienceService.publishDraft), at which
  // point full validation and the tier limit both apply for real.
  @Column({ default: false })
  isDraft: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
