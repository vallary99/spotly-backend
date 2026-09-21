import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bookmark } from './entities/bookmark.entity';
import { Business } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';
import { BookmarkService } from './bookmark.service';
import { BookmarkController } from './bookmark.controller';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bookmark, Business, Experience]), BusinessModule],
  providers: [BookmarkService],
  controllers: [BookmarkController],
})
export class BookmarkModule {}
