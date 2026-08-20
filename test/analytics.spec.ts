import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { getModelToken } from '@nestjs/mongoose'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { JWT_KEY_PROVIDER } from '@/auth/jwks.token'
import { CognitoStrategy, COGNITO_STRATEGY } from '@/auth/strategies/cognito.strategy'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'
import { CollectController } from '@/analytics/collect.controller'
import { AnalyticsController } from '@/analytics/analytics.controller'
import {
  AnalyticsService,
  acceptsTarget,
  browserFrom,
  deviceFrom,
  referrerHostOf,
  retentionCutoff,
  sanitizeKey,
} from '@/analytics/analytics.service'
import {
  RollupService,
  percentChange,
  percentile,
  rateOf,
  shiftDate,
} from '@/analytics/rollup.service'
import { SaltService } from '@/analytics/salt.service'
import { OwnerService } from '@/owner/owner.service'
import { OwnerScopeGuard } from '@/common/guards/owner-scope.guard'
import { AnalyticsEvent } from '@/analytics/schemas/analytics-event.schema'
import { AnalyticsDaily } from '@/analytics/schemas/analytics-daily.schema'
import { AnalyticsVisitor } from '@/analytics/schemas/analytics-visitor.schema'
import { MAX_EVENTS_PER_BATCH } from '@/analytics/collect.dto'
import {
  ownerToken,
  platformToken,
  cognitoConfig,
  guestToken,
  staticKeyProvider,
} from './support/cognito-token'

const TODAY = SaltService.today()
const OWNER = '507f1f77bcf86cd799439021'

