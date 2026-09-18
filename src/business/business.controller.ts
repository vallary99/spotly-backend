import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { BusinessService } from './business.service';
import { CreateBusinessDto, UpdateBusinessDto, SetCoverPhotoDto } from './dto/business.dto';
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

  // GET /businesses/max-categories — same route-ordering reason as
  // above. Admin-configurable cap (default 5) the registration/edit
  // forms size their category picker to; server-side enforcement lives
  // in BusinessService.create()/update() regardless of what this says.
  @Public()
  @Get('max-categories')
  async getMaxCategories() {
    return { maxCategories: await this.service.getMaxCategories() };
  }

  // GET /businesses/geocode — same route-ordering reason as above.
  // Public: anyone filling out the onboarding form is, by definition,
  // not authenticated yet at that point in the flow.
  @Public()
  @Get('geocode')
  async geocode(@Query('q') query: string) {
    return this.service.geocodeAddress(query || '');
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

  // GET /businesses/lookup/:city/:slug — what the web app's /:city/:slug
  // page actually calls (Val, Sep 2026 SEO spec, Section 1). Namespaced
  // under the existing /businesses prefix rather than exposed at a bare
  // top-level /:city/:slug on the API itself — the public URL pattern
  // is a spotly-web (Next.js) route, not something the API needs to
  // mirror at the same path, and a genuinely top-level two-segment
  // wildcard here would risk colliding with other controllers'
  // existing routes.
  @Public()
  @Get('lookup/:city/:slug')
  findBySlug(@CurrentUser() user: any, @Param('city') city: string, @Param('slug') slug: string) {
    return this.service.findBySlug(city, slug, user?.userId);
  }

  @Public()
  @Post(':id/share')
  recordShare(@Param('id') id: string) {
    this.service.recordShare(id);
    return { recorded: true };
  }

  @Public()
  @Get(':id/experiences/history')
  getHostingHistory(@Param('id') id: string) {
    return this.service.getHostingHistory(id);
  }

  @Get(':id/experiences/history/manage')
  getHostingHistoryForOwner(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getHostingHistoryForOwner(id, user.userId);
  }

  @Put(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateBusinessDto) {
    return this.service.update(id, user.userId, dto);
  }

  @Patch(':id/cover-photo')
  setCoverPhoto(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: SetCoverPhotoDto) {
    return this.service.setCoverPhoto(id, user.userId, dto);
  }

  // DELETE /businesses/:id — owner closes their Business Account; their
  // User account (and role) survives, reverted to REGISTERED.
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(id, user.userId);
  }
}
