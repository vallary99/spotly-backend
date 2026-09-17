import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Business, BusinessType, ApprovalStatus } from '../business/entities/business.entity';
import { User, UserRole } from '../auth/entities/user.entity';
import { UsageEvent } from '../tasks/entities/usage-event.entity';
import { ModerationQueueItem } from '../tasks/entities/moderation-queue-item.entity';
import { Payment, PaymentStatus } from '../payment/entities/payment.entity';

// Matches PaymentReconciliationService's own definition of "stuck" —
// a PENDING payment older than this has already had every automatic
// retry the sweep will give it and needs a human to look (Val, Sep
// 2026: dashboard should say what needs attention, not just totals).
const STUCK_PAYMENT_AGE_HOURS = 24;

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(UsageEvent) private usageEvents: Repository<UsageEvent>,
    @InjectRepository(ModerationQueueItem) private moderationQueue: Repository<ModerationQueueItem>,
    @InjectRepository(Payment) private payments: Repository<Payment>,
  ) {}

  // GET /admin/analytics/summary — the top-of-dashboard counts.
  async getSummary() {
    const [totalBusinesses, totalUsers, activeBusinesses, suspendedBusinesses, tierCounts, pendingMadeInKenya, moderationQueueCount, stuckPayments] =
      await Promise.all([
        this.businesses.count(),
        this.users.count({ where: { role: UserRole.REGISTERED } }), // BUSINESS_OWNER counted separately below, ADMIN excluded from "users"
        // "Active" = has at least one approved photo, i.e. actually
        // publicly visible — same bar as the public listing gate,
        // not just "row exists in the table."
        this.businesses
          .createQueryBuilder('b')
          .where(
            `EXISTS (SELECT 1 FROM media m WHERE m."businessId" = b.id AND m.status = 'APPROVED' AND m.type = 'PHOTO')`,
          )
          .getCount(),
        this.businesses.count({ where: { isSuspended: true } }),
        this.businesses
          .createQueryBuilder('b')
          .select('b.tier', 'tier')
          .addSelect('COUNT(*)', 'count')
          .groupBy('b.tier')
          .getRawMany(),
        this.businesses.count({ where: { type: BusinessType.MADE_IN_KENYA, approvalStatus: ApprovalStatus.PENDING } }),
        this.moderationQueue.count({ where: { resolved: false } }),
        this.payments.count({
          where: { status: PaymentStatus.PENDING, createdAt: LessThan(new Date(Date.now() - STUCK_PAYMENT_AGE_HOURS * 60 * 60 * 1000)) },
        }),
      ]);
    const businessOwners = await this.users.count({ where: { role: UserRole.BUSINESS_OWNER } });

    return {
      totalBusinesses,
      totalUsers: totalUsers + businessOwners,
      registeredUsers: totalUsers,
      businessOwners,
      activeBusinesses,
      suspendedBusinesses,
      tierBreakdown: Object.fromEntries(tierCounts.map((r) => [r.tier, Number(r.count)])),
      // "Needs your attention" (Val, Sep 2026) — every count here links
      // to the specific page that resolves it.
      needsAttention: { pendingMadeInKenya, moderationQueueCount, stuckPayments },
    };
  }

  // GET /admin/analytics/usage?granularity=day|week|month — powers the
  // dashboard's usage-over-time graph. Buckets UsageEvent rows (views +
  // saves) rather than querying Business.profileViews/savesCount
  // directly, since those are rolling 30-day aggregates, not a real
  // time series — this is the actual event log they're built from.
  async getUsageSeries(granularity: 'day' | 'week' | 'month', days: number) {
    const truncUnit = granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month';
    const rows = await this.usageEvents
      .createQueryBuilder('e')
      .select(`date_trunc('${truncUnit}', e."createdAt")`, 'bucket')
      .addSelect('e.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where(`e."createdAt" >= now() - interval '${days} days'`)
      .groupBy('bucket')
      .addGroupBy('e.type')
      .orderBy('bucket', 'ASC')
      .getRawMany();

    // Reshape into one row per bucket with both counts, so the frontend
    // doesn't have to do this itself for a simple two-series line chart.
    const byBucket = new Map<string, { date: string; views: number; saves: number }>();
    for (const row of rows) {
      const key = new Date(row.bucket).toISOString();
      if (!byBucket.has(key)) byBucket.set(key, { date: key, views: 0, saves: 0 });
      const entry = byBucket.get(key)!;
      if (row.type === 'view') entry.views = Number(row.count);
      else if (row.type === 'save') entry.saves = Number(row.count);
    }
    return Array.from(byBucket.values());
  }
}
