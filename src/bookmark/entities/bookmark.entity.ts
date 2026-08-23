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
import { User } from '../../auth/entities/user.entity';
import { Business } from '../../business/entities/business.entity';
import { Experience } from '../../experience/entities/experience.entity';

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
  //
  // foreignKeyConstraintName pins the name the migration actually
  // created (see 1786518147139-ExperienceTicketingAndBookmarkFk, which
  // added this FK by hand rather than from a generated diff). Without
  // it TypeORM expects its own hashed name, and every
  // `migration:generate` emits a spurious drop-and-recreate of a
  // constraint that is already correct. The other two relations here
  // don't need it — their FKs were generated, so they already carry
  // TypeORM's own names.
  @ManyToOne(() => Experience, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({
    name: 'experienceId',
    foreignKeyConstraintName: 'FK_bookmarks_experienceId',
  })
  experience: Experience;

  @CreateDateColumn()
  createdAt: Date;
}
