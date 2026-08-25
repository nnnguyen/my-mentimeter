import {
  Controller,
  Get,
  HttpCode,
  Post,
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
import { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_COOKIE_MAX_AGE_MS } from './auth.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects to Google's consent screen; no body needed.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: Request & { user: GoogleProfile }, @Res() res: Response) {
    const user = await this.authService.validateOAuthUser(req.user);
    const token = this.authService.signToken(user);

    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    });
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
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
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.json({ success: true });
  }
}
