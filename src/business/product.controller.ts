import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Controller('businesses/:id/products')
export class BusinessProductController {
  constructor(private service: ProductService) {}

  @Get()
  findForBusiness(@Param('id') businessId: string) {
    return this.service.findForBusiness(businessId);
  }

  @Post()
  create(@CurrentUser() user: any, @Param('id') businessId: string, @Body() dto: CreateProductDto) {
    return this.service.create(businessId, user.userId, dto);
  }

  @Put(':productId')
  update(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(businessId, productId, user.userId, dto);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: any, @Param('id') businessId: string, @Param('productId') productId: string) {
    return this.service.remove(businessId, productId, user.userId);
  }

  @Post(':productId/images/upload-url')
  getUploadUrl(@CurrentUser() user: any, @Param('id') businessId: string, @Query('ext') ext: string) {
    return this.service.getUploadUrl(businessId, user.userId, ext);
  }

  // multipart upload straight into the quality gate — same shape as
  // MediaController's own submit route.
  @Post(':productId/images')
  @UseInterceptors(FileInterceptor('file'))
  addImage(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Param('productId') productId: string,
    @UploadedFile() file: any,
    @Query('url') url: string,
    @Query('storageKey') storageKey: string,
  ) {
    return this.service.addImage({
      businessId,
      productId,
      ownerId: user.userId,
      url,
      storageKey,
      buffer: file.buffer,
    });
  }

  @Delete(':productId/images/:imageId')
  removeImage(
    @CurrentUser() user: any,
    @Param('id') businessId: string,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.service.removeImage(businessId, productId, imageId, user.userId);
  }
}

// Separate top-level controller for the public, shareable single-
// product page — not nested under a business, since a shared link is
// just /products/:id, no business context needed to view it (Val, Sep
// 2026: "should also be shareable").
@Controller('products')
export class ProductController {
  constructor(private service: ProductService) {}

  @Get(':id')
  findOnePublic(@Param('id') id: string) {
    return this.service.findOnePublic(id);
  }
}
