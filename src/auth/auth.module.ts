import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { AppleStrategy } from './apple.strategy';
import { GoogleAuthGuard, AppleAuthGuard } from './oauth-config.guard';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as any },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy, AppleStrategy, GoogleAuthGuard, AppleAuthGuard],
  controllers: [AuthController],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
