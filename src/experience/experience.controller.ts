import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExperienceService } from './experience.service';
import { CreateExperienceDto, UpdateExperienceDto } from './dto/experience.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Experiences')
@Controller()
export class ExperienceController {
  constructor(private service: ExperienceService) {}

  // POST /businesses/:id/experience-image — cover image upload, used by
  // both the create form and edit flow. Returns a URL to include in the
  // experience's `images` array; doesn't create the experience itself.
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiBearerAuth()
  @Post('businesses/:id/experience-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadCoverImage(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @UploadedFile() file: any,
  ) {
    return this.service.uploadCoverImage(businessId, user.userId, file.buffer);
  }

  // POST /businesses/:id/experiences — FR-9.1: Business Account only.
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiBearerAuth()
  @Post('businesses/:id/experiences')
  create(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Body() dto: CreateExperienceDto,
  ) {
    return this.service.create(businessId, user.userId, dto);
  }

  @Public()
  @Get('experiences')
  findAll(@Query('upcoming') upcoming?: string) {
    return this.service.findAll({ upcoming: upcoming === 'true' });
  }

  @Roles(UserRole.BUSINESS_OWNER)
  @ApiBearerAuth()
  @Put('experiences/:id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  @Roles(UserRole.BUSINESS_OWNER)
  @ApiBearerAuth()
  @Delete('experiences/:id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(id, user.userId);
  }
}
