import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { UsageService } from './usage.service';
import { ExperienceExpiryService } from './experience-expiry.service';
import { BillingService } from './billing.service';
import { ListingLifecycleService } from './listing-lifecycle.service';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

type Sweep = { name: string; everyMs: number; run: () => Promise<void> };

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private usage: UsageService,
    private experienceExpiry: ExperienceExpiryService,
    private billing: BillingService,
    private listingLifecycle: ListingLifecycleService,
  ) {}

  onModuleInit(): void {
    const sweeps: Sweep[] = [
      {
        name: 'usage-rolling-counters',
        everyMs: HOUR,
        run: () => this.usage.sweepRollingCounters(),
      },
      {
        name: 'experience-expiry',
        everyMs: 15 * MINUTE,
        run: () => this.experienceExpiry.sweepExpired(),
      },
      {
        name: 'billing-grace-period',
        everyMs: HOUR,
        run: () => this.billing.sweepExpiredGracePeriods(),
      },
      {
        // Hourly is plenty of margin for 7-day thresholds — this isn't
        // trying to fire reminders at a precise time of day, just
        // making sure roughly a week (not two, not three) passes
        // between them.
        name: 'listing-lifecycle',
        everyMs: HOUR,
        run: () => this.listingLifecycle.sweepPendingListings(),
      },
    ];

    for (const sweep of sweeps) {
      void this.execute(sweep);
      const timer = setInterval(() => void this.execute(sweep), sweep.everyMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  private async execute(sweep: Sweep): Promise<void> {
    try {
      await sweep.run();
    } catch (err) {
      this.logger.error(
        `Sweep "${sweep.name}" failed: ${(err as Error).message}`,
      );
    }
  }
}
