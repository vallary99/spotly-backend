import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// One row per admin-initiated send (a "campaign"), not one row per
// recipient — recipientCount + a snapshot of which businesses actually
// got it is enough for an accountability trail without a huge table.
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
