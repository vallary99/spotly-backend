import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Experience } from './entities/experience.entity';
import { Business } from '../business/entities/business.entity';
import { CreateExperienceDto, UpdateExperienceDto } from './dto/experience.dto';
import { randomUUID } from 'crypto';
import { TierConfigService } from '../subscription/tier-config.service';
import { QualityGateService } from '../media/quality-gate.service';
import { StorageService } from '../media/storage.service';
import { withBudgetFallback } from './experience.util';

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
    await this.storage.saveFile(buffer, storageKey);
    const url = this.storage.publicUrlForKey(storageKey);
    return { url, storageKey };
  }

  // POST /businesses/:id/experiences — FR-9.1: requires an active Business
  // Account (enforced by RolesGuard at the controller level) and FR-9.5:
  // concurrent-live cap enforced here, server-side, per subscription tier.
  async create(businessId: string, ownerId: string, dto: CreateExperienceDto) {
    const business = await this.getOwnedBusiness(businessId, ownerId);
    await this.enforceExperienceSlotLimit(business);
    return this.experiences.save(
      this.experiences.create({
        ...dto,
        businessId,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      } as any),
    );
  }

  // POST /businesses/:id/experiences/drafts — reuses UpdateExperienceDto's
  // shape (everything optional) rather than a new DTO, since that's
  // exactly what a draft needs: nothing required at all. Deliberately
  // skips enforceExperienceSlotLimit entirely — a draft isn't "hosted"
  // yet, so shouldn't count against either the concurrent-live cap or
  // the monthly allowance (Val, Sep 2026).
  async saveDraft(businessId: string, ownerId: string, dto: UpdateExperienceDto) {
    await this.getOwnedBusiness(businessId, ownerId);
    return this.experiences.save(
      this.experiences.create({
        ...dto,
        businessId,
        title: dto.title || 'Untitled experience',
        isDraft: true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      } as any),
    );
  }

  // PUT /businesses/:id/experiences/:experienceId/publish — the moment a
  // draft actually becomes a real, live listing. Full validation and the
  // tier limit both apply here for the first time, exactly as they would
  // for a direct create() — a draft only defers these checks, it never
  // skips them.
  async publishDraft(businessId: string, experienceId: string, ownerId: string) {
    const business = await this.getOwnedBusiness(businessId, ownerId);
    const experience = await this.experiences.findOne({ where: { id: experienceId, businessId } });
    if (!experience) throw new NotFoundException('Experience not found.');
    if (!experience.isDraft) throw new BadRequestException('This experience is already published.');

    const missing: string[] = [];
    if (!experience.title || experience.title === 'Untitled experience') missing.push('title');
    if (!experience.description) missing.push('description');
    if (!experience.images || experience.images.length === 0) missing.push('at least one photo');
    if (!experience.startsAt) missing.push('a start date/time');
    if (!experience.endsAt) missing.push('an end date/time');
    if (!experience.location) missing.push('a location');
    if (experience.price == null) missing.push('a price');
    if (missing.length > 0) {
      throw new BadRequestException(`This draft is still missing: ${missing.join(', ')}.`);
    }

    await this.enforceExperienceSlotLimit(business);
    experience.isDraft = false;
    return this.experiences.save(experience);
  }

  private async getOwnedBusiness(businessId: string, ownerId: string): Promise<Business> {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this business.');
    }
    return business;
  }

  // Extracted from create() so publishDraft() can apply the exact same
  // check at the moment a draft actually goes live, rather than
  // duplicating this logic (Val, Sep 2026's draft feature).
  private async enforceExperienceSlotLimit(business: Business) {
    const limits = await this.tierConfig.getLimits(business.tier);
    if (limits.concurrentExperiences !== null) {
      // Premium: a concurrently-live cap (FR-11.2) — how many
      // not-yet-expired experiences exist right now, regardless of
      // when they were created.
      const liveCount = await this.experiences.count({
        where: { businessId: business.id, isExpired: false, isDraft: false },
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
        where: { businessId: business.id, createdAt: MoreThanOrEqual(startOfMonth), isDraft: false },
      });
      if (monthlyCount >= limits.monthlyExperiencesIncluded) {
        // A paid add-on credit (see PaymentService.resolvePayment)
        // covers exactly one experience beyond the included allowance
        // — consumed here rather than just checked, so it can't be
        // reused for a second experience without paying again.
        if (business.paidExperienceAddonsAvailable > 0) {
          business.paidExperienceAddonsAvailable -= 1;
          await this.businesses.save(business);
        } else {
          const limitsForAddon = await this.tierConfig.getLimits(business.tier);
          const message =
            limits.monthlyExperiencesIncluded === 0
              ? `Your ${business.tier} package doesn't include hosting experiences. Pay a one-time KES ${limitsForAddon.experienceAddonPriceKes} add-on fee to host this one, or upgrade to Featured or Premium for ongoing room.`
              : `You've used all ${limits.monthlyExperiencesIncluded} experience(s) included in your ${business.tier} package this month. Pay a one-time KES ${limitsForAddon.experienceAddonPriceKes} add-on fee to host one more, or upgrade to Premium for more room.`;
          throw new ForbiddenException(message);
        }
      }
    }
  }

  async findAll(params: { upcoming?: boolean }) {
    const qb = this.experiences.createQueryBuilder('e').leftJoinAndSelect('e.business', 'business').where('e.isExpired = false').andWhere('e.isDraft = false');
    if (params.upcoming) qb.andWhere('e.startsAt > NOW()');
    qb.orderBy('e.startsAt', 'ASC').take(50);
    const rows = await qb.getMany();
    // Same public-endpoint field-stripping as HomeService's rail —
    // the joined `business` only exists here to resolve the budget
    // fallback, never to leak owner-only fields onto a public list.
    return rows.map((e) => {
      const { business, ...rest } = e as any;
      return { ...withBudgetFallback(rest, business), businessName: business?.name, businessSlug: business?.slug, businessCity: business?.city };
    });
  }

  async update(id: string, ownerId: string, dto: UpdateExperienceDto) {
    const experience = await this.experiences.findOne({ where: { id }, relations: ['business'] });
    if (!experience) {
      throw new NotFoundException('Experience not found.');
    }
    if (experience.business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this experience.');
    }
    // Val, Sep 2026: clamp same as Media.setFocalPoint — a malformed or
    // out-of-range value from the client shouldn't corrupt what gets
    // stored.
    const clampedFocalPoints = dto.imageFocalPoints
      ? Object.fromEntries(
          Object.entries(dto.imageFocalPoints).map(([url, p]) => [
            url,
            { x: Math.max(0, Math.min(100, p.x)), y: Math.max(0, Math.min(100, p.y)) },
          ]),
        )
      : undefined;
    Object.assign(experience, {
      ...dto,
      ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}),
      ...(dto.endsAt ? { endsAt: new Date(dto.endsAt) } : {}),
      ...(clampedFocalPoints ? { imageFocalPoints: clampedFocalPoints } : {}),
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
