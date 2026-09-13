import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from './entities/business.entity';
import { Product, ProductImage } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { Neighborhood } from './entities/neighborhood.entity';
import { QuickFilterGroup } from './entities/quick-filter-group.entity';
import { User } from '../auth/entities/user.entity';
import { Experience } from '../experience/entities/experience.entity';
import { UsageEvent } from '../tasks/entities/usage-event.entity';
import { Media } from '../media/entities/media.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { ProductService } from './product.service';
import { BusinessProductController, ProductController } from './product.controller';
import { EmailModule } from '../email/email.module';
import { TasksModule } from '../tasks/tasks.module';
import { SystemConfigModule } from '../config/config.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Product, ProductImage, Category, Neighborhood, QuickFilterGroup, User, Experience, UsageEvent, Media]),
    TasksModule,
    EmailModule,
    SystemConfigModule,
    MediaModule,
  ],
  providers: [BusinessService, ProductService],
  controllers: [BusinessController, BusinessProductController, ProductController],
  exports: [TypeOrmModule, BusinessService],
})
export class BusinessModule {}
