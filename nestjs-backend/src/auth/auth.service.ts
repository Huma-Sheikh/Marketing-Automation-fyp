import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Subscription } from '../database/entities/subscription.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string, businessName: string) {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('Email already registered');
    const hash = await bcrypt.hash(password, 12);
    const user = await this.userRepo.save(
      this.userRepo.create({ email, passwordHash: hash, businessName }),
    );
    // Create free subscription
    await this.subRepo.save(this.subRepo.create({ user: { id: user.id }, plan: 'free', status: 'active' }));
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, businessName: user.businessName } };
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, businessName: user.businessName } };
  }

  async getProfile(userId: string) {
    return this.userRepo.findOne({ where: { id: userId } });
  }
}
