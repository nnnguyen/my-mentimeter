import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleProfile } from './strategies/google.strategy';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { upsert: jest.Mock; findUnique: jest.Mock } };

  const profile: GoogleProfile = {
    googleId: 'google-123',
    email: 'user@example.com',
    name: 'Nguyen Van A',
    avatarUrl: 'https://example.com/avatar.png',
  };

  beforeEach(async () => {
    prisma = { user: { upsert: jest.fn(), findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('signed-jwt') } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('creates a new user on first login', async () => {
    const createdUser = { id: 'user-1', ...profile };
    prisma.user.upsert.mockResolvedValue(createdUser);

    const result = await service.validateOAuthUser(profile);

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { googleId: profile.googleId },
      update: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
    expect(result).toEqual(createdUser);
  });

  it('updates name/avatar/email for an existing user on subsequent login', async () => {
    const updatedProfile: GoogleProfile = { ...profile, name: 'Nguyen Van B' };
    const updatedUser = { id: 'user-1', ...updatedProfile };
    prisma.user.upsert.mockResolvedValue(updatedUser);

    const result = await service.validateOAuthUser(updatedProfile);

    expect(result.name).toBe('Nguyen Van B');
  });

  it('signs a JWT with the user id, email and name', () => {
    const token = service.signToken({ id: 'user-1', ...profile } as never);
    expect(token).toBe('signed-jwt');
  });
});
