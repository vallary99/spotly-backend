import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, ListingStatus } from '../business/entities/business.entity';
import { User } from '../auth/entities/user.entity';
import { EmailService } from '../email/email.service';
import { SystemConfigService } from '../config/system-config.service';

const DAY = 24 * 60 * 60 * 1000;

// Companion to BillingService's grace-period sweep — same shape, same
// reasoning, different lifecycle: a business that's never uploaded a
// photo isn't discoverable at all, so this nudges them periodically,
// then marks the listing INACTIVE if nothing changed (Val, Sep 2026).
// The cadence (how many reminders, how many days apart) used to be
// hardcoded here; it's now read fresh from SystemConfigService on every
// sweep, so an admin changing it takes effect immediately for every
// business currently PENDING — there's no per-business "reminders sent
// so far" counter to reconcile, since INACTIVE is purely a function of
// age vs. the CURRENT settings, recomputed each time rather than
// tracked. Only ever touches PENDING businesses — once a business goes
// ACTIVE (first photo approved, see MediaService.submitForQualityCheck)
// or INACTIVE (this sweep), it drops out of this query entirely; the
// only way back to ACTIVE from either state is uploading a photo.
@Injectable()
export class ListingLifecycleService {
  private readonly logger = new Logger(ListingLifecycleService.name);

  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(User) private users: Repository<User>,
    private email: EmailService,
    private systemConfig: SystemConfigService,
  ) {}

  async sweepPendingListings(): Promise<void> {
    const reminderIntervalDays = await this.systemConfig.getReminderIntervalDays();
    const reminderCount = await this.systemConfig.getReminderCount();
    // Deliberately derived, not a separate setting — going inactive
    // right after the last scheduled reminder means there's never a
    // confusing silent gap between "the reminders stopped" and "the
    // listing went inactive with no further warning."
    const inactiveAfterDays = reminderIntervalDays * reminderCount;

    const pending = await this.businesses.find({
      where: { listingStatus: ListingStatus.PENDING },
    });
    const now = Date.now();

    for (const business of pending) {
      const ageMs = now - business.createdAt.getTime();

      if (ageMs >= inactiveAfterDays * DAY) {
        business.listingStatus = ListingStatus.INACTIVE;
        await this.businesses.save(business);
        const owner = await this.users.findOne({ where: { id: business.ownerId } });
        if (owner) {
          // DEACTIVATION was retired in favor of one merged SUSPENSION
          // template (Val, Sep 2026) — this is exactly the "no reason,
          // no end date" indefinite case that template already
          // handles, now with a real reason given ("no photo") instead
          // of the previous generic copy.
          this.email.queueSuspensionEmail(
            owner.email,
            owner.name,
            business.name,
            business.id,
            `No photo was uploaded within ${inactiveAfterDays} days of joining.`,
          );
        }
        this.logger.log(`Business ${business.id} marked INACTIVE after ${inactiveAfterDays} days with no photo.`);
        continue;
      }

      const sinceLastAction = now - (business.lastPendingReminderAt ?? business.createdAt).getTime();
      if (sinceLastAction >= reminderIntervalDays * DAY) {
        business.lastPendingReminderAt = new Date();
        await this.businesses.save(business);
        const owner = await this.users.findOne({ where: { id: business.ownerId } });
        if (owner) {
          this.email.queuePendingDiscoveryEmail(owner.email, owner.name, business.name, business.id);
        }
      }
    }
  }
}
