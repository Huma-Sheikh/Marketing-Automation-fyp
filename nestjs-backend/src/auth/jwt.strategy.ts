import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');

    // Fail at boot rather than silently signing every token with a publicly
    // known fallback string. This strategy previously read process.env directly
    // and defaulted to 'default_secret', so a missing JWT_SECRET produced an app
    // that looked fine and accepted forged tokens.
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

  async validate(payload: any) {
    return { id: payload.sub, email: payload.email };
  }
}
