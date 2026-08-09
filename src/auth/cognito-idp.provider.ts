import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { ConfigService } from '@nestjs/config'
import type { Provider } from '@nestjs/common'
import { COGNITO_IDP_CLIENT } from '@/auth/cognito-idp.token'
import type { CognitoConfig } from '@/config/configuration'

export const cognitoIdpProvider: Provider = {
  provide: COGNITO_IDP_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): CognitoIdentityProviderClient => {
    const cognito = config.getOrThrow<CognitoConfig>('cognito')
    return new CognitoIdentityProviderClient({ region: cognito.region })
  },
}
