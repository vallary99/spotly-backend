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

  queueEvent(businessId: string, type: 'view' | 'save'): void {
    runInBackground(this.logger, `record-event ${type} ${businessId}`, () =>
      this.recordEvent(businessId, type),
    );
  }

  async recordEvent(businessId: string, type: 'view' | 'save'): Promise<void> {
    await this.events.save(this.events.create({ businessId, type }));
  }

  async sweepRollingCounters(): Promise<void> {
    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows: Array<{ businessid: string; type: string; count: string }> =
      await this.events.query(
        `SELECT "businessId" as businessid, type, COUNT(*) as count
       FROM usage_events
       WHERE "createdAt" >= $1
       GROUP BY "businessId", type`,
        [windowStart],
      );
    const byBusiness = new Map<string, { views: number; saves: number }>();
    for (const row of rows) {
      const entry = byBusiness.get(row.businessid) ?? { views: 0, saves: 0 };
      if (row.type === 'view') entry.views = Number(row.count);
      if (row.type === 'save') entry.saves = Number(row.count);
      byBusiness.set(row.businessid, entry);
    }
    for (const [businessId, { views, saves }] of byBusiness) {
      await this.businesses.update(businessId, {
        profileViews: views,
        savesCount: saves,
      });
    }
  }
}
