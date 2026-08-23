import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [TypeOrmModule.forFeature([Business, Experience]), BusinessModule],
  providers: [HomeService],
  controllers: [HomeController],
})
export class HomeModule {}
