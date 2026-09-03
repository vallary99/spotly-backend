import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/review.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('reviews')
export class ReviewController {
  constructor(private service: ReviewService) {}

  // POST /reviews?businessId=... — auth required (FR-4.3), no @Public().
  @Post()
  create(
    @CurrentUser() user: any,
    @Query('businessId') businessId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.service.create(businessId, user.userId, dto);
  }

  // GET /reviews?businessId=... — guests can read reviews (FR-6.1).
  @Public()
  @Get()
  findForBusiness(@Query('businessId') businessId: string) {
    return this.service.findForBusiness(businessId);
  }
}
