import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../database/entities/user.entity';
import { Subscription } from '../database/entities/subscription.entity';
import * as bcrypt from 'bcryptjs';

const mockUserRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockSubRepo = {
  create: jest.fn(),
  save: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('registers a new user and returns a JWT token', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const user = { id: 'uid-1', email: 'test@test.com', businessName: 'Acme' };
      mockUserRepo.create.mockReturnValue(user);
      mockUserRepo.save.mockResolvedValue(user);
      mockSubRepo.create.mockReturnValue({ plan: 'free' });
      mockSubRepo.save.mockResolvedValue({});

      const result = await service.register('test@test.com', 'secret123', 'Acme');

      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.email).toBe('test@test.com');
      expect(result.user.businessName).toBe('Acme');
    });

    it('creates a free subscription on registration', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const user = { id: 'uid-2', email: 'new@test.com', businessName: 'Biz' };
      mockUserRepo.create.mockReturnValue(user);
      mockUserRepo.save.mockResolvedValue(user);
      mockSubRepo.create.mockReturnValue({ plan: 'free', status: 'active' });
      mockSubRepo.save.mockResolvedValue({});

      await service.register('new@test.com', 'pass', 'Biz');

      expect(mockSubRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'free', status: 'active' }),
      );
      expect(mockSubRepo.save).toHaveBeenCalledTimes(1);
    });

    it('hashes password with bcrypt (12 rounds) before saving', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const user = { id: 'uid-3', email: 'a@b.com', businessName: 'X' };
      mockUserRepo.create.mockReturnValue(user);
      mockUserRepo.save.mockResolvedValue(user);
      mockSubRepo.create.mockReturnValue({});
      mockSubRepo.save.mockResolvedValue({});

      const hashSpy = jest.spyOn(bcrypt, 'hash');
      await service.register('a@b.com', 'plaintext', 'X');

      expect(hashSpy).toHaveBeenCalledWith('plaintext', 12);
    });

    it('throws ConflictException when email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.register('dup@test.com', 'pass', 'Biz'))
        .rejects.toThrow(ConflictException);
    });

    it('does not save user or subscription when email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.register('dup@test.com', 'pass', 'Biz')).rejects.toThrow();

      expect(mockUserRepo.save).not.toHaveBeenCalled();
      expect(mockSubRepo.save).not.toHaveBeenCalled();
    });

    it('signs JWT with correct payload (sub + email)', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const user = { id: 'uid-5', email: 'payload@test.com', businessName: 'P' };
      mockUserRepo.create.mockReturnValue(user);
      mockUserRepo.save.mockResolvedValue(user);
      mockSubRepo.create.mockReturnValue({});
      mockSubRepo.save.mockResolvedValue({});

      await service.register('payload@test.com', 'pass', 'P');

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'uid-5',
        email: 'payload@test.com',
      });
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    // bcrypt at cost 12 is deliberately slow (~0.3 s, and far worse when Jest is
    // running every suite in parallel). Hashing once here instead of inside each
    // test keeps the assertions identical but stops the suite from tripping
    // Jest's 5 s per-test timeout under load.
    let hash: string;
    beforeAll(async () => { hash = await bcrypt.hash('correct', 12); });

    it('returns token on valid credentials', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'uid-6', email: 'user@test.com', businessName: 'Biz', passwordHash: hash,
      });

      const result = await service.login('user@test.com', 'correct');

      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.email).toBe('user@test.com');
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.login('ghost@test.com', 'pass'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'uid-7', email: 'user@test.com', passwordHash: hash,
      });

      await expect(service.login('user@test.com', 'wrong'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('error message for missing user is "Invalid credentials" (no user enumeration)', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.login('x@x.com', 'pass')).rejects.toThrow('Invalid credentials');
    });

    it('error message for wrong password is "Invalid credentials"', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: '1', email: 'a@b.com', passwordHash: hash });

      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });
  });

  // ─── getProfile ──────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns user by id', async () => {
      const user = { id: 'uid-8', email: 'profile@test.com', businessName: 'P' };
      mockUserRepo.findOne.mockResolvedValue(user);

      const result = await service.getProfile('uid-8');

      expect(result).toEqual(user);
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: 'uid-8' } });
    });

    it('returns null for unknown userId', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.getProfile('nonexistent');

      expect(result).toBeNull();
    });
  });
});
