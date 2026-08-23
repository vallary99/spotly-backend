import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Experience } from '../experience/entities/experience.entity';

@Injectable()
export class ExperienceExpiryService {
  constructor(
    @InjectRepository(Experience) private experiences: Repository<Experience>,
  ) {}

  async sweepExpired(): Promise<void> {
    const now = new Date();
    await this.experiences.update(
      { isExpired: false, endsAt: LessThan(now) },
      { isExpired: true },
    );
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
