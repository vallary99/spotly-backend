import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { Business } from '../entities/business.entity';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(Business) private businesses: Repository<Business>,
  ) {}

  // POST /reviews — FR-4.3: requires auth (guaranteed by controller: no
  // @Public()); one review per user per business, enforced by the DB
  // unique constraint as the source of truth, checked here for a clean
  // error message. A business owner may not review their own business —
  // that's a trust/integrity rule, not an MVP scope cut.
  async create(businessId: string, userId: string, dto: CreateReviewDto) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId === userId) {
      throw new ForbiddenException('You cannot review your own business.');
    }
    const existing = await this.reviews.findOne({ where: { businessId, userId } });
    if (existing) {
      throw new ConflictException('You have already reviewed this business.');
    }
    return this.reviews.save(
      this.reviews.create({
        ...dto,
        businessId,
        userId,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : null,
      } as any),
    );
  }

  // GET /reviews?businessId= — FR-4.1/4.2: list + rating summary.
  async findForBusiness(businessId: string) {
    const reviews = await this.reviews.find({
      where: { businessId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
    const count = reviews.length;
    const distribution = [0, 0, 0, 0, 0]; // index 0 = 1-star ... index 4 = 5-star
    let sum = 0;
    for (const r of reviews) {
      sum += r.rating;
      distribution[r.rating - 1]++;
    }
    return {
      average: count ? Number((sum / count).toFixed(2)) : 0,
      count,
      distribution,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        text: r.text,
        photos: r.photos,
        visitDate: r.visitDate,
        helpfulCount: r.helpfulCount,
        createdAt: r.createdAt,
        reviewer: { id: r.user.id, name: r.user.name },
      })),
    };
  }
}
