import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaymentPurpose } from '../entities/payment.entity';
import { SubscriptionTier } from '../../business/entities/business.entity';

export class InitiatePaymentDto {
  @IsString()
  businessId: string;

  @IsEnum(PaymentPurpose)
  purpose: PaymentPurpose;

  // For SUBSCRIPTION purpose, this is what actually gets charged —
  // recomputed server-side from TierConfigService + the business's
  // discountPercent (see PaymentService.initiate). `amount` below is
  // NOT trusted for that purpose; a client sending an arbitrary amount
  // must not be able to change what Daraja actually charges.
  @IsOptional()
  @IsEnum(SubscriptionTier)
  targetTier?: SubscriptionTier;

  // Kept only so the client can still send its own locally-computed
  // amount for display/logging purposes — the server never trusts it
  // for either purpose. EXPERIENCE_ADDON now also recomputes server-side
  // from TierConfigService.experienceAddonPriceKes, closing what used to
  // be a real gap here (this field used to be trusted as-is for that
  // purpose, matching the exact class of bug the SUBSCRIPTION fix
  // closed earlier — an unmanipulable charge was only half-true before).
  @IsNumber()
  amount: number;

  @IsString()
  phoneNumber: string; // 2547XXXXXXXX
}
