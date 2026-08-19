import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
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
import { UploadsController } from '@/uploads/uploads.controller'
import { UploadsService } from '@/uploads/uploads.service'
import { S3_CLIENT } from '@/uploads/s3.token'
import { ASSET_KEY_PATTERN, MAX_UPLOAD_BYTES } from '@/uploads/uploads.dto'
import {
  cognitoConfig,
  guestToken,
  ownerToken,
  platformToken,
  staticKeyProvider,
} from './support/cognito-token'

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(() => Promise.resolve('https://bucket.example/signed')),
}))

const assetsConfig = {
  bucket: 'folvyn-assets-000000000000',
  region: 'eu-west-3',
  baseUrl: 'https://folvyn.mkirell.com',
  urlTtl: 300,
}

describe('asset key pattern', () => {
  it.each([
    'degree-bachelor-2024.pdf',
    'resume_en_ada-lovelace.pdf',
    'off-image.jpeg',
    'folvyn-logo-dark.png',
    'award-awa-2023-1.jpg',
  ])('accepts %s, which the database already stores', (key) => {
    expect(ASSET_KEY_PATTERN.test(key)).toBe(true)
  })

  it.each([
    '../secret.pdf',
    'a/b/c.pdf',
    'awards/award-awa-2023-1.jpg',
    'Resume.PDF',
    'no-extension',
    'trailing/',
  ])('rejects %s', (key) => {
    expect(ASSET_KEY_PATTERN.test(key)).toBe(false)
  })
})

const OWNER = '507f1f77bcf86cd799439021'

