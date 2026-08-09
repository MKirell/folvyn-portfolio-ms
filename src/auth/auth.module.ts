import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from '@/auth/auth.controller'
import { jwksKeyProvider } from '@/auth/jwks.provider'
import { cognitoIdpProvider } from '@/auth/cognito-idp.provider'
import { IdentityDirectory } from '@/auth/identity.directory'
import { CognitoStrategy, COGNITO_STRATEGY } from '@/auth/strategies/cognito.strategy'

@Module({
  imports: [PassportModule.register({ session: false, defaultStrategy: COGNITO_STRATEGY })],
  controllers: [AuthController],
  providers: [jwksKeyProvider, cognitoIdpProvider, IdentityDirectory, CognitoStrategy],
  exports: [IdentityDirectory],
})
export class AuthModule {}
