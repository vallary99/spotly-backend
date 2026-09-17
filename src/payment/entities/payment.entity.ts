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
import { Business } from '../../business/entities/business.entity';
// From the standalone file, not business.entity.ts — see that file's
// own comment for why (a circular-import bug this exact import caused).
import { SubscriptionTier } from '../../business/entities/subscription-tier.enum';

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

  @ManyToOne(() => Business, (business) => business.payments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.MPESA,
  })
  provider: PaymentProvider;

  @Column({ type: 'enum', enum: PaymentPurpose })
  purpose: PaymentPurpose;

  // Only meaningful for SUBSCRIPTION purpose — which tier this payment
  // is upgrading to. Was never persisted at all before (Val, Sep
  // 2026's investigation surfaced this) — targetTier existed on the
  // initiate DTO to compute the correct price, but nothing carried it
  // through to resolution, so a successful payment updated
  // subscriptionStatus/gracePeriodEndsAt but never actually changed
  // business.tier. A paying business could complete a real M-Pesa
  // charge and never receive the upgrade they paid for.
  @Column({ type: 'enum', enum: SubscriptionTier, nullable: true })
  targetTier: SubscriptionTier | null;

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

  @Column({ type: 'varchar', nullable: true })
  mpesaReceiptNumber: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rawCallback: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
