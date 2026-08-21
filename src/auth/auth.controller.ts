import { Body, Controller, Get, Post, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GoogleAuthGuard } from './oauth-config.guard';

interface OAuthUser {
  email: string;
  name: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email, dto.resetUrlBase);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // POST /auth/refresh — requires a valid (not-yet-expired) JWT; re-issues
  // one with current role/businessId. Not @Public() — the guard already
  // gives us req.user.userId.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: { userId: string }) {
    return this.auth.refreshToken(user.userId);
  }

  // ---------- Google ----------

  // GET /auth/google — starts the OAuth redirect. GoogleAuthGuard checks
  // GOOGLE_CLIENT_ID/SECRET are set before handing off to passport; if
  // not, it throws a clear 503 instead of a broken redirect.
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth() {
    // Guard handles the redirect to Google — this body never runs.
  }

  // GET /auth/google/callback — Google redirects back here after consent.
  // Issues a real JWT the same way signup/login do, then redirects to the
  // frontend with the token in the URL so the SPA can pick it up and
  // store it (see FRONTEND_URL/auth-callback route on the frontend).
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request & { user: OAuthUser }, @Res() res: Response) {
    const result = await this.auth.oauthLogin({ ...req.user, provider: 'google' });
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/auth/callback?token=${result.accessToken}`);
  }
}