describe('privacy helpers', () => {
  it('never produces the same visitor hash on two different days', () => {
    const salt = new SaltService()
    const today = salt.visitorDay(['ua', 'en', 'TN'], new Date('2026-08-05T10:00:00Z'))
    const tomorrow = salt.visitorDay(['ua', 'en', 'TN'], new Date('2026-08-06T10:00:00Z'))

    expect(today).not.toBe(tomorrow)
    expect(today).toHaveLength(16)
  })

  it('produces the same hash for the same visitor within one day', () => {
    const salt = new SaltService()
    const at = new Date('2026-08-05T10:00:00Z')

    expect(salt.visitorDay(['ua', 'en', 'TN'], at)).toBe(salt.visitorDay(['ua', 'en', 'TN'], at))
  })

  it('separates visitors that differ in any component', () => {
    const salt = new SaltService()
    const at = new Date('2026-08-05T10:00:00Z')

    expect(salt.visitorDay(['ua', 'en', 'TN'], at)).not.toBe(
      salt.visitorDay(['ua', 'fr', 'TN'], at),
    )
  })

  it('classifies devices and browsers from the user agent alone', () => {
    expect(deviceFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile')
    expect(deviceFrom('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet')
    expect(deviceFrom('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop')
    expect(browserFrom('Mozilla/5.0 Chrome/120 Safari/537')).toBe('chrome')
    expect(browserFrom('Mozilla/5.0 Firefox/121')).toBe('firefox')
    expect(browserFrom(undefined)).toBe('other')
  })

  it('reduces a referrer to a bare host', () => {
    expect(referrerHostOf('https://www.linkedin.com/feed/?x=1')).toBe('linkedin.com')
    expect(referrerHostOf(undefined)).toBe('(direct)')
    expect(referrerHostOf('not-a-url')).toBe('(direct)')
  })

  it('keeps Mongo path operators out of counter keys', () => {
    expect(sanitizeKey('a.b$c')).toBe('a_b_c')
    expect(sanitizeKey(undefined)).toBe('unknown')
    expect(sanitizeKey('x'.repeat(300))).toHaveLength(120)
  })

  it('accepts only identifier-shaped targets where the key becomes a counter', () => {
    expect(acceptsTarget({ type: 'impression', target: 'project-atlas' })).toBe(true)
    expect(acceptsTarget({ type: 'click', target: 'a'.repeat(64) })).toBe(true)
    expect(acceptsTarget({ type: 'click', target: 'a'.repeat(65) })).toBe(false)
    expect(acceptsTarget({ type: 'impression', target: 'has space' })).toBe(false)
    expect(acceptsTarget({ type: 'section', target: undefined })).toBe(false)
  })

  it('accepts only the four quartiles and the four vitals', () => {
    expect(acceptsTarget({ type: 'scroll', value: 50 })).toBe(true)
    expect(acceptsTarget({ type: 'scroll', value: 63 })).toBe(false)
    expect(acceptsTarget({ type: 'vitals', target: 'lcp', value: 1200 })).toBe(true)
    expect(acceptsTarget({ type: 'vitals', target: 'lcp' })).toBe(false)
    expect(acceptsTarget({ type: 'vitals', target: 'fps', value: 60 })).toBe(false)
  })

  it('leaves free-text targets alone where cardinality is already bounded', () => {
    expect(acceptsTarget({ type: 'error', target: 'Cannot read property x of undefined' })).toBe(
      true,
    )
    expect(acceptsTarget({ type: 'doc', target: 'resume en.pdf' })).toBe(true)
  })

  it('puts the retention cutoff twenty-five months back', () => {
    expect(retentionCutoff('2026-08-09')).toBe('2024-07-09')
    expect(retentionCutoff('2026-08-09', 1)).toBe('2026-07-09')
  })
})

describe('rollup maths', () => {
  it('takes the p75 of a reservoir', () => {
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3)
    expect(percentile([5], 0.75)).toBe(5)
    expect(percentile([], 0.75)).toBeNull()
  })

  it('compares against the previous equal period', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(80, 100)).toBe(-20)
    expect(percentChange(5, 0)).toBe(100)
    expect(percentChange(0, 0)).toBe(0)
  })

  it('walks dates across month boundaries', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('reads a rate as a whole percent and never divides by zero', () => {
    expect(rateOf(9, 36)).toBe(25)
    expect(rateOf(0, 0)).toBe(0)
    expect(rateOf(5, 0)).toBe(0)
  })
})

describe('ingest', () => {
  let service: AnalyticsService
  let events: { insertMany: jest.Mock }
  let daily: { updateOne: jest.Mock; deleteMany: jest.Mock }
  let visitors: { create: jest.Mock }

  beforeEach(async () => {
    events = { insertMany: jest.fn().mockResolvedValue([]) }
    daily = {
      updateOne: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockReturnValue({ exec: () => Promise.resolve({ deletedCount: 0 }) }),
    }
    visitors = { create: jest.fn().mockResolvedValue({}) }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        SaltService,
        { provide: getModelToken(AnalyticsEvent.name), useValue: events },
        { provide: getModelToken(AnalyticsDaily.name), useValue: daily },
        { provide: getModelToken(AnalyticsVisitor.name), useValue: visitors },
        {
          provide: OwnerService,
          useValue: { findPublishedBySlug: jest.fn().mockResolvedValue({ id: OWNER }) },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('a-slug') } },
      ],
    }).compile()

    service = moduleRef.get(AnalyticsService)
  })

  function incOf(): Record<string, number> {
    return (daily.updateOne.mock.calls[0][1] as { $inc: Record<string, number> }).$inc
  }

  it('writes the raw events and the daily rollup in one pass', async () => {
    await service.ingest(
      {
        sessionId: 's1',
        events: [
          { type: 'session', lang: 'en', referrer: 'https://linkedin.com/feed' },
          { type: 'section', target: 'projects' },
        ],
      },
      { userAgent: 'Mozilla/5.0 Chrome/120', acceptLanguage: 'en', country: 'tn' },
    )

    expect(events.insertMany).toHaveBeenCalledTimes(1)
    expect(events.insertMany.mock.calls[0][0]).toHaveLength(2)
    expect(daily.updateOne).toHaveBeenCalledTimes(1)

    expect(incOf()).toMatchObject({
      sessions: 1,
      visitors: 1,
      'byLang.en': 1,
      'byCountry.TN': 1,
      'byReferrer.linkedin_com': 1,
      'byDevice.desktop': 1,
      'sections.projects': 1,
    })
  })

  it('counts a returning visitor once per day', async () => {
    visitors.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))

    await service.ingest({ sessionId: 's2', events: [{ type: 'session', lang: 'en' }] }, {})

    expect(incOf().sessions).toBe(1)
    expect(incOf().visitors).toBeUndefined()
  })

  it('counts a terminal discovery once per session', async () => {
    await service.ingest(
      {
        sessionId: 's3',
        events: [
          { type: 'shell', target: 'help' },
          { type: 'shell', target: 'ls' },
        ],
      },
      {},
    )

    expect(incOf()).toMatchObject({ 'shell.help': 1, 'shell.ls': 1, shellSessions: 1 })
  })

  it('treats a short session as a bounce', async () => {
    await service.ingest({ sessionId: 's4', events: [{ type: 'dwell', value: 4000 }] }, {})

    expect(incOf()).toMatchObject({ dwellMsTotal: 4000, dwellSamples: 1, bounced: 1 })
  })

  it('does not count a long session as a bounce', async () => {
    await service.ingest({ sessionId: 's5', events: [{ type: 'dwell', value: 45000 }] }, {})

    expect(incOf().bounced).toBeUndefined()
  })

  it('caps each vitals reservoir at two hundred samples', async () => {
    await service.ingest(
      {
        sessionId: 's6',
        events: [
          { type: 'vitals', target: 'lcp', value: 1800 },
          { type: 'vitals', target: 'lcp', value: 2400 },
        ],
      },
      {},
    )

    const push = (daily.updateOne.mock.calls[0][1] as { $push: Record<string, unknown> }).$push
    expect(push.lcpSamples).toEqual({ $each: [1800, 2400], $slice: -200 })
  })

  it('ignores a vitals event with an unknown metric', async () => {
    await service.ingest(
      { sessionId: 's7', events: [{ type: 'vitals', target: 'fps', value: 60 }] },
      {},
    )

    const update = daily.updateOne.mock.calls[0]?.[1] as { $push?: unknown } | undefined
    expect(update?.$push).toBeUndefined()
  })

  it('counts an impression and a click against the same card', async () => {
    await service.ingest(
      {
        sessionId: 's9',
        events: [
          { type: 'impression', target: 'project-atlas' },
          { type: 'impression', target: 'project-folvyn' },
          { type: 'click', target: 'project-atlas' },
        ],
      },
      {},
    )

    expect(incOf()).toMatchObject({
      'impressions.project-atlas': 1,
      'impressions.project-folvyn': 1,
      'clicks.project-atlas': 1,
    })
  })

  it('counts scroll depth under the quartile it reached', async () => {
    await service.ingest(
      {
        sessionId: 's10',
        events: [
          { type: 'scroll', value: 25 },
          { type: 'scroll', value: 50 },
        ],
      },
      {},
    )

    expect(incOf()).toMatchObject({ 'scroll.25': 1, 'scroll.50': 1 })
  })

  it('records the browser from the user agent, never from the beacon', async () => {
    await service.ingest(
      { sessionId: 's11', events: [{ type: 'session', lang: 'en' }] },
      { userAgent: 'Mozilla/5.0 Firefox/121' },
    )

    expect(incOf()).toMatchObject({ 'byBrowser.firefox': 1 })
  })

  it('credits the first section of a session as its entry point, once', async () => {
    await service.ingest(
      {
        sessionId: 's12',
        events: [
          { type: 'section', target: 'projects' },
          { type: 'section', target: 'about' },
        ],
      },
      {},
    )

    expect(incOf()).toMatchObject({ 'byEntry.projects': 1 })
    expect(incOf()['byEntry.about']).toBeUndefined()
  })

  it('does not credit an entry point twice for one session', async () => {
    visitors.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))

    await service.ingest({ sessionId: 's13', events: [{ type: 'section', target: 'about' }] }, {})

    expect(incOf()['byEntry.about']).toBeUndefined()
    expect(incOf()['sections.about']).toBe(1)
  })

  it('drops an event whose target would create an unbounded counter key', async () => {
    await service.ingest(
      {
        sessionId: 's14',
        events: [
          { type: 'impression', target: 'a card with spaces' },
          { type: 'impression', target: 'real-card' },
        ],
      },
      {},
    )

    expect(events.insertMany.mock.calls[0][0]).toHaveLength(1)
    expect(incOf()).toEqual({ 'impressions.real-card': 1, rejected: 1 })
  })

  it('stores no event when the whole batch is rejected, but still counts the rejection', async () => {
    await service.ingest({ sessionId: 's15', events: [{ type: 'scroll', value: 63 }] }, {})

    expect(events.insertMany).not.toHaveBeenCalled()
    expect(daily.updateOne).toHaveBeenCalledTimes(1)
    expect(incOf()).toEqual({ rejected: 1 })
  })

  it('purges rollups past retention once a day and no more', async () => {
    await service.ingest({ sessionId: 's16', events: [{ type: 'session' }] }, {})

    expect(daily.deleteMany).toHaveBeenCalledWith({
      ownerId: expect.anything(),
      date: { $lt: retentionCutoff(TODAY) },
    })

    visitors.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }))
    daily.deleteMany.mockClear()

    await service.ingest({ sessionId: 's17', events: [{ type: 'session' }] }, {})

    expect(daily.deleteMany).not.toHaveBeenCalled()
  })

  it('stores no IP and no raw referrer on the event', async () => {
    await service.ingest(
      { sessionId: 's8', events: [{ type: 'session', referrer: 'https://linkedin.com/in/me' }] },
      { userAgent: 'Mozilla/5.0', acceptLanguage: 'en', country: 'FR' },
    )

    const [event] = events.insertMany.mock.calls[0][0] as Record<string, unknown>[]
    expect(event.referrerHost).toBe('linkedin.com')
    expect(JSON.stringify(event)).not.toContain('/in/me')
    expect(event).not.toHaveProperty('ip')
  })
})

