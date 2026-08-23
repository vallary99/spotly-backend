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

// Append-only log backing the profileViews / savesCount aggregates on
// Business. A scheduled sweep (UsageService.sweepRollingCounters, run
// hourly by SchedulerService) rolls this table up into the 30-day
// counters rather than counting live on every page view.
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
  type: 'view' | 'save';

  @CreateDateColumn()
  createdAt: Date;
}
