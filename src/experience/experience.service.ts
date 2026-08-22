import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Experience } from '../entities/experience.entity';
import { Business } from '../entities/business.entity';
import { CreateExperienceDto, UpdateExperienceDto } from './dto/experience.dto';
import { randomUUID } from 'crypto';
import { TierConfigService } from '../subscription/tier-config.service';
import { QualityGateService } from '../media/quality-gate.service';
import { StorageService } from '../media/storage.service';

@Injectable()
export class ExperienceService {
  constructor(
    @InjectRepository(Experience) private experiences: Repository<Experience>,
    @InjectRepository(Business) private businesses: Repository<Business>,
    private tierConfig: TierConfigService,
    private qualityGate: QualityGateService,
    private storage: StorageService,
  ) {}

  // POST /businesses/:id/experience-image — a lighter-weight sibling to
  // the business media pipeline: same instant quality check (resolution/
  // blur/orientation), but no Media row, no moderation queue, and no
  // effect on the business's own photo cap — an experience's cover image
  // is a different, smaller concept than the business gallery.
  async uploadCoverImage(businessId: string, ownerId: string, buffer: Buffer) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');

    const check = await this.qualityGate.checkImage(buffer);
    if (!check.passed) {
      throw new BadRequestException(check.reason);
    }
    const storageKey = `businesses/${businessId}/experiences/${randomUUID()}.jpg`;
    await this.storage.saveLocalFile(buffer, storageKey);
    const url = this.storage.publicUrlForKey(storageKey);
    return { url, storageKey };
  }

  // POST /businesses/:id/experiences — FR-9.1: requires an active Business
  // Account (enforced by RolesGuard at the controller level) and FR-9.5:
  // concurrent-live cap enforced here, server-side, per subscription tier.
  async create(businessId: string, ownerId: string, dto: CreateExperienceDto) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this business.');
    }

    const limits = await this.tierConfig.getLimits(business.tier);
    if (limits.concurrentExperiences !== null) {
      // Premium: a concurrently-live cap (FR-11.2) — how many
      // not-yet-expired experiences exist right now, regardless of
      // when they were created.
      const liveCount = await this.experiences.count({
        where: { businessId, isExpired: false },
      });
      if (liveCount >= limits.concurrentExperiences) {
        throw new ForbiddenException(
          `You've reached your ${business.tier} package's limit of ${limits.concurrentExperiences} concurrently live experience(s). Wait for one to expire, or remove one first.`,
        );
      }
    } else if (limits.monthlyExperiencesIncluded !== null) {
      // Featured (and Starter's 0): a monthly allowance, not a
      // concurrent-live cap — how many were CREATED this calendar
      // month, regardless of whether they're still live. This was
      // previously read from tier config but never actually checked
      // here, so Featured-tier businesses had no real experience cap
      // at all despite the package promising a fixed monthly allowance.
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthlyCount = await this.experiences.count({
        where: { businessId, createdAt: MoreThanOrEqual(startOfMonth) },
      });
      if (monthlyCount >= limits.monthlyExperiencesIncluded) {
        const message =
          limits.monthlyExperiencesIncluded === 0
            ? `Your ${business.tier} package doesn't include hosting experiences. Upgrade to Featured or Premium to start hosting.`
            : `You've used all ${limits.monthlyExperiencesIncluded} experience(s) included in your ${business.tier} package this month. Upgrade to Premium for more room.`;
        throw new ForbiddenException(message);
      }
    }

    return this.experiences.save(
      this.experiences.create({
        ...dto,
        businessId,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      } as any),
    );
  }

  async findAll(params: { upcoming?: boolean }) {
    const qb = this.experiences.createQueryBuilder('e').where('e.isExpired = false');
    if (params.upcoming) qb.andWhere('e.startsAt > NOW()');
    qb.orderBy('e.startsAt', 'ASC').take(50);
    return qb.getMany();
  }

  async update(id: string, ownerId: string, dto: UpdateExperienceDto) {
    const experience = await this.experiences.findOne({ where: { id }, relations: ['business'] });
    if (!experience) {
      throw new NotFoundException('Experience not found.');
    }
    if (experience.business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this experience.');
    }
    Object.assign(experience, {
      ...dto,
      ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}),
      ...(dto.endsAt ? { endsAt: new Date(dto.endsAt) } : {}),
    });
    return this.experiences.save(experience);
  }

  async remove(id: string, ownerId: string) {
    const experience = await this.experiences.findOne({ where: { id }, relations: ['business'] });
    if (!experience) {
      throw new NotFoundException('Experience not found.');
    }
    if (experience.business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this experience.');
    }
    await this.experiences.remove(experience);
    return { deleted: true };
  }
}
