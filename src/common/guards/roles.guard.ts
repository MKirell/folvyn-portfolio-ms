import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import { ROLES_KEY } from '@/common/decorators/roles.decorator'
import type { Role } from '@/auth/roles'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as AuthenticatedUser | undefined
    const roles = user?.roles ?? []

    if (!required.some((role) => roles.includes(role))) {
      throw new ForbiddenException('Insufficient permissions')
    }
    return true
  }
}
