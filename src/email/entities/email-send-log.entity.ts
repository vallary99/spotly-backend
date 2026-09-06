import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// One row per RECIPIENT business, not one row per campaign (changed
// Sep 2026 — a broadcast to 2 businesses used to log as a single
// "recipientCount: 2" row with no way to tell which two without
// opening businessIds; Val: "show the emails one by one... so the
// email shows welcome email for business A and B"). recipientCount and
// businessIds stay populated (trivially, as 1 and [businessId]) on
// every new row for backward compatibility with the couple of rows
// that predate this and never got a businessId/businessName at all.
// Part of the broader "who did what" admin audit trail alongside
// suspensions/discounts, which currently only show their *result* (the
// business row) with no record of the action itself — a real gap, but
// out of scope to fully solve here; this at least covers email sends.
@Entity('email_send_logs')
export class EmailSendLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  templateId: string | null; // null = one-off send not tied to a saved template

  @Column()
  templateName: string; // denormalized snapshot, survives the template being edited/deleted later

  @Column()
  subject: string; // rendered subject of the FIRST recipient, for a quick glance in the log

  @Column({ type: 'uuid', nullable: true })
  businessId: string | null; // the one business THIS row is about — null on rows logged before this column existed

  @Column({ type: 'varchar', nullable: true })
  businessName: string | null; // denormalized snapshot, same reasoning as templateName

  @Column({ type: 'jsonb' })
  filters: Record<string, unknown>; // the AdminBusinessFilters used to select recipients

  @Column()
  recipientCount: number;

  @Column({ type: 'jsonb' })
  businessIds: string[];

  @Column()
  sentByAdminId: string;

  @CreateDateColumn()
  createdAt: Date;
}
