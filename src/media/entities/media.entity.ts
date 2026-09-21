import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';

export enum MediaType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
}

export enum MediaStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED', // passed the instant gate but flagged by async review
}

@Entity('media')
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.media, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'enum', enum: MediaType })
  type: MediaType;

  @Column()
  url: string;

  @Column()
  storageKey: string;

  @Column({ type: 'enum', enum: MediaStatus, default: MediaStatus.PENDING })
  status: MediaStatus;

  @Column({ nullable: true })
  rejectReason: string;

  @Column({ nullable: true, type: 'int' })
  durationSeconds: number;

  @Column({ default: false })
  isDuplicateFlag: boolean;

  @Index()
  @Column({ nullable: true })
  perceptualHash: string;

  // Val, Sep 2026: "allow user to move the images they upload... so it
  // can fit and show what they prioritize most, not just having a
  // default crop line." Percentages (0-100) for CSS object-position;
  // null means the display default (50/50, i.e. plain center-crop) —
  // deliberately not backfilled to 50/50 on existing rows, since null
  // and "centered on purpose" mean the same thing at render time and
  // there's no need to distinguish them.
  @Column({ type: 'float', nullable: true })
  focalX: number | null;

  @Column({ type: 'float', nullable: true })
  focalY: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
