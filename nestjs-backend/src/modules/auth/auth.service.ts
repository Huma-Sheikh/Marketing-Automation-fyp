import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Subscription } from '../../database/entities/subscription.entity';
import { User } from '../../database/entities/user.entity';

const BCRYPT_ROUNDS = 12;

/** A user as the API exposes it: everything except the password hash. */
export type PublicUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string, businessName: string) {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.userRepo.save(this.userRepo.create({ email, passwordHash, businessName }));
    // Every account starts on the free plan.
    await this.subRepo.save(this.subRepo.create({ user: { id: user.id }, plan: 'free', status: 'active' }));
    return this.issueToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    // Same message for "no such user" and "wrong password" so the endpoint
    // cannot be used to discover which emails are registered.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(user);
  }

  /** The caller's own profile. The password hash never leaves the server. */
  async getProfile(userId: string): Promise<PublicUser | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;
    const { passwordHash: _hash, ...profile } = user;
    return profile;
  }

  private issueToken(user: User) {
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, businessName: user.businessName } };
  }
}