describe('summary', () => {
  let rollup: RollupService
  let daily: { find: jest.Mock }

  function page(rows: unknown[]) {
    return { sort: () => ({ lean: () => ({ exec: () => Promise.resolve(rows) }) }) }
  }

  beforeEach(async () => {
    daily = { find: jest.fn() }

    const moduleRef = await Test.createTestingModule({
      providers: [RollupService, { provide: getModelToken(AnalyticsDaily.name), useValue: daily }],
    }).compile()

    rollup = moduleRef.get(RollupService)
  })

  it('totals the window and compares it with the one before', async () => {
    daily.find
      .mockReturnValueOnce(
        page([
          {
            date: TODAY,
            sessions: 120,
            visitors: 80,
            bounced: 20,
            dwellMsTotal: 240000,
            dwellSamples: 2,
            shellSessions: 4,
            docs: new Map([['resume.pdf', 12]]),
            sections: new Map([
              ['projects', 40],
              ['hero', 120],
            ]),
            byLang: new Map([['en', 100]]),
            lcpSamples: [1200, 1800, 2400, 3000],
          },
        ]),
      )
      .mockReturnValueOnce(page([{ date: '2026-01-01', sessions: 100, visitors: 40, docs: {} }]))

    const summary = await rollup.summary(7)

    expect(summary.totals).toMatchObject({ sessions: 120, visitors: 80, docs: 12 })
    expect(summary.totals.dwellMsAverage).toBe(2000)
    expect(summary.deltas.sessions).toBe(20)
    expect(summary.deltas.visitors).toBe(100)
    expect(summary.vitals.lcp).toBe(2400)
    expect(summary.shellSessions).toBe(4)
  })

  it('orders the funnel the way the page is laid out', async () => {
    daily.find
      .mockReturnValueOnce(
        page([
          {
            date: TODAY,
            sections: new Map([
              ['contact', 9],
              ['hero', 100],
              ['projects', 36],
            ]),
          },
        ]),
      )
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.sections.map((row) => row.key)).toEqual(['hero', 'projects', 'contact'])
  })

  it('fills days with no traffic so the trend has no gaps', async () => {
    daily.find.mockReturnValueOnce(page([])).mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.trend).toHaveLength(7)
    expect(summary.trend.every((point) => point.sessions === 0)).toBe(true)
    expect(summary.trend[6].date).toBe(TODAY)
  })

  it('returns nulls for vitals with no samples rather than zeros', async () => {
    daily.find.mockReturnValueOnce(page([])).mockReturnValueOnce(page([]))

    const summary = await rollup.summary(30)

    expect(summary.vitals).toEqual({ lcp: null, cls: null, inp: null, ttfb: null })
  })

  it('ranks cards by click-through rate, not by raw clicks', async () => {
    daily.find
      .mockReturnValueOnce(
        page([
          {
            date: TODAY,
            impressions: new Map([
              ['loud-card', 400],
              ['quiet-card', 40],
            ]),
            clicks: new Map([
              ['loud-card', 20],
              ['quiet-card', 12],
            ]),
          },
        ]),
      )
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.cards).toEqual([
      { key: 'quiet-card', impressions: 40, clicks: 12, rate: 30 },
      { key: 'loud-card', impressions: 400, clicks: 20, rate: 5 },
    ])
  })

  it('returns every card so the console can pick projects out of the list', async () => {
    const impressions = new Map(
      Array.from({ length: 20 }, (_, index) => [`card-${index}`, 400 - index * 5]),
    )
    const clicks = new Map(
      Array.from({ length: 20 }, (_, index) => [`card-${index}`, 200 - index * 9]),
    )

    daily.find
      .mockReturnValueOnce(page([{ date: TODAY, impressions, clicks }]))
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.cards).toHaveLength(20)
  })

  it('keeps a card that was seen and never clicked', async () => {
    daily.find
      .mockReturnValueOnce(page([{ date: TODAY, impressions: new Map([['ignored', 90]]) }]))
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.cards).toEqual([{ key: 'ignored', impressions: 90, clicks: 0, rate: 0 }])
  })

  it('returns the four quartiles in order, with zeros for the ones nobody reached', async () => {
    daily.find
      .mockReturnValueOnce(
        page([
          {
            date: TODAY,
            scroll: new Map([
              ['100', 4],
              ['25', 90],
              ['50', 60],
            ]),
          },
        ]),
      )
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.scrollQuartiles).toEqual([90, 60, 0, 4])
  })

  it('reads contact as a rate per session rather than a raw count', async () => {
    daily.find
      .mockReturnValueOnce(
        page([
          {
            date: TODAY,
            sessions: 200,
            contact: new Map([
              ['email', 12],
              ['linkedin', 8],
            ]),
          },
        ]),
      )
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.contactRate).toBe(10)
  })

  it('orders entry points the way the page is laid out', async () => {
    daily.find
      .mockReturnValueOnce(
        page([
          {
            date: TODAY,
            byEntry: new Map([
              ['projects', 30],
              ['hero', 70],
            ]),
          },
        ]),
      )
      .mockReturnValueOnce(page([]))

    const summary = await rollup.summary(7)

    expect(summary.entries.map((row) => row.key)).toEqual(['hero', 'projects'])
  })
})

