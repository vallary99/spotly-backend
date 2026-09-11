import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, ListingStatus } from '../business/entities/business.entity';
import { User } from '../auth/entities/user.entity';
import { EmailService } from '../email/email.service';

const DAY = 24 * 60 * 60 * 1000;
const REMINDER_INTERVAL_DAYS = 7;
const INACTIVE_AFTER_DAYS = 30;

// Companion to BillingService's grace-period sweep — same shape, same
// reasoning, different lifecycle: a business that's never uploaded a
// photo isn't discoverable at all, so this nudges them every 7 days for
// a month, then marks the listing INACTIVE if nothing changed (Val, Sep
// 2026). Only ever touches PENDING businesses — once a business goes
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
  ) {}

  async sweepPendingListings(): Promise<void> {
    const pending = await this.businesses.find({
      where: { listingStatus: ListingStatus.PENDING },
    });
    const now = Date.now();

    for (const business of pending) {
      const ageMs = now - business.createdAt.getTime();

      if (ageMs >= INACTIVE_AFTER_DAYS * DAY) {
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
            'No photo was uploaded within 30 days of joining.',
          );
        }
        this.logger.log(`Business ${business.id} marked INACTIVE after ${INACTIVE_AFTER_DAYS} days with no photo.`);
        continue;
      }

      const sinceLastAction = now - (business.lastPendingReminderAt ?? business.createdAt).getTime();
      if (sinceLastAction >= REMINDER_INTERVAL_DAYS * DAY) {
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
