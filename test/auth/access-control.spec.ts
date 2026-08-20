import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { getConnectionToken } from '@nestjs/mongoose'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { JWT_KEY_PROVIDER } from '@/auth/jwks.token'
import { CognitoStrategy, COGNITO_STRATEGY } from '@/auth/strategies/cognito.strategy'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { OwnerScopeGuard } from '@/common/guards/owner-scope.guard'
import { OwnerService } from '@/owner/owner.service'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'
import { HealthController } from '@/health/health.controller'
import { PortfolioController } from '@/portfolio/portfolio.controller'
import { PortfolioService } from '@/portfolio/portfolio.service'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { ExperienceController } from '@/portfolio/experience/experience.controller'
import { ExperienceService } from '@/portfolio/experience/experience.service'
import {
  accessToken,
  ownerToken,
  ADMIN_SCOPE,
  cognitoConfig,
  foreignKeys,
  guestToken,
  machineToken,
  staticKeyProvider,
} from '../support/cognito-token'

const validExperience = {
  company: 'Acme Corp',
  startDate: '2025-09',
  country: 'FR',
  tags: ['LangGraph'],
  translations: {
    en: { role: 'Backend Engineer', bullets: ['Built things'] },
  },
}

const SLUG = 'ada-lovelace'
const OWNER = '507f1f77bcf86cd799439021'

