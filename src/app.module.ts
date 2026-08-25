import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import typeormConfig from './database/config/typeorm.config';
import { getEnvFile } from './libs/env/env-file';

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
import { TasksModule } from './tasks/tasks.module';
import { AdminModule } from './admin/admin.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [typeormConfig],
      // NODE_ENV picks the env file: local → .env.local, production →
      // .env.prod, unset → .env. A deployed environment that injects
      // real env vars instead of shipping a file still works — a missing
      // file is a no-op, and real env vars always win over file values.
      envFilePath: getEnvFile(),
    }),
    TypeOrmModule.forRootAsync({
      // Pulled from ConfigService rather than calling typeormConfig()
      // directly, so the env file is guaranteed loaded before the
      // connection options are read.
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<TypeOrmModuleOptions>('typeorm')!,
    }),
    TasksModule,
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
