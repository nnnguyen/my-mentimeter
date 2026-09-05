import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { GoogleProfile } from './strategies/google.strategy';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto, ResetPasswordDto } from './dto/auth-email.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async validateOAuthUser(profile: GoogleProfile): Promise<User> {
    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });
    if (byGoogleId) {
      return this.prisma.user.update({
        where: { id: byGoogleId.id },
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          isEmailVerified: true, // OAuth is verified
        },
      });
    }

    // Account may already exist from email/password registration with the
    // same email — link the Google identity to it instead of colliding on
    // the unique `email` constraint.
    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          name: byEmail.name ?? profile.name,
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          isEmailVerified: true,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        isEmailVerified: true,
      },
    });
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email đã tồn tại');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        verificationToken,
        isEmailVerified: false,
      },
    });

    await this.mailService.sendVerificationEmail(user.email, verificationToken);
    return { success: true, message: 'Vui lòng kiểm tra email để xác thực tài khoản' };
  }

  async login(dto: LoginDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.password) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Vui lòng xác thực email trước khi đăng nhập');
    }

    return user;
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verificationToken: token } });
    if (!user) {
      throw new UnauthorizedException('Token xác thực không hợp lệ');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null,
      },
    });

    return { success: true, email: user.email };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal user existence
      return { success: true, message: 'Nếu email tồn tại, yêu cầu đặt lại mật khẩu đã được gửi' };
    }

    const resetPasswordToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken, resetPasswordExpires },
    });

    await this.mailService.sendResetPasswordEmail(user.email, resetPasswordToken, user.name || '');
    return { success: true, message: 'Yêu cầu đặt lại mật khẩu đã được gửi' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: dto.token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    return { success: true };
  }

  signToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, email: user.email, name: user.name });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
