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

export enum OfferScheduleType {
  SINGLE_DAY = 'SINGLE_DAY',
  DATE_RANGE = 'DATE_RANGE',
  WEEKLY = 'WEEKLY',
}

// A promotional deal ("buy one get one free burger week"), deliberately
// NOT built on Experience despite the surface similarity — an Offer
// isn't bookable, has no price-per-attendee, and needs a scheduling
// concept (specific recurring days of the week) Experience has never
// had (Val, Sep 2026). "Whether this is currently active" is computed
// at query time from these dates (see OfferService.applyActiveFilter),
// not a stored flag updated by a sweep — Experience's isExpired flag
// depends on a sweep that (see spotly-api's README) isn't reliably
// running on the current serverless deployment, and there was no
// reason to build a new feature with that same weakness.
@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: OfferScheduleType })
  scheduleType: OfferScheduleType;

  // SINGLE_DAY: the one day this runs. DATE_RANGE: the first day.
  // WEEKLY: the day this recurring pattern begins.
  @Column({ type: 'date' })
  startDate: string;

  // DATE_RANGE: required, the last day. WEEKLY: optional — null means
  // the recurring pattern has no end date yet. Unused (null) for
  // SINGLE_DAY.
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  // Only meaningful for WEEKLY — e.g. ['TUESDAY', 'THURSDAY']. Empty
  // for the other two schedule types. Stored as plain strings rather
  // than a Postgres enum array for simplicity, validated at the DTO
  // layer instead.
  @Column({ type: 'text', array: true, default: [] })
  daysOfWeek: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
