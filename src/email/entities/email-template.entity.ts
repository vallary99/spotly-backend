import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Admin-authored templates for broadcast emails (reward campaigns,
// platform announcements, etc.) — subject/body support {{variable}}
// placeholders, rendered per-recipient at send time (see
// AdminEmailService.renderTemplate). Distinct from the transactional
// emails in EmailService (welcome, business-live), which are triggered
// by app events, not an admin action.
@Entity('email_templates')
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stable lookup handle for the 5 built-in templates (WELCOME_BUSINESS,
  // SUSPENSION, DEACTIVATION, DISCOUNT_OFFER, FREE_TRIAL_OFFER) that the
  // app looks up by code, not by name — an admin renaming "Business
  // Suspended" to something friendlier shouldn't break the automatic
  // send that happens on suspension. Null for any template an admin
  // creates themselves through the dashboard; those are pure ad-hoc
  // broadcasts, never looked up programmatically. See EmailService's
  // getBuiltInTemplate.
  @Column({ type: 'varchar', nullable: true, unique: true })
  key: string | null;

  @Column()
  name: string; // admin-facing label, e.g. "Q3 Growth discount offer"

  @Column()
  subject: string; // supports {{businessName}} etc.

  @Column({ type: 'text' })
  body: string; // HTML, supports {{businessName}}, {{ownerName}}, {{tier}}, {{discountPercent}}, {{city}}, {{category}}

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
