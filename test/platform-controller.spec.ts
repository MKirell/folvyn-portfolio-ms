import { ConnectionStates } from 'mongoose'
import { PlatformController } from '@/platform/platform.controller'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

const ACTOR = { id: 'operator-sub', email: 'ada.lovelace@example.com' } as AuthenticatedUser

const SUMMARY = {
  totals: { sessions: 40 },
  errors: [{ key: 'boom', count: 2 }],
  vitals: { lcp: 1200 },
}

function counter(value: number) {
  return { exec: async () => value }
}

function build(overrides: Record<string, unknown> = {}) {
  const platform = {
    portfolios: jest.fn().mockResolvedValue(['row']),
    suspend: jest.fn().mockResolvedValue('suspended'),
    restore: jest.fn().mockResolvedValue('restored'),
    exportOne: jest.fn().mockResolvedValue('export'),
    erase: jest.fn().mockResolvedValue(undefined),
    accountDetail: jest.fn().mockResolvedValue('detail'),
    moderation: jest.fn().mockResolvedValue('board'),
    ingest: jest.fn().mockResolvedValue('ingest'),
    erasureQueue: jest.fn().mockResolvedValue(['erasure']),
    queueErasure: jest.fn().mockResolvedValue('queued'),
    runErasure: jest.fn().mockResolvedValue('ran'),
    config: jest.fn().mockResolvedValue('config'),
    entries: jest.fn().mockResolvedValue(['entry']),
    errorGroups: jest.fn().mockResolvedValue([{ key: 'boom', count: 2, owners: 1 }]),
    storage: jest.fn().mockResolvedValue({ usedMb: 1 }),
  }

  const rollup = { summary: jest.fn().mockResolvedValue(SUMMARY) }

  const prerender = {
    enabled: true,
    recent: jest.fn().mockReturnValue([{ succeeded: true }, { succeeded: false }]),
  }

  const owners = { countDocuments: jest.fn().mockReturnValue(counter(3)) }
  const daily = { aggregate: jest.fn().mockResolvedValue([]) }
  const connection = { readyState: ConnectionStates.connected }

  const controller = new PlatformController(
    platform as never,
    rollup as never,
    prerender as never,
    owners as never,
    daily as never,
    { ...connection, ...overrides } as never,
  )

  return { controller, platform, rollup, prerender, owners, daily }
}

describe('PlatformController', () => {
  it('delegates every owner-scoped action to the service, actor included', async () => {
    const { controller, platform } = build()

    await expect(controller.portfolios({})).resolves.toEqual(['row'])
    await expect(controller.suspend(ACTOR, 'id', { reason: 'spam' })).resolves.toBe('suspended')
    await expect(controller.restore(ACTOR, 'id')).resolves.toBe('restored')
    await expect(controller.exportOne(ACTOR, 'id')).resolves.toBe('export')
    await expect(controller.account(ACTOR, 'id')).resolves.toBe('detail')
    await expect(controller.moderation()).resolves.toBe('board')
    await expect(controller.erasures()).resolves.toEqual(['erasure'])
    await expect(controller.config()).resolves.toBe('config')

    expect(platform.suspend).toHaveBeenCalledWith(ACTOR, 'id', 'spam')
    expect(platform.restore).toHaveBeenCalledWith(ACTOR, 'id')
    expect(platform.accountDetail).toHaveBeenCalledWith(ACTOR, 'id')
  })

  it('never lets an erasure run without the operator who asked for it', async () => {
    const { controller, platform } = build()

    await controller.queueErasure(ACTOR, 'id', { reason: 'request' })
    await controller.runErasure(ACTOR, 'erasure-id')
    await controller.erase(ACTOR, 'id', { reason: 'gdpr' })

    expect(platform.queueErasure).toHaveBeenCalledWith(ACTOR, 'id', 'request')
    expect(platform.runErasure).toHaveBeenCalledWith(ACTOR, 'erasure-id')
    expect(platform.erase).toHaveBeenCalledWith(ACTOR, 'id', 'gdpr')
  })

  it('defaults the window rather than asking for every day ever recorded', async () => {
    const { controller, rollup, platform } = build()

    await controller.traffic({})
    await controller.ingest({})
    await controller.audit({})

    expect(rollup.summary).toHaveBeenCalledWith(30)
    expect(platform.ingest).toHaveBeenCalledWith(30)
    expect(platform.entries).toHaveBeenCalledWith(50)
  })

  it('honours an explicit window', async () => {
    const { controller, rollup, platform } = build()

    await controller.traffic({ days: 7 })
    await controller.audit({ limit: 5 })

    expect(rollup.summary).toHaveBeenCalledWith(7)
    expect(platform.entries).toHaveBeenCalledWith(5)
  })

  it('reports the database as down when the connection is not connected', async () => {
    const { controller } = build({ readyState: ConnectionStates.disconnected })
    const health = await controller.health({})

    expect(health.database).toBe('down')
  })

  it('reports the error rate against sessions, and counts failing renders', async () => {
    const { controller } = build()
    const health = await controller.health({})

    expect(health.database).toBe('up')
    expect(health.errorRate).toBe(5)
    expect(health.prerender).toEqual({
      configured: true,
      attempts: [{ succeeded: true }, { succeeded: false }],
      failing: 1,
    })
  })

  it('does not divide by zero when nothing has been measured yet', async () => {
    const { controller, rollup } = build()
    rollup.summary.mockResolvedValue({ ...SUMMARY, totals: { sessions: 0 } })

    await expect(controller.health({})).resolves.toMatchObject({ errorRate: 0 })
  })

  it('counts owners by status and signups by window', async () => {
    const { controller, owners } = build()
    const overview = await controller.overview({})

    expect(overview.owners).toEqual({ total: 3, published: 3, draft: 3, suspended: 3 })
    expect(overview.signups).toEqual({ last7: 3, last30: 3 })
    expect(owners.countDocuments).toHaveBeenCalledWith({ status: 'suspended' })
  })

  it('ranks portfolios by traffic and reports only their metadata', async () => {
    const { controller, daily } = build()
    daily.aggregate.mockResolvedValue([
      { slug: 'ada-lovelace', status: 'published', sessions: 9, visitors: 4 },
    ])

    const overview = await controller.overview({ days: 7 })

    expect(overview.portfolios).toEqual([
      { slug: 'ada-lovelace', status: 'published', sessions: 9, visitors: 4 },
    ])
  })
})
