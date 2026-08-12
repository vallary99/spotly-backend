import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import typeormConfig from './config/typeorm.config';

import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { ExperienceModule } from './experience/experience.module';
import { ReviewModule } from './review/review.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { SearchModule } from './search/search.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { PaymentModule } from './payment/payment.module';
import { MediaModule } from './media/media.module';
import { HomeModule } from './home/home.module';
import { QueueModule } from './queue/queue.module';
import { AdminModule } from './admin/admin.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [typeormConfig] }),
    TypeOrmModule.forRootAsync({
      useFactory: () => typeormConfig(),
    }),
    QueueModule,
    AuthModule,
    BusinessModule,
    ExperienceModule,
    ReviewModule,
    BookmarkModule,
    SearchModule,
    SubscriptionModule,
    PaymentModule,
    MediaModule,
    HomeModule,
    AdminModule,
  ],
  providers: [
    // NFR-7: JWT auth + role-based guards applied globally; individual
    // routes opt out with @Public() (guest browsing) rather than opting
    // in, so a forgotten decorator fails closed, not open.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  controllers: [HealthController],
})
export class AppModule {}
