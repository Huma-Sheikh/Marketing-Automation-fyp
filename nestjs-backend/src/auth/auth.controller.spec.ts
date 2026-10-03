import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  getProfile: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── POST /auth/register ─────────────────────────────────────────────────────

  describe('register', () => {
    it('delegates to AuthService.register with correct args', async () => {
      const payload = { token: 'tok', user: { id: '1', email: 'a@b.com', businessName: 'B' } };
      mockAuthService.register.mockResolvedValue(payload);

      const result = await controller.register({
        email: 'a@b.com',
        password: 'pass',
        businessName: 'B',
      });

      expect(mockAuthService.register).toHaveBeenCalledWith('a@b.com', 'pass', 'B');
      expect(result).toEqual(payload);
    });

    it('propagates exceptions from AuthService', async () => {
      mockAuthService.register.mockRejectedValue(new Error('Email already registered'));

      await expect(
        controller.register({ email: 'dup@b.com', password: 'p', businessName: 'B' }),
      ).rejects.toThrow('Email already registered');
    });
  });

  // ─── POST /auth/login ────────────────────────────────────────────────────────

  describe('login', () => {
    it('delegates to AuthService.login', async () => {
      const payload = { token: 'tok', user: { id: '2', email: 'b@c.com', businessName: 'C' } };
      mockAuthService.login.mockResolvedValue(payload);

      const result = await controller.login({ email: 'b@c.com', password: 'pw' });

      expect(mockAuthService.login).toHaveBeenCalledWith('b@c.com', 'pw');
      expect(result).toEqual(payload);
    });

    it('propagates UnauthorizedException from AuthService', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        controller.login({ email: 'bad@c.com', password: 'wrong' }),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  // ─── GET /auth/me ────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('calls AuthService.getProfile with userId from request', async () => {
      const user = { id: 'uid-9', email: 'me@test.com', businessName: 'Me' };
      mockAuthService.getProfile.mockResolvedValue(user);

      const mockReq = { user: { id: 'uid-9' } };
      const result = await controller.getProfile(mockReq);

      expect(mockAuthService.getProfile).toHaveBeenCalledWith('uid-9');
      expect(result).toEqual(user);
    });
  });
});
