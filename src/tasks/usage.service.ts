import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageEvent } from './entities/usage-event.entity';
import { Business } from '../business/entities/business.entity';
import { runInBackground } from '../common/utils/background.util';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageEvent) private events: Repository<UsageEvent>,
    @InjectRepository(Business) private businesses: Repository<Business>,
  ) {}

  queueEvent(businessId: string, type: 'view' | 'save' | 'share'): void {
    runInBackground(this.logger, `record-event ${type} ${businessId}`, () =>
      this.recordEvent(businessId, type),
    );
  }

  async recordEvent(businessId: string, type: 'view' | 'save' | 'share'): Promise<void> {
    await this.events.save(this.events.create({ businessId, type }));
  }

  // Renamed in spirit from "rolling counters" to "lifetime totals" (Val,
  // Sep 2026: "let's have them as total until we introduce an analytics
  // page") — no date filter at all now, just every event this business
  // has ever recorded. The method name and the hourly schedule are
  // unchanged; only the WHERE clause moved.
  async sweepRollingCounters(): Promise<void> {
    const rows: Array<{ businessid: string; type: string; count: string }> =
      await this.events.query(
        `SELECT "businessId" as businessid, type, COUNT(*) as count
       FROM usage_events
       GROUP BY "businessId", type`,
      );
    const byBusiness = new Map<string, { views: number; saves: number; shares: number }>();
    for (const row of rows) {
      const entry = byBusiness.get(row.businessid) ?? { views: 0, saves: 0, shares: 0 };
      if (row.type === 'view') entry.views = Number(row.count);
      if (row.type === 'save') entry.saves = Number(row.count);
      if (row.type === 'share') entry.shares = Number(row.count);
      byBusiness.set(row.businessid, entry);
    }
    for (const [businessId, { views, saves, shares }] of byBusiness) {
      await this.businesses.update(businessId, {
        profileViews: views,
        savesCount: saves,
        sharesCount: shares,
      });
    }
  }
}