describe('read/write access control', () => {
  let app: INestApplication
  let ownerService: { ensureForUser: jest.Mock; findPublishedBySlug: jest.Mock }
  let portfolioService: { resolve: jest.Mock }
  let experienceService: {
    findAll: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    update: jest.Mock
    remove: jest.Mock
    reorder: jest.Mock
  }

  beforeAll(async () => {
    ownerService = {
      ensureForUser: jest.fn().mockResolvedValue({ id: OWNER, slug: SLUG }),
      findPublishedBySlug: jest.fn().mockResolvedValue({ id: OWNER, slug: SLUG }),
    }
    portfolioService = { resolve: jest.fn().mockResolvedValue({ lang: 'en', experiences: [] }) }
    experienceService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((dto: unknown) => Promise.resolve(dto)),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
      reorder: jest.fn().mockResolvedValue([]),
    }

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false, defaultStrategy: COGNITO_STRATEGY })],
      controllers: [HealthController, PortfolioController, ExperienceController],
      providers: [
        { provide: JWT_KEY_PROVIDER, useValue: staticKeyProvider },
        CognitoStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: OwnerScopeGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === 'app.defaultSlug' ? SLUG : false)),
            getOrThrow: jest.fn(() => cognitoConfig),
          },
        },
        { provide: OwnerService, useValue: ownerService },
        { provide: PortfolioService, useValue: portfolioService },
        {
          provide: LocaleService,
          useValue: { findEnabled: jest.fn().mockResolvedValue([{ code: 'en' }]) },
        },
        { provide: ExperienceService, useValue: experienceService },
        { provide: getConnectionToken(), useValue: { readyState: 1 } },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        transform: true,
      }),
    )
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('the portfolio viewer, unauthenticated', () => {
    it('is not served a portfolio without naming one', async () => {
      await request(app.getHttpServer()).get('/portfolio').expect(404)
    })

    it('reads a portfolio by its address', async () => {
      await request(app.getHttpServer()).get(`/portfolio/${SLUG}`).expect(200)

      expect(ownerService.findPublishedBySlug).toHaveBeenCalledWith(SLUG)
      expect(portfolioService.resolve).toHaveBeenCalledWith(OWNER, undefined, SLUG, undefined)
    })

    it('never reaches an unpublished portfolio', async () => {
      ownerService.findPublishedBySlug.mockRejectedValueOnce(new NotFoundException('nope'))

      await request(app.getHttpServer()).get('/portfolio/someone-else').expect(404)
    })

    it('lists the available languages', async () => {
      await request(app.getHttpServer()).get('/portfolio/languages').expect(200)
    })

    it('reaches the health probe', async () => {
      await request(app.getHttpServer()).get('/health').expect(200)
    })
  })

  describe('write endpoints without a token', () => {
    it.each([
      ['post', '/admin/experiences'],
      ['patch', '/admin/experiences/507f1f77bcf86cd799439011'],
      ['delete', '/admin/experiences/507f1f77bcf86cd799439011'],
      ['patch', '/admin/experiences/reorder'],
    ])('rejects %s %s with 401', async (method, path) => {
      const server = request(app.getHttpServer())
      await server[method as 'post'](path).send({}).expect(401)
    })

    it('rejects reading the admin list with 401', async () => {
      await request(app.getHttpServer()).get('/admin/experiences').expect(401)
      expect(experienceService.findAll).not.toHaveBeenCalled()
    })

    it('rejects a malformed bearer token', async () => {
      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401)
    })
  })

  describe('tokens the user pool did not mint', () => {
    it('rejects one signed with a key outside the pool JWKS', async () => {
      const swapped = accessToken({ scope: ADMIN_SCOPE }, { privateKey: foreignKeys.privateKey })

      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${swapped}`)
        .expect(401)
    })

    it('rejects one issued by a different user pool', async () => {
      const otherPool = accessToken(
        { scope: ADMIN_SCOPE },
        { issuer: 'https://cognito-idp.eu-west-3.amazonaws.com/eu-west-3_Someone1' },
      )

      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${otherPool}`)
        .expect(401)
    })

    it('rejects one minted for an app client this service does not serve', async () => {
      const foreignClient = accessToken({ scope: ADMIN_SCOPE, client_id: 'someone-elses-app' })

      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${foreignClient}`)
        .expect(401)
    })

    it('rejects an expired token', async () => {
      const expired = accessToken({ scope: ADMIN_SCOPE }, { expiresIn: '-1s' })

      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401)
    })

    it('rejects an id token presented as an access token', async () => {
      const idToken = accessToken({ token_use: 'id', scope: ADMIN_SCOPE })

      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${idToken}`)
        .expect(401)
    })
  })

  describe('an authenticated caller in no group', () => {
    it('owns their own data rather than being locked out', async () => {
      await request(app.getHttpServer())
        .post('/admin/experiences')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validExperience)
        .expect(201)

      expect(experienceService.create).toHaveBeenCalledWith(OWNER, expect.anything())
    })

    it('reads only through their own owner id', async () => {
      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200)

      expect(experienceService.findAll).toHaveBeenCalledWith(OWNER)
    })

    it('is provisioned an owner record from the token subject alone', async () => {
      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200)

      const [user] = ownerService.ensureForUser.mock.calls.at(-1) as [{ id: string }]
      expect(user.id).toBe('a3f1c0de-0000-4000-8000-000000000002')
    })
  })

  describe('a machine token', () => {
    it('cannot reach owner-scoped data even with the admin scope', async () => {
      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${machineToken()}`)
        .expect(403)
    })

    it('is never provisioned a portfolio', async () => {
      ownerService.ensureForUser.mockClear()

      await request(app.getHttpServer())
        .post('/admin/experiences')
        .set('Authorization', `Bearer ${machineToken()}`)
        .send(validExperience)
        .expect(403)

      expect(ownerService.ensureForUser).not.toHaveBeenCalled()
    })
  })

  describe('a portfolio owner', () => {
    it('creates an entry', async () => {
      await request(app.getHttpServer())
        .post('/admin/experiences')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send(validExperience)
        .expect(201)

      expect(experienceService.create).toHaveBeenCalled()
    })

    it('deletes an entry', async () => {
      await request(app.getHttpServer())
        .delete('/admin/experiences/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .expect(204)
    })

    it('reorders entries', async () => {
      await request(app.getHttpServer())
        .patch('/admin/experiences/reorder')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ entries: [{ id: '507f1f77bcf86cd799439011', order: 0 }] })
        .expect(200)

      expect(experienceService.reorder).toHaveBeenCalled()
    })

    it('needs no group at all', async () => {
      const viaGroup = accessToken({ 'cognito:groups': [] })

      await request(app.getHttpServer())
        .get('/admin/experiences')
        .set('Authorization', `Bearer ${viaGroup}`)
        .expect(200)
    })

    it('is still rejected when the payload fails validation', async () => {
      await request(app.getHttpServer())
        .post('/admin/experiences')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ company: 'Acme' })
        .expect(400)
    })

    it('rejects unknown properties instead of silently storing them', async () => {
      await request(app.getHttpServer())
        .post('/admin/experiences')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ ...validExperience, isSuperAdmin: true })
        .expect(400)
    })

    it('rejects a translation whose language code is not a language code', async () => {
      await request(app.getHttpServer())
        .post('/admin/experiences')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ...validExperience,
          translations: { 'not-a-lang': validExperience.translations.en },
        })
        .expect(400)
    })
  })
})
