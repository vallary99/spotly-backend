import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  name: string;

  // Same reasoning as ForgotPasswordDto.resetUrlBase below — the
  // verification link has to land back on whichever frontend actually
  // sent this signup request. Optional with a FRONTEND_URL fallback
  // server-side (see AuthService.signup) — required would mean a
  // backend deployed even slightly ahead of an updated frontend starts
  // rejecting every signup outright, which is a worse failure mode than
  // occasionally guessing the wrong frontend origin.
  @IsOptional()
  @IsString()
  verifyUrlBase?: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  verifyUrlBase?: string;
}

export class VerifyEmailDto {
  @IsString()
  token: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  // The requesting frontend's own origin (e.g. "http://localhost:3001"
  // or "https://admin.spotly.co.ke") — the same backend serves both
  // spotly-web and spotly-admin, and the reset link has to land back on
  // whichever one actually asked, not a hardcoded default.
  @IsString()
  resetUrlBase: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
