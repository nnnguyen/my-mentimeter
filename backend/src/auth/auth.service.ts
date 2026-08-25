import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { GoogleProfile } from './strategies/google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateOAuthUser(profile: GoogleProfile): Promise<User> {
    return this.prisma.user.upsert({
      where: { googleId: profile.googleId },
      update: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
  }

  signToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, email: user.email, name: user.name });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
