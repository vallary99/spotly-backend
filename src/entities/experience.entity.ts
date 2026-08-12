import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';

@Entity('experiences')
export class Experience {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.experiences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', array: true, default: [] })
  images: string[];

  @Index()
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ nullable: true })
  location: string; // treated as a free-text address, same as Business.address — no separate geocoding yet

  @Column({ type: 'float', nullable: true })
  price: number;

  // Replaces the old `category` field — category never had any actual
  // use (no experience filtering by it existed anywhere in the
  // frontend), whereas a ticketing link is something real events
  // genuinely need: where to actually buy in, if it's not a simple
  // walk-in.
  @Column({ type: 'varchar', nullable: true })
  ticketingLink: string | null;

  // flipped by the scheduled expiry job once startsAt/endsAt passes,
  // at which point the experience becomes part of Hosting History
  @Column({ default: false })
  isExpired: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