describe('collect and summary endpoints', () => {
  let app: INestApplication
  let ingest: jest.Mock

  beforeAll(async () => {
    ingest = jest.fn().mockResolvedValue(undefined)

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false, defaultStrategy: COGNITO_STRATEGY })],
      controllers: [CollectController, AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: { ingest } },
        {
          provide: RollupService,
          useValue: { summary: jest.fn().mockResolvedValue({ days: 30 }) },
        },
        {
          provide: getModelToken(AnalyticsEvent.name),
          useValue: {
            find: jest.fn(() => ({
              sort: () => ({
                limit: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }),
              }),
            })),
          },
        },
        { provide: JWT_KEY_PROVIDER, useValue: staticKeyProvider },
        CognitoStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: OwnerScopeGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        {
          provide: OwnerService,
          useValue: { ensureForUser: jest.fn().mockResolvedValue({ id: OWNER, slug: 'a-slug' }) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(false),
            getOrThrow: jest.fn(() => cognitoConfig),
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

  beforeEach(() => ingest.mockClear())

  it('accepts an anonymous beacon and answers 204', async () => {
    await request(app.getHttpServer())
      .post('/collect')
      .send({ sessionId: 's1', events: [{ type: 'section', target: 'projects' }] })
      .expect(204)

    expect(ingest).toHaveBeenCalledTimes(1)
  })

  it('forwards the CloudFront country header without ever seeing an IP', async () => {
    await request(app.getHttpServer())
      .post('/collect')
      .set('CloudFront-Viewer-Country', 'GB')
      .send({ sessionId: 's1', events: [{ type: 'session' }] })
      .expect(204)

    expect(ingest.mock.calls[0][1]).toMatchObject({ country: 'GB' })
  })

  it('rejects an unknown event type', async () => {
    await request(app.getHttpServer())
      .post('/collect')
      .send({ sessionId: 's1', events: [{ type: 'exfiltrate' }] })
      .expect(400)
  })

  it('rejects a batch above the cap', async () => {
    await request(app.getHttpServer())
      .post('/collect')
      .send({
        sessionId: 's1',
        events: Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => ({ type: 'section' })),
      })
      .expect(400)
  })

  it('rejects an oversized target', async () => {
    await request(app.getHttpServer())
      .post('/collect')
      .send({ sessionId: 's1', events: [{ type: 'doc', target: 'x'.repeat(200) }] })
      .expect(400)
  })

  it('rejects an unknown property on the beacon', async () => {
    await request(app.getHttpServer())
      .post('/collect')
      .send({ sessionId: 's1', events: [{ type: 'section' }], ip: '1.2.3.4' })
      .expect(400)
  })

  it('gives every owner their own insights, and the operator none', async () => {
    await request(app.getHttpServer()).get('/admin/analytics/summary').expect(401)

    await request(app.getHttpServer())
      .get('/admin/analytics/summary')
      .set('Authorization', `Bearer ${guestToken()}`)
      .expect(200)

    await request(app.getHttpServer())
      .get('/admin/analytics/summary')
      .set('Authorization', `Bearer ${platformToken()}`)
      .expect(403)
  })

  it('summarises one owner and never the whole platform', async () => {
    await request(app.getHttpServer())
      .get('/admin/analytics/summary')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(200)

    const rollup = app.get<{ summary: jest.Mock }>(RollupService)
    expect(rollup.summary).toHaveBeenLastCalledWith(30, OWNER)
  })

  it('rejects a summary window outside the allowed range', async () => {
    await request(app.getHttpServer())
      .get('/admin/analytics/summary?days=4000')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(400)
  })

  it('serves drill-down events to the owner', async () => {
    await request(app.getHttpServer())
      .get('/admin/analytics/events?type=error&limit=10')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .expect(200)
  })
})