describe('uploads endpoints', () => {
  let app: INestApplication
  let send: jest.Mock

  beforeAll(async () => {
    send = jest.fn()

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false, defaultStrategy: COGNITO_STRATEGY })],
      controllers: [UploadsController],
      providers: [
        UploadsService,
        { provide: S3_CLIENT, useValue: { send } },
        { provide: JWT_KEY_PROVIDER, useValue: staticKeyProvider },
        CognitoStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: OwnerScopeGuard },
        {
          provide: OwnerService,
          useValue: { ensureForUser: jest.fn().mockResolvedValue({ id: OWNER, slug: 'someone' }) },
        },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(false),
            getOrThrow: jest.fn((key: string) => (key === 'assets' ? assetsConfig : cognitoConfig)),
          },
        },
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

  beforeEach(() => {
    send.mockReset()
  })

  const presign = {
    filename: 'degree-bachelor-2024.pdf',
    contentType: 'application/pdf',
    size: 1024,
  }

  it('returns a presigned URL and the sanitized key to the owner', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send(presign)
      .expect(200)

    expect(response.body).toEqual({
      url: 'https://bucket.example/signed',
      key: 'degree-bachelor-2024.pdf',
      expiresIn: 300,
    })
  })

  it('writes under the folder CloudFront routes, with the owner inside it', async () => {
    const { getSignedUrl } = jest.requireMock<{ getSignedUrl: jest.Mock }>(
      '@aws-sdk/s3-request-presigner',
    )
    getSignedUrl.mockClear()

    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ filename: 'photo.png', contentType: 'image/png', size: 1024 })
      .expect(200)

    expect(getSignedUrl.mock.calls[0][1].input.Key).toBe(`imgs/${OWNER}/photo.png`)
  })

  it('rejects an anonymous presign', async () => {
    await request(app.getHttpServer()).post('/admin/uploads/presign').send(presign).expect(401)
  })

  it('lets any signed-in owner upload to their own prefix', async () => {
    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send(presign)
      .expect(200)
  })

  it('refuses an operator, who owns no portfolio', async () => {
    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${platformToken()}`)
      .send(presign)
      .expect(403)
  })

  it('rejects a content type outside the allowlist', async () => {
    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ...presign, contentType: 'application/x-msdownload' })
      .expect(400)
  })

  it('rejects a filename that would escape the bucket prefix', async () => {
    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ...presign, filename: '../../etc/passwd.pdf' })
      .expect(400)
  })

  it('rejects an upload above the ten megabyte cap', async () => {
    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ...presign, size: MAX_UPLOAD_BYTES + 1 })
      .expect(400)
  })

  it('rejects an unknown property instead of ignoring it', async () => {
    await request(app.getHttpServer())
      .post('/admin/uploads/presign')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ...presign, acl: 'public-read' })
      .expect(400)
  })

  it('lists the bucket, newest first, skipping folder markers', async () => {
    send.mockResolvedValueOnce({
      Contents: [
        {
          Key: `imgs/${OWNER}/b.jpg`,
          Size: 20,
          LastModified: new Date('2026-02-01T00:00:00Z'),
        },
        { Key: `imgs/${OWNER}/`, Size: 0, LastModified: new Date('2026-01-01T00:00:00Z') },
      ],
      IsTruncated: false,
    })
    send.mockResolvedValueOnce({
      Contents: [
        { Key: `files/${OWNER}/a.pdf`, Size: 10, LastModified: new Date('2026-01-01T00:00:00Z') },
      ],
      IsTruncated: false,
    })

    const response = await request(app.getHttpServer())
      .get('/admin/uploads')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(200)

    expect(response.body.map((asset: { key: string }) => asset.key)).toEqual(['b.jpg', 'a.pdf'])
  })

  it('follows the continuation token to the end of each folder', async () => {
    send
      .mockResolvedValueOnce({
        Contents: [
          { Key: `imgs/${OWNER}/a.jpg`, Size: 1, LastModified: new Date('2026-01-01T00:00:00Z') },
        ],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: `imgs/${OWNER}/b.jpg`, Size: 1, LastModified: new Date('2026-01-02T00:00:00Z') },
        ],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: `files/${OWNER}/c.pdf`, Size: 1, LastModified: new Date('2026-01-03T00:00:00Z') },
        ],
        IsTruncated: false,
      })

    const response = await request(app.getHttpServer())
      .get('/admin/uploads')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(200)

    expect(send).toHaveBeenCalledTimes(3)
    expect(response.body).toHaveLength(3)
  })

  it('deletes a key that sits inside a folder', async () => {
    send.mockResolvedValueOnce({})

    await request(app.getHttpServer())
      .delete(`/admin/uploads/${encodeURIComponent('b.jpg')}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(204)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].input.Key).toBe(`imgs/${OWNER}/b.jpg`)
  })

  it('deletes a document from the folder its extension belongs to', async () => {
    send.mockResolvedValueOnce({})

    await request(app.getHttpServer())
      .delete(`/admin/uploads/${encodeURIComponent('resume.pdf')}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(204)

    expect(send.mock.calls[0][0].input.Key).toBe(`files/${OWNER}/resume.pdf`)
  })

  it('refuses to delete a malformed key', async () => {
    await request(app.getHttpServer())
      .delete(`/admin/uploads/${encodeURIComponent('../../secret.pdf')}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(400)

    expect(send).not.toHaveBeenCalled()
  })
})

describe('uploads without a configured bucket', () => {
  let service: UploadsService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: S3_CLIENT, useValue: { send: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => ({ ...assetsConfig, bucket: '' })) },
        },
      ],
    }).compile()

    service = moduleRef.get(UploadsService)
  })

  it('lists nothing instead of failing, so the console can fall back to the repo', async () => {
    await expect(service.list(OWNER)).resolves.toEqual([])
  })

  it('still refuses the writes that genuinely cannot work', async () => {
    await expect(
      service.presign(OWNER, { filename: 'a.pdf', contentType: 'application/pdf', size: 1 }),
    ).rejects.toThrow('The asset bucket is not configured')
    await expect(service.remove(OWNER, 'a.pdf')).rejects.toThrow(
      'The asset bucket is not configured',
    )
  })

  it('has nothing to erase when there is no bucket', async () => {
    await expect(service.removeAllOwnedBy(OWNER)).resolves.toBe(0)
  })
})
