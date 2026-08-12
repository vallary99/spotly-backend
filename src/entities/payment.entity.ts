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

export enum PaymentProvider {
  MPESA = 'MPESA',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum PaymentPurpose {
  SUBSCRIPTION = 'SUBSCRIPTION',
  EXPERIENCE_ADDON = 'EXPERIENCE_ADDON',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'enum', enum: PaymentProvider, default: PaymentProvider.MPESA })
  provider: PaymentProvider;

  @Column({ type: 'enum', enum: PaymentPurpose })
  purpose: PaymentPurpose;

  @Column({ type: 'float' })
  amount: number;

  @Column({ default: 'KES' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // Daraja's CheckoutRequestID — unique constraint is the idempotency
  // mechanism protecting against duplicate/retried callbacks
  @Index({ unique: true, where: '"checkoutRequestId" IS NOT NULL' })
  @Column({ nullable: true })
  checkoutRequestId: string;

  @Column({ nullable: true })
  merchantRequestId: string;

  @Column({ nullable: true })
  mpesaReceiptNumber: string;

  @Column({ type: 'jsonb', nullable: true })
  rawCallback: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
