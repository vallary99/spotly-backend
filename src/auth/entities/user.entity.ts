import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { Review } from '../../review/entities/review.entity';
import { Bookmark } from '../../bookmark/entities/bookmark.entity';

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

  // Email-ownership verification — same exact pattern as the
  // password-reset fields above, see AuthService.verifyEmail/
  // resendVerificationEmail. Defaults false for new signups; existing
  // accounts were backfilled to true when this was added (Val, Sep
  // 2026), so this only affects new signups going forward, not anyone
  // already using the app.
  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiresAt: Date | null;

  @Column()
  name: string;

  // email | google — google is simulated in MVP per BRD Section 11
  @Column({ default: 'email' })
  authProvider: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.REGISTERED })
  role: UserRole;

  // Stamped on every token issuance (see AuthService.issueToken) —
  // login, OAuth, and email verification all count as "active." Null
  // means never logged in since this was added (Val, Sep 2026).
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  // Restricts posting NEW reviews anywhere on the platform — not a
  // full account suspension, the user can still browse, save, and use
  // everything else normally (Val, Sep 2026: "review-posting
  // restriction only, but they cannot do reviews for any business" —
  // deliberately platform-wide, not scoped to one business, since
  // someone spamming fake reviews on one business is a bad-faith
  // actor generally, not just a problem for that one business).
  // Existing reviews are untouched; this only blocks new ones (see
  // ReviewService.create's check).
  @Column({ default: false })
  reviewsSuspended: boolean;

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
