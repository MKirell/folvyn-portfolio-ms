import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AuthController } from '@/auth/auth.controller'
import { JWT_KEY_PROVIDER } from '@/auth/jwks.token'
import { CognitoStrategy, COGNITO_STRATEGY } from '@/auth/strategies/cognito.strategy'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'
import {
  ownerToken,
  CONSOLE_CLIENT_ID,
  cognitoConfig,
  ISSUER,
  REGION,
  staticKeyProvider,
  USER_POOL_ID,
} from './support/cognito-token'

describe('AuthController', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false, defaultStrategy: COGNITO_STRATEGY })],
      controllers: [AuthController],
      providers: [
        { provide: JWT_KEY_PROVIDER, useValue: staticKeyProvider },
        CognitoStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn(() => cognitoConfig) } },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /auth/config', () => {
    it('points a front-end at the user pool without a token', async () => {
      const { body } = await request(app.getHttpServer()).get('/auth/config').expect(200)

      expect(body).toEqual({
        issuer: ISSUER,
        region: REGION,
        userPoolId: USER_POOL_ID,
        clientId: CONSOLE_CLIENT_ID,
        hostedUiDomain: 'https://auth.mkirell.com',
        scopes: ['openid', 'profile', 'email', 'folvyn-portfolio-ms/admin'],
      })
    })

    it('leaks no secret', async () => {
      const { text } = await request(app.getHttpServer()).get('/auth/config').expect(200)

      expect(text.toLowerCase()).not.toContain('secret')
    })
  })

  describe('GET /auth/me', () => {
    it('echoes the identity carried by the token', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .expect(200)

      expect(body).toEqual({
        id: 'a3f1c0de-0000-4000-8000-000000000001',
        username: 'owner',
        email: null,
        displayName: 'owner',
        picture: null,
        roles: [],
        isMachine: false,
      })
    })

    it('is 401 without a token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401)
    })
  })

  it('exposes no token-issuing endpoint of its own', async () => {
    await request(app.getHttpServer()).post('/auth/login').expect(404)
    await request(app.getHttpServer()).post('/auth/refresh').expect(404)
    await request(app.getHttpServer()).post('/auth/logout').expect(404)
  })
})
