import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Business } from './business.entity';
import { Review } from './review.entity';
import { Bookmark } from './bookmark.entity';

export enum UserRole {
  REGISTERED = 'REGISTERED',
  BUSINESS_OWNER = 'BUSINESS_OWNER',
  // Platform-operator role for the separate admin app (spotly-admin),
  // not the consumer app — see AdminModule and the admin.* endpoints
  // throughout this codebase, all gated with @Roles(UserRole.ADMIN).
  // No self-serve way to become one; grant it via a direct DB update:
  // UPDATE users SET role='ADMIN' WHERE email=...
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  passwordHash: string;

  // Forgot-password flow (see AuthService.requestPasswordReset/
  // resetPassword) — a random token + expiry, single-use, cleared once
  // consumed. Not a separate table: one active reset per user at a time
  // is the correct behavior anyway, a new request should invalidate any
  // previous one, which a simple overwrite gives for free.
  @Column({ type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt: Date | null;

  @Column()
  name: string;

  // email | google — google is simulated in MVP per BRD Section 11
  @Column({ default: 'email' })
  authProvider: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.REGISTERED })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => Business, (business) => business.owner)
  business: Business;

  @OneToMany(() => Review, (review) => review.user)
  reviews: Review[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user)
  bookmarks: Bookmark[];
}
