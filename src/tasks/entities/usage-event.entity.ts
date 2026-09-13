import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';

// Append-only log backing the profileViews / savesCount / sharesCount
// aggregates on Business. A scheduled sweep
// (UsageService.sweepRollingCounters, run hourly by SchedulerService)
// rolls this table up into all-time totals rather than counting live
// on every page view. Was a rolling 30-day window until Val (Sep 2026)
// asked for plain lifetime totals "until we introduce an analytics
// page" — the underlying event log is unchanged either way, so a
// proper time-windowed analytics view can always be rebuilt from this
// same table later without needing new tracking.
@Entity('usage_events')
@Index(['businessId', 'createdAt'])
export class UsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.usageEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  type: 'view' | 'save' | 'share';

  @CreateDateColumn()
  createdAt: Date;
}
