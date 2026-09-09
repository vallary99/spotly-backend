import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExperienceService } from './experience.service';
import { CreateExperienceDto, UpdateExperienceDto } from './dto/experience.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';

@Controller()
export class ExperienceController {
  constructor(private service: ExperienceService) {}

  // POST /businesses/:id/experience-image — cover image upload, used by
  // both the create form and edit flow. Returns a URL to include in the
  // experience's `images` array; doesn't create the experience itself.
  // Also allows ADMIN alongside BUSINESS_OWNER on every endpoint below —
  // an admin account that owns a business (a common way to test the
  // owner-side flows) keeps its ADMIN role now rather than being
  // silently downgraded to BUSINESS_OWNER on creation (see
  // BusinessService.create), so these guards need to recognize that
  // role too, not just BUSINESS_OWNER, or an admin-owned business would
  // be unable to manage its own experiences (Val, Sep 2026).
  @Roles(UserRole.BUSINESS_OWNER, UserRole.ADMIN)
  @Post('businesses/:id/experience-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadCoverImage(@CurrentUser() user: any, @Param('id') businessId: string, @UploadedFile() file: any) {
    return this.service.uploadCoverImage(businessId, user.userId, file.buffer);
  }

  // POST /businesses/:id/experiences — FR-9.1: Business Account only.
  @Roles(UserRole.BUSINESS_OWNER, UserRole.ADMIN)
  @Post('businesses/:id/experiences')
  create(@CurrentUser() user: any, @Param('id') businessId: string, @Body() dto: CreateExperienceDto) {
    return this.service.create(businessId, user.userId, dto);
  }

  @Public()
  @Get('experiences')
  findAll(@Query('upcoming') upcoming?: string) {
    return this.service.findAll({ upcoming: upcoming === 'true' });
  }

  @Roles(UserRole.BUSINESS_OWNER, UserRole.ADMIN)
  @Put('experiences/:id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    return this.service.update(id, user.userId, dto);
  }

  @Roles(UserRole.BUSINESS_OWNER, UserRole.ADMIN)
  @Delete('experiences/:id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(id, user.userId);
  }
}
