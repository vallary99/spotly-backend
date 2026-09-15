import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { OfferService } from './offer.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';

@Controller('businesses/:id/offers')
export class OfferController {
  constructor(private service: OfferService) {}

  // Public — a business's own active/upcoming offers, shown on its
  // profile page (Val, Sep 2026, same spirit as Upcoming Experiences
  // already being shown there).
  @Public()
  @Get()
  findActiveOrUpcoming(@Param('id') businessId: string) {
    return this.service.findActiveOrUpcomingForBusiness(businessId);
  }

  // Owner-only — every offer regardless of whether it's ended, for the
  // dashboard's own management view.
  @Get('manage')
  findForBusiness(@CurrentUser() user: any, @Param('id') businessId: string) {
    return this.service.findForBusiness(businessId, user.userId);
  }

  @Post()
  create(@CurrentUser() user: any, @Param('id') businessId: string, @Body() dto: CreateOfferDto) {
    return this.service.create(businessId, user.userId, dto);
  }

  @Put(':offerId')
  update(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.service.update(businessId, offerId, user.userId, dto);
  }

  @Delete(':offerId')
  remove(@CurrentUser() user: any, @Param('id') businessId: string, @Param('offerId') offerId: string) {
    return this.service.remove(businessId, offerId, user.userId);
  }
}
