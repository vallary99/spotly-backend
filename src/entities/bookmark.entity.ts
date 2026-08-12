import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Business } from './business.entity';
import { Experience } from './experience.entity';

@Entity('bookmarks')
@Unique(['userId', 'businessId', 'experienceId'])
export class Bookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.bookmarks)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.bookmarks, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ nullable: true })
  experienceId: string;

  // Was just a bare column before — no relation, so BookmarkService
  // could never actually load the saved experience's own details, and
  // had no way to tell an expired one from a live one. Nullable/CASCADE
  // to match the business relation right above.
  @ManyToOne(() => Experience, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'experienceId' })
  experience: Experience;

  @CreateDateColumn()
  createdAt: Date;
}
