import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { BusinessService } from './business.service';
import { CreateBusinessDto, UpdateBusinessDto } from './dto/business.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('businesses')
export class BusinessController {
  constructor(private service: BusinessService) {}

  // Registering a business requires auth (a Registered User upgrading to
  // Business Account) — not marked @Public().
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateBusinessDto) {
    return this.service.create(user.userId, dto);
  }

  @Public()
  @Get()
  findAll(
    @Query('city') city?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('category') category?: string,
    @Query('categories') categories?: string,
    @Query('q') q?: string,
    @Query('isHiddenGem') isHiddenGem?: string,
  ) {
    return this.service.findAll({ city, neighborhood, category, categories, q, isHiddenGem: isHiddenGem === 'true' });
  }

  // GET /businesses/categories — must be declared before GET /:id, or
  // Nest/Express would match "categories" as an :id param instead of
  // this literal route.
  @Public()
  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  // @Public(), but the JWT guard still populates @CurrentUser() when a
  // valid token is present (it only stops short of *requiring* one) —
  // so a logged-in owner viewing their own business still gets
  // profileViews/savesCount, while everyone else doesn't.
  @Public()
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(id, user?.userId);
  }

  @Public()
  @Get(':id/experiences/history')
  getHostingHistory(@Param('id') id: string) {
    return this.service.getHostingHistory(id);
  }

  @Put(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateBusinessDto) {
    return this.service.update(id, user.userId, dto);
  }

  // DELETE /businesses/:id — owner closes their Business Account; their
  // User account (and role) survives, reverted to REGISTERED.
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(id, user.userId);
  }
}
