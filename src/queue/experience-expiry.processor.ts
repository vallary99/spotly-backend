import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Experience } from '../entities/experience.entity';

@Processor('experience-expiry')
export class ExperienceExpiryProcessor extends WorkerHost {
  constructor(@InjectRepository(Experience) private experiences: Repository<Experience>) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'sweep-expired') return;
    const now = new Date();
    // FR-9.3: experiences automatically expire and move into Hosting
    // History — "moving" just means isExpired flips true; the row and
    // its data are permanent (FR-9.4), never deleted.
    await this.experiences.update(
      { isExpired: false, endsAt: LessThan(now) },
      { isExpired: true },
    );
    // For experiences without an explicit endsAt, fall back to startsAt.
    await this.experiences
      .createQueryBuilder()
      .update(Experience)
      .set({ isExpired: true })
      .where('isExpired = false')
      .andWhere('"endsAt" IS NULL')
      .andWhere('"startsAt" < :now', { now })
      .execute();
  }
}
