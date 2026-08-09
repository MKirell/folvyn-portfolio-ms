import { Controller, Get } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { AUTH_THROTTLE } from '@/auth/auth.constants'
import { Public } from '@/common/decorators/public.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { CognitoConfig } from '@/config/configuration'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

export interface AuthDiscovery {
  issuer: string
  region: string
  userPoolId: string
  clientId: string
  hostedUiDomain: string | null
  scopes: string[]
}

@Controller('auth')
@Throttle({ default: AUTH_THROTTLE })
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('config')
  discovery(): AuthDiscovery {
    const cognito = this.config.getOrThrow<CognitoConfig>('cognito')

    return {
      issuer: cognito.issuerUrl,
      region: cognito.region,
      userPoolId: cognito.userPoolId,
      clientId: cognito.frontendClientId,
      hostedUiDomain: cognito.hostedUiDomain,
      scopes: ['openid', 'profile', 'email', `${cognito.resourceServer}/admin`],
    }
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user
  }
}
