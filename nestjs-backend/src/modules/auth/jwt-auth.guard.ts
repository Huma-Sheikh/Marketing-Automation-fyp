import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Requires a valid `Authorization: Bearer <jwt>` header; sets request.user. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
