import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../entities/business.entity';
import { Experience } from '../entities/experience.entity';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Business, Experience])],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
