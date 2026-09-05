import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { GoogleProfile } from './strategies/google.strategy';
import type { AuthenticatedUser } from './strategies/jwt.strategy';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  ACCESS_TOKEN_COOKIE_OPTIONS,
} from './auth.constants';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const user = await this.authService.login(dto);
    const token = this.authService.signToken(user);

    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      ...ACCESS_TOKEN_COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    });
    res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl });
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects to Google's consent screen; no body needed.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    try {
      if (!req.user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
      }
      const user = await this.authService.validateOAuthUser(req.user);
      const token = this.authService.signToken(user);

      res.cookie(ACCESS_TOKEN_COOKIE, token, {
        ...ACCESS_TOKEN_COOKIE_OPTIONS,
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
      });
      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_error`);
    }
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  async session(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.authService.findById(currentUser.id);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res() res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_COOKIE_OPTIONS);
    res.json({ success: true });
  }
}
