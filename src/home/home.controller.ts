import { Controller, Get, Query } from '@nestjs/common';
import { HomeService } from './home.service';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Home')
@Controller('home')
export class HomeController {
  constructor(private service: HomeService) {}

  @Public()
  @Get()
  getHome(
    @Query('city') city?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('category') category?: string,
    @Query('categories') categories?: string,
    @Query('q') q?: string,
    @Query('isHiddenGem') isHiddenGem?: string,
  ) {
    return this.service.getHome({
      city,
      neighborhood,
      category,
      categories,
      q,
      isHiddenGem: isHiddenGem === 'true',
    });
  }
}
