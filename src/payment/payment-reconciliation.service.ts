import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { DarajaService } from './daraja.service';
import { PaymentService } from './payment.service';

const MINUTE = 60 * 1000;

// Daraja's callback is the primary way a payment resolves, but
// Safaricom's own docs are explicit that callbacks aren't guaranteed —
// "there are no repeat calls for failed callbacks" — which is exactly
// why the STK Push Query API exists: to actively ask, rather than wait
// forever for a push that might never arrive (Val, Sep 2026: a
// subscription silently never activating because a callback got lost
// is the kind of thing you want to catch quickly).
//
// Two thresholds matter here:
// - MIN_AGE: don't query a payment that's only seconds old — the user
//   might still be entering their PIN on their phone (typically takes
//   up to ~90 seconds), so querying too early just gets "still
//   processing" noise.
// - MAX_AGE: past this, querying keeps failing or keeps coming back
//   inconclusive often enough that it's no longer worth automating —
//   better to surface it for a human to look at (via the admin
//   transactions view, already filterable by status=PENDING) than to
//   silently retry forever.
const MIN_AGE_MINUTES = 5;
const MAX_AGE_HOURS = 24;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    @InjectRepository(Payment) private payments: Repository<Payment>,
    private daraja: DarajaService,
    private paymentService: PaymentService,
    private dataSource: DataSource,
  ) {}

  async sweepPendingPayments(): Promise<void> {
    // Simulated/dev mode has no real Daraja to query — nothing to
    // reconcile, and attempting real API calls with no credentials
    // would just fail loudly on every sweep.
    if (!this.daraja.isConfigured()) return;

    const now = Date.now();
    const minCreatedBefore = new Date(now - MIN_AGE_MINUTES * MINUTE);
    const maxCreatedAfter = new Date(now - MAX_AGE_HOURS * 60 * MINUTE);

    const pending = await this.payments.find({
      where: { status: PaymentStatus.PENDING },
    });

    for (const payment of pending) {
      if (payment.createdAt > minCreatedBefore) continue; // still too fresh, give the callback a chance first
      if (payment.createdAt < maxCreatedAfter) {
        // Past the point of automating further — log once per sweep
        // it's still seen so this doesn't silently disappear, but stop
        // actively querying Daraja for it. Visible in the admin
        // transactions view (filter: status=PENDING) for manual
        // follow-up.
        this.logger.warn(
          `Payment ${payment.id} (checkout ${payment.checkoutRequestId}) still PENDING after ${MAX_AGE_HOURS}h — needs manual review.`,
        );
        continue;
      }
      if (!payment.checkoutRequestId) continue; // nothing to query without one

      try {
        const result = await this.daraja.queryStkPushStatus(payment.checkoutRequestId);
        // '1001'-style "still being processed" rejections come back as
        // thrown errors from Daraja (a non-2xx response), not as a
        // ResultCode — see queryStkPushStatus's own comment. Reaching
        // this line at all means Daraja gave a definitive answer.
        await this.dataSource.transaction((manager) =>
          this.paymentService.resolvePayment(
            manager,
            payment.checkoutRequestId,
            result.resultCode,
            undefined, // the query response doesn't include the M-Pesa receipt number the way a callback does
            { source: 'reconciliation', ...result },
          ),
        );
        this.logger.log(`Reconciled payment ${payment.id}: ResultCode ${result.resultCode} (${result.resultDesc}).`);
      } catch (err) {
        // Genuinely inconclusive (transaction still processing on
        // Safaricom's side, or a transient API error) — leave it
        // PENDING, the next sweep will try again.
        this.logger.debug(`Reconciliation query inconclusive for payment ${payment.id}, will retry next sweep.`);
      }
    }
  }

  // Manual, on-demand version of the same resolution logic — for admin
  // support use (PUT /admin/transactions/:id/recheck), when someone
  // doesn't want to wait for the next automatic sweep, or wants to
  // check a payment younger than MIN_AGE_MINUTES. Skips the age
  // guards entirely since a human explicitly asked for this one,
  // right now.
  async reconcileOne(paymentId: string): Promise<{ resultCode: string; resultDesc: string } | { skipped: string }> {
    if (!this.daraja.isConfigured()) {
      return { skipped: 'M-Pesa is not configured (simulated/dev mode) — nothing to query.' };
    }
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found.');
    if (!payment.checkoutRequestId) {
      return { skipped: 'This payment has no CheckoutRequestID to query.' };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      return { skipped: `Already ${payment.status} — nothing to reconcile.` };
    }

    const result = await this.daraja.queryStkPushStatus(payment.checkoutRequestId);
    await this.dataSource.transaction((manager) =>
      this.paymentService.resolvePayment(
        manager,
        payment.checkoutRequestId,
        result.resultCode,
        undefined,
        { source: 'manual-recheck', ...result },
      ),
    );
    return result;
  }
}
