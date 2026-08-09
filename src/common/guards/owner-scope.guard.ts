import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import { Role } from '@/auth/roles'
import { OwnerService } from '@/owner/owner.service'
import type { OwnerRecord } from '@/owner/owner.service'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

export type OwnerScopedRequest = Request & { owner?: OwnerRecord }

@Injectable()
export class OwnerScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly owners: OwnerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<OwnerScopedRequest>()
    const user = request.user as AuthenticatedUser | undefined
    if (!user || user.isMachine || user.roles.includes(Role.Platform)) return true

    request.owner = await this.owners.ensureForUser(user)
    return true
  }
}
