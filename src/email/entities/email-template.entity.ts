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
