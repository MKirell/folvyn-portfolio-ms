import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { SecretOrKeyProvider } from 'passport-jwt'
import { JWT_KEY_PROVIDER } from '@/auth/jwks.token'
import { toAuthenticatedUser } from '@/auth/oidc-claims'
import type { ClaimsPolicy } from '@/auth/oidc-claims'
import type { CognitoConfig } from '@/config/configuration'
import type { AuthenticatedUser, CognitoAccessToken } from '@/common/types/authenticated-user'

export const COGNITO_STRATEGY = 'cognito-jwt'

@Injectable()
export class CognitoStrategy extends PassportStrategy(Strategy, COGNITO_STRATEGY) {
  private readonly policy: ClaimsPolicy

  constructor(
    config: ConfigService,
    @Inject(JWT_KEY_PROVIDER) secretOrKeyProvider: SecretOrKeyProvider,
  ) {
    const cognito = config.getOrThrow<CognitoConfig>('cognito')
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider,
      ignoreExpiration: false,
      issuer: cognito.issuerUrl,
      algorithms: cognito.algorithms,
    })

    this.policy = {
      resourceServer: cognito.resourceServer,
      allowedClientIds: cognito.allowedClientIds,
    }
  }

  validate(payload: CognitoAccessToken): AuthenticatedUser {
    return toAuthenticatedUser(payload, this.policy)
  }
}
