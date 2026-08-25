import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BookmarkService } from './bookmark.service';
import { CreateBookmarkDto } from './dto/bookmark.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Bookmarks')
@ApiBearerAuth()
@Controller('bookmarks')
export class BookmarkController {
  constructor(private service: BookmarkService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateBookmarkDto) {
    return this.service.create(user.userId, dto);
  }

  @Get()
  findForUser(@CurrentUser() user: any) {
    return this.service.findForUser(user.userId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.userId, id);
  }
}
