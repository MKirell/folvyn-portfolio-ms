import { Test } from '@nestjs/testing'
import { getConnectionToken, getModelToken } from '@nestjs/mongoose'
import { ConflictException } from '@nestjs/common'
import { Types } from 'mongoose'
import { Owner } from '@/owner/owner.schema'
import { OwnerService } from '@/owner/owner.service'
import { OwnerLifecycleService } from '@/portfolio/me/owner-lifecycle.service'
import { IdentityDirectory } from '@/auth/identity.directory'
import { AuditEntry } from '@/platform/audit.schema'
import { AnalyticsDaily } from '@/analytics/schemas/analytics-daily.schema'
import { AnalyticsEvent } from '@/analytics/schemas/analytics-event.schema'
import { ErasureRequest } from '@/platform/erasure.schema'
import { PlatformService } from '@/platform/platform.service'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

const ACTOR = { id: 'operator-sub', email: 'ada.lovelace@example.com' } as AuthenticatedUser
const OWNER_ID = new Types.ObjectId('507f1f77bcf86cd799439021')

function chain(rows: unknown[]) {
  const result: Record<string, unknown> = {
    sort: () => result,
    limit: () => result,
    lean: () => result,
    select: () => result,
    exec: () => Promise.resolve(rows),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  }
  return result
}

function ownerRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: OWNER_ID,
    slug: 'ada-lovelace',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    status: 'published',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  }
}

interface Harness {
  service: PlatformService
  owners: Record<string, jest.Mock>
  audit: Record<string, jest.Mock>
  daily: Record<string, jest.Mock>
  events: Record<string, unknown>
  lifecycle: { erase: jest.Mock; exportAll: jest.Mock }
  ownerService: { findById: jest.Mock }
}

async function harness(options: { owner?: Record<string, unknown>; rows?: unknown[] } = {}) {
  const rows = options.rows ?? [ownerRow()]

  const owners = {
    find: jest.fn(() => chain(rows)),
    updateOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
    countDocuments: jest.fn(() => ({ exec: () => Promise.resolve(rows.length) })),
  } as unknown as Record<string, jest.Mock>

  const audit = {
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn(() => chain([])),
  } as unknown as Record<string, jest.Mock>

  const daily = {
    find: jest.fn(() => chain([])),
    aggregate: jest.fn().mockResolvedValue([]),
  } as unknown as Record<string, jest.Mock>

  const events = {
    aggregate: jest.fn().mockResolvedValue([]),
    collection: { indexes: jest.fn().mockResolvedValue([]) },
  }

  const lifecycle = {
    erase: jest.fn().mockResolvedValue({ documents: 9 }),
    exportAll: jest.fn().mockResolvedValue({ owner: { slug: 'ada-lovelace' } }),
  }

  const ownerService = {
    findById: jest.fn().mockResolvedValue({
      id: String(OWNER_ID),
      slug: 'ada-lovelace',
      consentMode: 'measurement',
      plan: 'free',
      status: 'published',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...options.owner,
    }),
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      PlatformService,
      { provide: getModelToken(Owner.name), useValue: owners },
      { provide: getModelToken(AuditEntry.name), useValue: audit },
      { provide: getModelToken(AnalyticsDaily.name), useValue: daily },
      { provide: getModelToken(AnalyticsEvent.name), useValue: events },
      {
        provide: getModelToken(ErasureRequest.name),
        useValue: {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          find: jest.fn(() => chain([])),
          findById: jest.fn(),
        },
      },
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
      { provide: OwnerService, useValue: ownerService },
      { provide: OwnerLifecycleService, useValue: lifecycle },
      {
        provide: IdentityDirectory,
        useValue: { describe: jest.fn().mockResolvedValue({ email: 'ada@example.com' }) },
      },
    ],
  }).compile()

  return {
    service: moduleRef.get(PlatformService),
    owners,
    audit,
    daily,
    events,
    lifecycle,
    ownerService,
  } as Harness
}

