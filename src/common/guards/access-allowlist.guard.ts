import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import { IdentityDirectory } from '@/auth/identity.directory'
import type { AppConfig } from '@/config/configuration'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

@Injectable()
export class AccessAllowlistGuard implements CanActivate {
  private readonly allowed: Set<string>

  constructor(
    private readonly reflector: Reflector,
    private readonly identities: IdentityDirectory,
    config: ConfigService,
  ) {
    const emails = config.getOrThrow<AppConfig>('app').accessAllowedEmails
    this.allowed = new Set(emails.map((email) => email.toLowerCase()))
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.allowed.size === 0) return true

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as AuthenticatedUser | undefined
    if (!user || user.isMachine) return true

    const email = user.email ?? (await this.identities.describe(user.username)).email
    if (!email || !this.allowed.has(email.toLowerCase())) {
      throw new ForbiddenException('This environment is limited to its testers')
    }
    return true
  }
}
