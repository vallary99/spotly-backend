import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private service: SearchService) {}

  @Public()
  @Get()
  autocomplete(@Query('q') q: string) {
    return this.service.autocomplete(q);
  }
}
