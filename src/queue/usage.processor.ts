import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageEvent } from '../entities/usage-event.entity';
import { Business } from '../entities/business.entity';

@Processor('usage')
export class UsageProcessor extends WorkerHost {
  constructor(
    @InjectRepository(UsageEvent) private events: Repository<UsageEvent>,
    @InjectRepository(Business) private businesses: Repository<Business>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'record-event') {
      // Append-only write — cheap, no contention, keeps the hot path
      // (viewing a business page) fast. See job below for how this
      // becomes Business.profileViews/savesCount.
      await this.events.save(this.events.create({ businessId: job.data.businessId, type: job.data.type }));
      return;
    }

    if (job.name === 'sweep-rolling-counters') {
      // Scheduled (see queue.module.ts repeatable job) rather than
      // computed live on every request — this is the piece that keeps
      // FR-12.2's usage-threshold check cheap regardless of traffic
      // volume.
      const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows: Array<{ businessid: string; type: string; count: string }> = await this.events.query(
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
        await this.businesses.update(businessId, { profileViews: views, savesCount: saves });
      }
    }
  }
}
