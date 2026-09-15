import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Offer, OfferScheduleType } from './entities/offer.entity';
import { Business, BusinessType } from './entities/business.entity';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';

@Injectable()
export class OfferService {
  constructor(
    @InjectRepository(Offer) private offers: Repository<Offer>,
    @InjectRepository(Business) private businesses: Repository<Business>,
  ) {}

  // Venue and Made in Kenya only — Experience Host is deliberately
  // excluded (Val, Sep 2026: "they can always edit price of upcoming
  // experiences" — a lighter, separate discount-badge-on-an-existing-
  // experience feature was floated for that case instead, not built
  // yet, not part of this).
  private async assertCanManageOffers(businessId: string, ownerId: string): Promise<Business> {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');
    if (business.type === BusinessType.EXPERIENCE_HOST) {
      throw new ForbiddenException('Experience Host businesses cannot create offers.');
    }
    return business;
  }

  private validateSchedule(dto: { scheduleType: OfferScheduleType; startDate: string; endDate?: string | null; daysOfWeek?: string[] | null }) {
    if (dto.scheduleType === OfferScheduleType.DATE_RANGE) {
      if (!dto.endDate) throw new BadRequestException('An end date is required for a date-range offer.');
      if (dto.endDate < dto.startDate) throw new BadRequestException('End date must be on or after the start date.');
    }
    if (dto.scheduleType === OfferScheduleType.WEEKLY) {
      if (!dto.daysOfWeek || dto.daysOfWeek.length === 0) {
        throw new BadRequestException('At least one day of the week is required for a weekly offer.');
      }
      if (dto.endDate && dto.endDate < dto.startDate) {
        throw new BadRequestException('End date must be on or after the start date.');
      }
    }
  }

  async create(businessId: string, ownerId: string, dto: CreateOfferDto) {
    await this.assertCanManageOffers(businessId, ownerId);
    this.validateSchedule(dto);
    return this.offers.save(
      this.offers.create({
        businessId,
        name: dto.name,
        description: dto.description ?? null,
        scheduleType: dto.scheduleType,
        startDate: dto.startDate,
        endDate: dto.scheduleType === OfferScheduleType.SINGLE_DAY ? null : dto.endDate ?? null,
        daysOfWeek: dto.scheduleType === OfferScheduleType.WEEKLY ? dto.daysOfWeek ?? [] : [],
      }),
    );
  }

  async update(businessId: string, offerId: string, ownerId: string, dto: UpdateOfferDto) {
    await this.assertCanManageOffers(businessId, ownerId);
    const offer = await this.offers.findOne({ where: { id: offerId, businessId } });
    if (!offer) throw new NotFoundException('Offer not found.');
    const merged = { ...offer, ...dto };
    this.validateSchedule(merged);
    Object.assign(offer, dto);
    return this.offers.save(offer);
  }

  async remove(businessId: string, offerId: string, ownerId: string) {
    await this.assertCanManageOffers(businessId, ownerId);
    const offer = await this.offers.findOne({ where: { id: offerId, businessId } });
    if (!offer) throw new NotFoundException('Offer not found.');
    await this.offers.remove(offer);
    return { deleted: true };
  }

  // GET /businesses/:id/offers/manage — the owner's own dashboard view,
  // every offer regardless of whether it's already ended (so they can
  // see and reuse/edit past ones), newest first. Ownership-checked
  // directly here rather than reusing assertCanManageOffers, since
  // VIEWING doesn't need the "not Experience Host" restriction that
  // only applies to creating/editing (moot in practice — an Experience
  // Host can never have any offers to view anyway — but correctness
  // here shouldn't depend on that being true elsewhere).
  async findForBusiness(businessId: string, ownerId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');
    return this.offers.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  // Shared by the home rail and the business's own public profile page
  // — "currently running or upcoming" (Val, Sep 2026), computed
  // entirely from the dates at query time rather than a stored flag
  // that would need a sweep to keep current (see this entity's own
  // comment for why that matters here specifically). A SINGLE_DAY or
  // DATE_RANGE offer qualifies as long as it hasn't finished yet; a
  // WEEKLY offer qualifies for its whole bound window, not just on the
  // specific matching days — someone browsing on a Monday should still
  // see "BOGO Tuesdays" so they can plan around it.
  applyActiveOrUpcomingFilter(qb: SelectQueryBuilder<Offer>, alias = 'o') {
    qb.andWhere(
      `(
        (${alias}."scheduleType" = 'SINGLE_DAY' AND ${alias}."startDate" >= CURRENT_DATE)
        OR (${alias}."scheduleType" = 'DATE_RANGE' AND ${alias}."endDate" >= CURRENT_DATE)
        OR (${alias}."scheduleType" = 'WEEKLY' AND (${alias}."endDate" IS NULL OR ${alias}."endDate" >= CURRENT_DATE))
      )`,
    );
  }

  async findActiveOrUpcomingForBusiness(businessId: string) {
    const qb = this.offers.createQueryBuilder('o').where('o."businessId" = :businessId', { businessId });
    this.applyActiveOrUpcomingFilter(qb);
    qb.orderBy('o.startDate', 'ASC');
    return qb.getMany();
  }
}
