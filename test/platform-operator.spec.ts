import { Test } from '@nestjs/testing'
import { getConnectionToken, getModelToken } from '@nestjs/mongoose'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { Owner } from '@/owner/owner.schema'
import { OwnerService } from '@/owner/owner.service'
import { OwnerLifecycleService } from '@/portfolio/me/owner-lifecycle.service'
import { IdentityDirectory } from '@/auth/identity.directory'
import { AuditEntry } from '@/platform/audit.schema'
import { AnalyticsDaily } from '@/analytics/schemas/analytics-daily.schema'
import { AnalyticsEvent } from '@/analytics/schemas/analytics-event.schema'
import { ErasureRequest } from '@/platform/erasure.schema'
import { PlatformService, editDistance, toCascade, ttlOf } from '@/platform/platform.service'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

const OWNER = '507f1f77bcf86cd799439021'
const ACTOR = { id: 'operator-sub', email: 'ada.lovelace@example.com' } as AuthenticatedUser

function chain(rows: unknown[]) {
  const result = {
    sort: () => result,
    limit: () => result,
    lean: () => result,
    exec: () => Promise.resolve(rows),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  }
  return result
}

describe('operator helpers', () => {
  it('measures how close a slug sits to a reserved word', () => {
    expect(editDistance('admin', 'admin')).toBe(0)
    expect(editDistance('admn', 'admin')).toBe(1)
    expect(editDistance('completely-different', 'api')).toBeGreaterThan(1)
  })

  it('reports a TTL index only when one is actually present', () => {
    expect(ttlOf([{ expireAfterSeconds: 2_592_000 }], 'analytics_events')).toEqual({
      collection: 'analytics_events',
      present: true,
      seconds: 2_592_000,
    })
    expect(ttlOf([{}], 'analytics_events')).toEqual({
      collection: 'analytics_events',
      present: false,
      seconds: null,
    })
  })

  it('reports a zero for every store when the cascade says nothing', () => {
    expect(toCascade(undefined)).toEqual({
      documents: 0,
      analytics: 0,
      assets: 0,
      identity: 0,
    })
    expect(toCascade({ documents: 12, analytics: 4, note: 'ignored' })).toEqual({
      documents: 12,
      analytics: 4,
    })
  })
})

describe('operator service', () => {
  let service: PlatformService
  let erasures: Record<string, jest.Mock>
  let audit: Record<string, jest.Mock>
  let lifecycle: { erase: jest.Mock; exportAll: jest.Mock }

  beforeEach(async () => {
    erasures = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      find: jest.fn(() => chain([])),
      findById: jest.fn(),
    }
    audit = { create: jest.fn().mockResolvedValue({}), find: jest.fn(() => chain([])) }
    lifecycle = { erase: jest.fn().mockResolvedValue({ documents: 9 }), exportAll: jest.fn() }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: getModelToken(Owner.name), useValue: { find: jest.fn(() => chain([])) } },
        { provide: getModelToken(AuditEntry.name), useValue: audit },
        {
          provide: getModelToken(AnalyticsDaily.name),
          useValue: { find: jest.fn(() => chain([])), aggregate: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getModelToken(AnalyticsEvent.name),
          useValue: {
            aggregate: jest.fn().mockResolvedValue([]),
            collection: { indexes: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: getModelToken(ErasureRequest.name), useValue: erasures },
        {
          provide: getConnectionToken(),
          useValue: {
            name: 'folvyn_portfolio',
            collection: () => ({
              countDocuments: () => Promise.resolve(0),
              estimatedDocumentCount: () => Promise.resolve(3),
              indexes: () => Promise.resolve([]),
            }),
          },
        },
        {
          provide: OwnerService,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: OWNER,
              slug: 'jane-doe',
              consentMode: 'measurement',
              plan: 'free',
            }),
          },
        },
        { provide: OwnerLifecycleService, useValue: lifecycle },
        {
          provide: IdentityDirectory,
          useValue: { describe: jest.fn().mockResolvedValue({ email: null }) },
        },
      ],
    }).compile()

    service = moduleRef.get(PlatformService)
  })

  it('publishes the reserved list and the limits the console has to honour', async () => {
    const config = await service.config()

    expect(config.reservedSlugs).toContain('admin')
    expect(config.reservedSlugs).toContain('fol')
    expect(config.limits.erasureDeadlineDays).toBe(30)
    expect(config.retention.rollupMonths).toBe(25)
    expect(config.environment.database).toBe('folvyn_portfolio')
    expect(config.ingest.map((row) => row.key)).toContain('Events per beacon')
    expect(config.privacy.map((row) => row.key)).toContain('Raw event retention')
    expect(config.runtime.map((row) => row.key)).toContain('Allowed origins')
    expect(config.environment.image).toBe('local')
  })

  it('queues an erasure with a thirty-day clock and writes an audit row', async () => {
    erasures.create.mockImplementation((doc: Record<string, unknown>) => ({
      _id: 'e1',
      cascade: {},
      completedAt: null,
      failure: null,
      state: 'pending',
      ...doc,
    }))

    const row = await service.queueErasure(ACTOR, OWNER, 'subject asked')

    expect(row.slug).toBe('jane-doe')
    expect(row.state).toBe('pending')
    expect(row.daysLeft).toBeGreaterThan(28)
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'erasure-queued', reason: 'subject asked' }),
    )
  })

  it('refuses to queue a second erasure for the same account', async () => {
    erasures.findOne.mockResolvedValue({ _id: 'existing' })

    await expect(service.queueErasure(ACTOR, OWNER, 'again')).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('records the cascade per store when an erasure runs', async () => {
    const request = {
      _id: 'e1',
      ownerId: OWNER,
      slug: 'jane-doe',
      reason: 'subject asked',
      requestedBy: 'ada.lovelace@example.com',
      state: 'pending',
      dueAt: new Date(Date.now() + 86_400_000),
      completedAt: null,
      cascade: {},
      failure: null,
      save: jest.fn().mockResolvedValue(undefined),
    }
    erasures.findById.mockResolvedValue(request)

    const row = await service.runErasure(ACTOR, 'e1')

    expect(lifecycle.erase).toHaveBeenCalledWith(OWNER)
    expect(row.state).toBe('done')
    expect(row.cascade).toEqual({ documents: 9 })
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'erasure-run' }))
  })

  it('marks an erasure failed and keeps the reason when a store throws', async () => {
    const request = {
      _id: 'e2',
      ownerId: OWNER,
      slug: 'jane-doe',
      reason: 'subject asked',
      requestedBy: null,
      state: 'pending',
      dueAt: new Date(Date.now() + 86_400_000),
      completedAt: null,
      cascade: {},
      failure: null,
      save: jest.fn().mockResolvedValue(undefined),
    }
    erasures.findById.mockResolvedValue(request)
    lifecycle.erase.mockRejectedValue(new Error('S3 refused'))

    const row = await service.runErasure(ACTOR, 'e2')

    expect(row.state).toBe('failed')
    expect(row.failure).toBe('S3 refused')
  })

  it('refuses to run an erasure that does not exist', async () => {
    erasures.findById.mockResolvedValue(null)

    await expect(service.runErasure(ACTOR, 'missing')).rejects.toBeInstanceOf(NotFoundException)
  })
})
