import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  name: string;
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
