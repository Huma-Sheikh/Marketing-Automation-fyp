import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');

    // Boot-time env validation (config/env.validation.ts) already enforces
    // this; the check stays here too so the strategy can never be constructed
    // with a weak or missing secret — e.g. in a test module that skips
    // validation — and silently accept forged tokens.
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a random string of at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return { id: payload.sub, email: payload.email };
  }
}
