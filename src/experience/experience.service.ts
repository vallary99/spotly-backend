import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    const liveCount = await this.experiences.count({
      where: { businessId, isExpired: false },
    });
    const limit = (await this.tierConfig.getLimits(business.tier)).concurrentExperiences;
    // Starter has no included experiences (pay-per-event add-on) — for MVP
    // scaffold we block outright; a real build would branch here into the
    // PaymentModule for a per-event charge before creating the row.
    if (limit !== null && liveCount >= limit) {
      const message =
        limit === 0
          ? `Your ${business.tier} package doesn't allow live experiences. Upgrade to Growth or Premium to start hosting.`
          : `You've reached your ${business.tier} package's limit of ${limit} concurrently live experience(s). Upgrade for more, or wait for one to expire.`;
      throw new ForbiddenException(message);
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
