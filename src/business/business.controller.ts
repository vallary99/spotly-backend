import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import {
  CreateBusinessDto,
  UpdateBusinessDto,
  SetCoverPhotoDto,
} from './dto/business.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
  constructor(private service: BusinessService) {}

  // Registering a business requires auth (a Registered User upgrading to
  // Business Account) — not marked @Public().
  @ApiBearerAuth()
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
    return this.service.findAll({
      city,
      neighborhood,
      category,
      categories,
      q,
      isHiddenGem: isHiddenGem === 'true',
    });
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

  @ApiBearerAuth()
  @Put(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  @ApiBearerAuth()
  @Patch(':id/cover-photo')
  setCoverPhoto(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: SetCoverPhotoDto,
  ) {
    return this.service.setCoverPhoto(id, user.userId, dto);
  }

  // DELETE /businesses/:id — owner closes their Business Account; their
  // User account (and role) survives, reverted to REGISTERED.
  @ApiBearerAuth()
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(id, user.userId);
  }
}
