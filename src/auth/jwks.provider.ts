import { ConfigService } from '@nestjs/config'
import { passportJwtSecret } from 'jwks-rsa'
import type { Provider } from '@nestjs/common'
import type { SecretOrKeyProvider } from 'passport-jwt'
import { JWT_KEY_PROVIDER } from '@/auth/jwks.token'
import type { CognitoConfig } from '@/config/configuration'

export const jwksKeyProvider: Provider = {
  provide: JWT_KEY_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SecretOrKeyProvider => {
    const cognito = config.getOrThrow<CognitoConfig>('cognito')

    return passportJwtSecret({
      jwksUri: cognito.jwksUri,
      cache: true,
      cacheMaxAge: cognito.jwksCacheMaxAge,
      rateLimit: true,
      jwksRequestsPerMinute: cognito.jwksRequestsPerMinute,
      timeout: cognito.jwksTimeout,
    }) as SecretOrKeyProvider
  },
}
