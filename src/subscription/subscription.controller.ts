import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

// Read-only for businesses, per instruction — package pricing/limits are
// platform-wide settings, not something an individual business should
// be able to change for everyone. Editing will come back once there's a
// real, separately-scoped admin project with its own proper access
// control (TierConfigService.updateTier() already exists and is ready
// to be wired into that, whenever it's built — just not exposed via any
// route right now).
@ApiTags('Subscriptions')
@Controller()
export class SubscriptionController {
  constructor(private service: SubscriptionService) {}

  @Public()
  @Get('subscriptions/tiers')
  getTierCatalogue() {
    return this.service.getTierCatalogue();
  }

  @ApiBearerAuth()
  @Get('businesses/:id/subscription')
  getStatus(@Param('id') id: string) {
    return this.service.getStatus(id);
  }

  // POST /businesses/:id/start-trial — activates an admin-granted trial
  // offer, no payment involved. See SubscriptionService.startTrial for
  // why this has to be a separate, owner-initiated action rather than
  // something that happens automatically when the offer is granted.
  @ApiBearerAuth()
  @Post('businesses/:id/start-trial')
  startTrial(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.startTrial(id, user.userId);
  }
}