describe('listing portfolios', () => {
  it('reports metadata only, never a document of theirs', async () => {
    const { service } = await harness()
    const [row] = await service.portfolios({})

    expect(row).toEqual({
      id: String(OWNER_ID),
      slug: 'ada-lovelace',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      status: 'published',
      createdAt: '2026-07-01T00:00:00.000Z',
      publishedAt: '2026-08-01T00:00:00.000Z',
      sessions: 0,
      visitors: 0,
    })
  })

  it('filters by status when one is asked for', async () => {
    const { service, owners } = await harness()
    await service.portfolios({ status: 'suspended' })

    expect(owners.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'suspended' }))
  })

  it('searches slug and email, escaping what the operator typed', async () => {
    const { service, owners } = await harness()
    await service.portfolios({ query: 'a.b*' })

    const filter = owners.find.mock.calls[0][0] as { $or: { slug?: RegExp }[] }
    expect(filter.$or).toHaveLength(2)
    expect(filter.$or[0].slug?.source).toContain('a\\.b\\*')
  })

  it('reports a portfolio that has never been published as having no date', async () => {
    const { service } = await harness({
      rows: [ownerRow({ publishedAt: null, createdAt: undefined, status: 'draft' })],
    })
    const [row] = await service.portfolios({})

    expect(row.publishedAt).toBeNull()
    expect(row.createdAt).toBeNull()
  })
})

describe('suspending and restoring', () => {
  it('suspends a live portfolio and writes an audit row', async () => {
    const { service, owners, audit } = await harness()
    await service.suspend(ACTOR, String(OWNER_ID), 'spam')

    expect(owners.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $set: { status: 'suspended' },
    })
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'suspend', reason: 'spam' }),
    )
  })

  it('refuses to suspend one that already is', async () => {
    const { service } = await harness({ owner: { status: 'suspended' } })

    await expect(service.suspend(ACTOR, String(OWNER_ID), 'spam')).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('restores a suspended portfolio to what it was before', async () => {
    const { service, owners } = await harness({ owner: { status: 'suspended' } })
    await service.restore(ACTOR, String(OWNER_ID))

    expect(owners.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $set: { status: 'published' },
    })
  })

  it('restores an unpublished portfolio to draft, not to published', async () => {
    const { service, owners } = await harness({
      owner: { status: 'suspended', publishedAt: null },
    })
    await service.restore(ACTOR, String(OWNER_ID))

    expect(owners.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { status: 'draft' } })
  })

  it('refuses to restore one that is not suspended', async () => {
    const { service } = await harness()

    await expect(service.restore(ACTOR, String(OWNER_ID))).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('erasing and exporting', () => {
  it('runs the same cascade as self-service erasure, and records it', async () => {
    const { service, lifecycle, audit } = await harness()
    await service.erase(ACTOR, String(OWNER_ID), 'gdpr')

    expect(lifecycle.erase).toHaveBeenCalled()
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'erase' }))
  })

  it('records that an operator read an account before handing over the export', async () => {
    const { service, lifecycle, audit } = await harness()
    await service.exportOne(ACTOR, String(OWNER_ID))

    expect(lifecycle.exportAll).toHaveBeenCalled()
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'export' }))
  })
})

describe('reading one account', () => {
  it('writes an audit row for the read itself, which is what accountability means', async () => {
    const { service, audit } = await harness()
    const detail = await service.accountDetail(ACTOR, String(OWNER_ID))

    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'read-account' }))
    expect(detail.account.slug).toBe('ada-lovelace')
  })
})

describe('the health and moderation reads', () => {
  it('reports storage against the free-tier ceiling', async () => {
    const { service } = await harness()
    const storage = await service.storage()

    expect(storage).toHaveProperty('collections')
  })

  it('reports ingest with a TTL row per analytics collection', async () => {
    const { service } = await harness()
    const report = await service.ingest(30)

    expect(report.ttl.length).toBeGreaterThan(0)
    expect(report.ttl.every((row) => row.present === false)).toBe(true)
  })

  it('groups errors rather than listing every occurrence', async () => {
    const { service } = await harness()

    await expect(service.errorGroups(30)).resolves.toEqual([])
  })

  it('builds a moderation board out of the account list', async () => {
    const { service } = await harness()
    const board = await service.moderation()

    expect(board).toHaveProperty('recentlyPublished')
    expect(board).toHaveProperty('nearMisses')
  })

  it('reads the erasure queue and the audit log', async () => {
    const { service } = await harness()

    await expect(service.erasureQueue()).resolves.toEqual([])
    await expect(service.entries(10)).resolves.toEqual([])
  })
})
