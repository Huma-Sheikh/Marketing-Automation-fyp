import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * The authenticated caller, as set by JwtAuthGuard. Use on guarded routes only:
 *
 *   @Get() list(@CurrentUser() user: AuthenticatedUser) { ... user.id ... }
 *   @Get() list(@CurrentUser('id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const user: AuthenticatedUser = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
