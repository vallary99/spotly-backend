import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaType } from './entities/media.entity';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('businesses/:id/media')
export class MediaController {
  constructor(private service: MediaService) {}

  @Post('upload-url')
  getUploadUrl(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Query('type') type: MediaType,
    @Query('ext') ext: string,
  ) {
    return this.service.getUploadUrl(businessId, user.userId, type, ext);
  }

  // multipart upload straight into the quality gate: the client POSTs the
  // bytes here with the key returned by /upload-url, and the backend runs
  // the quality check before persisting anything to storage.
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async submit(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @UploadedFile() file: any,
    @Query('type') type: MediaType,
    @Query('url') url: string,
    @Query('storageKey') storageKey: string,
    @Query('durationSeconds') durationSeconds?: string,
  ) {
    return this.service.submitForQualityCheck({
      businessId,
      ownerId: user.userId,
      type,
      url,
      storageKey,
      buffer: file.buffer,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
    });
  }

  @Delete(':mediaId')
  remove(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.service.remove(businessId, mediaId, user.userId);
  }
}
