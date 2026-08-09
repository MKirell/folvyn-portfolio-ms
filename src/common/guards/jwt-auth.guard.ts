import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { COGNITO_STRATEGY } from '@/auth/strategies/cognito.strategy'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

@Injectable()
export class JwtAuthGuard extends AuthGuard(COGNITO_STRATEGY) {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    return super.canActivate(context)
  }

  override handleRequest<TUser = AuthenticatedUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Authentication required')
    }
    return user
  }
}
