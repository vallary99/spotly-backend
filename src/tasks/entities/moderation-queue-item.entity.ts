import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// Human spot-check worklist (FR-8.4), separate from Media.status so
// moderators have a dedicated queue independent of publish state.
@Entity('moderation_queue_items')
export class ModerationQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  mediaId: string;

  @Column()
  reason: 'routine_spot_check' | 'duplicate_hash_flag' | 'user_report';

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
