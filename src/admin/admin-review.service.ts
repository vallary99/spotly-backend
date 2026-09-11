import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../review/entities/review.entity';
import { User } from '../auth/entities/user.entity';

// Businesses can't delete their own reviews (a business erasing its own
// criticism would defeat the point of reviews entirely), but that only
// works well if there's an admin-level backstop against genuine abuse
// — someone spamming a business with fake negative reviews (Val, Sep
// 2026).
@Injectable()
export class AdminReviewService {
  constructor(
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  // GET /admin/businesses/:id/reviews — a second, admin-specific list
  // endpoint rather than reusing ReviewService.findForBusiness, which
  // returns every review at once with no pagination — fine for a
  // business's own public page, but not for a review moderation view
  // where a popular business could have hundreds (Val, Sep 2026: "How
  // are you planning to fit all comments... will that lead to a
  // reviews page?" — a paginated modal instead, same Previous/Next
  // pattern as the businesses table).
  async findForBusiness(businessId: string, limit = 20, offset = 0) {
    const [reviews, total] = await this.reviews.findAndCount({
      where: { businessId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return {
      total,
      results: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt,
        reviewerId: r.user.id,
        reviewerName: r.user.name,
        reviewerEmail: r.user.email,
        reviewerSuspended: r.user.reviewsSuspended,
      })),
    };
  }

  // DELETE /admin/reviews/:id — on the business owner's behalf, since
  // they have no way to do this themselves by design.
  async deleteReview(id: string) {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found.');
    await this.reviews.remove(review);
    return { deleted: true };
  }

  // PUT /admin/users/:id/review-suspension — platform-wide, not scoped
  // to one business (see ReviewService.create's check, and the
  // reviewsSuspended column comment on User). Existing reviews from
  // this user are untouched; this only blocks NEW ones.
  async setReviewSuspension(userId: string, suspended: boolean) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    user.reviewsSuspended = suspended;
    await this.users.save(user);
    return { id: user.id, reviewsSuspended: user.reviewsSuspended };
  }
}
