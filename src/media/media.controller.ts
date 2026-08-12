import { Body, Controller, Delete, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaType } from '../entities/media.entity';

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

  // multipart upload straight into the quality gate — in production the
  // client uploads directly to the presigned URL and only pings this
  // endpoint with the resulting key + a copy of the buffer for checking,
  // but accepting the file directly here keeps the MVP scaffold testable
  // without a real S3 bucket wired up.
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
  remove(@CurrentUser() user: any, @Param('id') businessId: string, @Param('mediaId') mediaId: string) {
    return this.service.remove(businessId, mediaId, user.userId);
  }
}
