import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Connection, FilterQuery, Model, Types } from 'mongoose'
import { Owner } from '@/owner/owner.schema'
import { OwnerService } from '@/owner/owner.service'
import { IdentityDirectory } from '@/auth/identity.directory'
import { OwnerLifecycleService } from '@/portfolio/me/owner-lifecycle.service'
import { AuditEntry, type AuditAction, type AuditEntryDocument } from '@/platform/audit.schema'
import {
  AnalyticsDaily,
  type AnalyticsDailyDocument,
} from '@/analytics/schemas/analytics-daily.schema'
import { toPlainList } from '@/common/utils/serialize'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'
import type { OwnerExport } from '@/portfolio/me/owner-lifecycle.service'
import {
  ErasureRequest,
  ERASURE_DEADLINE_DAYS,
  ERASURE_STORES,
  type ErasureRequestDocument,
} from '@/platform/erasure.schema'
import {
  AnalyticsEvent,
  type AnalyticsEventDocument,
} from '@/analytics/schemas/analytics-event.schema'
import { RESERVED_SLUGS, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '@/owner/slug'
import { shiftDate } from '@/analytics/rollup.service'
import { MAX_REASON_LENGTH } from '@/platform/platform.dto'
import { ROLLUP_RETENTION_MONTHS } from '@/analytics/analytics.service'
import {
  IDENTIFIER_TARGET_TYPES,
  MAX_EVENTS_PER_BATCH,
  MAX_TARGET_LENGTH,
  SCROLL_DEPTHS,
  VITALS_TARGETS,
} from '@/analytics/collect.dto'
import type { PortfolioQueryDto } from '@/platform/platform.dto'

const DEFAULT_LIMIT = 50
const TRAFFIC_WINDOW_DAYS = 30
const MODERATION_WINDOW_DAYS = 14
const NEAR_MISS_DISTANCE = 1
const THIN_DOCUMENT_THRESHOLD = 4
export const ATLAS_FREE_TIER_MB = 512

export const CONTENT_COLLECTIONS = [
  'experiences',
  'projects',
  'skill_categories',
  'degrees',
  'certifications',
  'spoken_languages',
  'awards',
  'volunteering',
  'locales',
  'person',
  'profile',
] as const

export interface AccountDetail {
  account: PortfolioRow
  consentMode: string
  plan: string
  documents: { key: string; count: number }[]
  traffic: { date: string; sessions: number; visitors: number }[]
  timeline: { action: string; actor: string | null; reason: string | null; at: string }[]
  totals: { documents: number; sessions: number; visitors: number; locales: number }
}

export interface ModerationBoard {
  recentlyPublished: PortfolioRow[]
  suspended: PortfolioRow[]
  nearMisses: { slug: string; reserved: string }[]
  thin: { slug: string; id: string; documents: number }[]
  silent: PortfolioRow[]
}

export interface ErrorGroup {
  message: string
  count: number
  accounts: number
  firstSeen: string
  lastSeen: string
}

export interface StorageReport {
  dataMb: number
  indexMb: number
  ceilingMb: number
  share: number
  collections: { key: string; count: number }[]
}

export interface IngestReport {
  days: { date: string; events: number }[]
  totals: { events: number; rejected: number; rollupDays: number }
  ttl: { collection: string; present: boolean; seconds: number | null }[]
  lag: { latestRollup: string | null; today: string }
}

export interface ConfigEntry {
  key: string
  value: string
  detail: string
}

export interface PlatformConfig {
  reservedSlugs: string[]
  limits: { slugMin: number; slugMax: number; reasonMax: number; erasureDeadlineDays: number }
  retention: { rawEventDays: number; rollupMonths: number }
  environment: { nodeEnv: string; name: string; database: string; image: string }
  runtime: ConfigEntry[]
  ingest: ConfigEntry[]
  privacy: ConfigEntry[]
  collections: { key: string; count: number }[]
}

export interface ErasureRow {
  id: string
  slug: string
  state: string
  reason: string
  requestedBy: string | null
  dueAt: string
  completedAt: string | null
  cascade: Record<string, number>
  failure: string | null
  daysLeft: number
}

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > NEAR_MISS_DISTANCE) return NEAR_MISS_DISTANCE + 1

  const rows = Array.from({ length: a.length + 1 }, (_, index) => [
    index,
    ...Array(b.length).fill(0),
  ])
  for (let column = 0; column <= b.length; column += 1) rows[0][column] = column

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] =
        a[i - 1] === b[j - 1]
          ? rows[i - 1][j - 1]
          : 1 + Math.min(rows[i - 1][j], rows[i][j - 1], rows[i - 1][j - 1])
    }
  }

  return rows[a.length][b.length]
}

export interface PortfolioRow {
  id: string
  slug: string
  email: string | null
  displayName: string | null
  status: string
  createdAt: string | null
  publishedAt: string | null
  sessions: number
  visitors: number
}

interface TtlIndex {
  expireAfterSeconds?: number
}

export function ttlOf(indexes: TtlIndex[], collection: string): IngestReport['ttl'][number] {
  const found = indexes.find((index) => index.expireAfterSeconds !== undefined)
  return { collection, present: found !== undefined, seconds: found?.expireAfterSeconds ?? null }
}

export function toCascade(result: unknown): Record<string, number> {
  if (result && typeof result === 'object') {
    const entries = Object.entries(result as Record<string, unknown>).filter(
      ([, value]) => typeof value === 'number',
    )
    if (entries.length > 0) return Object.fromEntries(entries) as Record<string, number>
  }
  return Object.fromEntries(ERASURE_STORES.map((store) => [store, 0]))
}

const ENVIRONMENT_NAMES: Record<string, string> = {
  local: 'Local',
  dev: 'Development',
  prod: 'Production',
}

export function environmentName(appEnv: string | undefined): string {
  const named = ENVIRONMENT_NAMES[String(appEnv ?? '').toLowerCase()]
  if (named) return named
  return (process.env.NODE_ENV ?? 'development') === 'production' ? 'Production' : 'Local'
}

@Injectable()
export class PlatformService {
  constructor(
    @InjectModel(Owner.name) private readonly owners: Model<Owner>,
    @InjectModel(AuditEntry.name) private readonly audit: Model<AuditEntryDocument>,
    @InjectModel(AnalyticsDaily.name) private readonly daily: Model<AnalyticsDailyDocument>,
    @InjectModel(AnalyticsEvent.name) private readonly events: Model<AnalyticsEventDocument>,
    @InjectModel(ErasureRequest.name) private readonly erasures: Model<ErasureRequestDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly ownerService: OwnerService,
    private readonly lifecycle: OwnerLifecycleService,
    private readonly identities: IdentityDirectory,
  ) {}

  async portfolios(query: PortfolioQueryDto): Promise<PortfolioRow[]> {
    const filter: FilterQuery<Owner> = {}
    if (query.status) filter.status = query.status
    if (query.query) {
      const safe = query.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [{ slug: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }]
    }

    const rows = await this.owners
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit ?? DEFAULT_LIMIT)
      .lean<(Owner & { _id: Types.ObjectId; createdAt?: Date })[]>()
      .exec()

    const traffic = await this.trafficByOwner(rows.map((row) => row._id))

    return rows.map((row) => ({
      id: String(row._id),
      slug: row.slug,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
      sessions: traffic.get(String(row._id))?.sessions ?? 0,
      visitors: traffic.get(String(row._id))?.visitors ?? 0,
    }))
  }

  async suspend(actor: AuthenticatedUser, ownerId: string, reason: string): Promise<PortfolioRow> {
    const owner = await this.ownerService.findById(ownerId)
    if (owner.status === 'suspended') {
      throw new ConflictException('That portfolio is already suspended')
    }

    await this.owners.updateOne({ _id: owner.id }, { $set: { status: 'suspended' } }).exec()
    await this.record(actor, 'suspend', owner.id, owner.slug, reason)

    return this.one(owner.id)
  }

  async restore(actor: AuthenticatedUser, ownerId: string): Promise<PortfolioRow> {
    const owner = await this.ownerService.findById(ownerId)
    if (owner.status !== 'suspended') {
      throw new ConflictException('That portfolio is not suspended')
    }

    const status = owner.publishedAt ? 'published' : 'draft'
    await this.owners.updateOne({ _id: owner.id }, { $set: { status } }).exec()
    await this.record(actor, 'restore', owner.id, owner.slug, null)

    return this.one(owner.id)
  }

  async erase(actor: AuthenticatedUser, ownerId: string, reason: string): Promise<void> {
    const owner = await this.ownerService.findById(ownerId)

    await this.lifecycle.erase(ownerId)
    await this.record(actor, 'erase', null, owner.slug, reason)
  }

  async exportOne(actor: AuthenticatedUser, ownerId: string): Promise<OwnerExport> {
    const owner = await this.ownerService.findById(ownerId)
    const data = await this.lifecycle.exportAll(ownerId)

    await this.record(actor, 'export', owner.id, owner.slug, null)
    return data
  }

  async accountDetail(actor: AuthenticatedUser, ownerId: string): Promise<AccountDetail> {
    const account = await this.one(ownerId)
    const owner = await this.ownerService.findById(ownerId)
    const id = new Types.ObjectId(ownerId)

    const [documents, traffic, timeline] = await Promise.all([
      this.documentCounts(id),
      this.trafficHistory(id),
      this.timelineFor(account.slug),
    ])

    await this.record(actor, 'read-account', ownerId, account.slug, 'operator opened the account')

    return {
      account,
      consentMode: owner.consentMode,
      plan: owner.plan,
      documents,
      traffic,
      timeline,
      totals: {
        documents: documents.reduce((sum, row) => sum + row.count, 0),
        sessions: traffic.reduce((sum, row) => sum + row.sessions, 0),
        visitors: traffic.reduce((sum, row) => sum + row.visitors, 0),
        locales: documents.find((row) => row.key === 'locales')?.count ?? 0,
      },
    }
  }

  async moderation(): Promise<ModerationBoard> {
    const since = new Date(Date.now() - MODERATION_WINDOW_DAYS * 86_400_000)
    const rows = await this.portfolios({ query: undefined, status: undefined, limit: 200 })

    const recentlyPublished = rows.filter(
      (row) => row.publishedAt !== null && new Date(row.publishedAt) >= since,
    )

    const nearMisses = rows
      .flatMap((row) =>
        [...RESERVED_SLUGS]
          .filter((reserved) => editDistance(row.slug, reserved) <= NEAR_MISS_DISTANCE)
          .map((reserved) => ({ slug: row.slug, reserved })),
      )
      .slice(0, 20)

    const published = rows.filter((row) => row.status === 'published')

    const documentCounts = await Promise.all(
      published.map(async (row) => ({
        slug: row.slug,
        id: row.id,
        documents: (await this.documentCounts(new Types.ObjectId(row.id))).reduce(
          (sum, entry) => sum + entry.count,
          0,
        ),
      })),
    )

    return {
      recentlyPublished,
      suspended: rows.filter((row) => row.status === 'suspended'),
      nearMisses,
      thin: documentCounts
        .filter((row) => row.documents < THIN_DOCUMENT_THRESHOLD)
        .sort((a, b) => a.documents - b.documents),
      silent: published.filter((row) => row.sessions === 0),
    }
  }

  async errorGroups(days: number): Promise<ErrorGroup[]> {
    const from = shiftDate(new Date().toISOString().slice(0, 10), -(days - 1))

    const rows = await this.daily
      .find({ date: { $gte: from } })
      .select({ date: 1, errors: 1, ownerId: 1 })
      .lean<{ date: string; ownerId: Types.ObjectId; errors?: Map<string, number> }[]>()
      .exec()

    const groups = new Map<string, { count: number; owners: Set<string>; days: string[] }>()

    for (const row of rows) {
      const entries =
        row.errors instanceof Map ? [...row.errors.entries()] : Object.entries(row.errors ?? {})

      for (const [message, count] of entries) {
        const group = groups.get(message) ?? { count: 0, owners: new Set<string>(), days: [] }
        group.count += count as number
        group.owners.add(String(row.ownerId))
        group.days.push(row.date)
        groups.set(message, group)
      }
    }

    return [...groups.entries()]
      .map(([message, group]) => {
        const sorted = group.days.sort()
        return {
          message,
          count: group.count,
          accounts: group.owners.size,
          firstSeen: sorted[0],
          lastSeen: sorted[sorted.length - 1],
        }
      })
      .sort((a, b) => b.accounts - a.accounts || b.count - a.count)
      .slice(0, 10)
  }

  async storage(): Promise<StorageReport> {
    const stats = await this.connection.db
      ?.command({ dbStats: 1, scale: 1024 * 1024 })
      .catch(() => null)

    const counts = await Promise.all(
      CONTENT_COLLECTIONS.map(async (collection) => ({
        key: collection,
        count: await this.connection
          .collection(collection)
          .estimatedDocumentCount()
          .catch(() => 0),
      })),
    )

    const dataMb = Math.round(((stats?.dataSize as number) ?? 0) * 10) / 10
    const indexMb = Math.round(((stats?.indexSize as number) ?? 0) * 10) / 10

    return {
      dataMb,
      indexMb,
      ceilingMb: ATLAS_FREE_TIER_MB,
      share: Math.min(100, Math.round(((dataMb + indexMb) / ATLAS_FREE_TIER_MB) * 100)),
      collections: counts.filter((row) => row.count > 0).sort((a, b) => b.count - a.count),
    }
  }

  async ingest(days: number): Promise<IngestReport> {
    const from = new Date(Date.now() - days * 86_400_000)

    const [perDay, rollups, latest, eventIndexes, visitorIndexes] = await Promise.all([
      this.events.aggregate<{ _id: string; events: number }>([
        { $match: { createdAt: { $gte: from } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            events: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.daily.aggregate<{ _id: null; rejected: number; rollupDays: number }>([
        { $group: { _id: null, rejected: { $sum: '$rejected' }, rollupDays: { $sum: 1 } } },
      ]),
      this.daily.find().sort({ date: -1 }).limit(1).lean<{ date: string }[]>().exec(),
      this.events.collection.indexes(),
      this.connection.collection('analytics_visitors').indexes(),
    ])

    return {
      days: perDay.map((row) => ({ date: row._id, events: row.events })),
      totals: {
        events: perDay.reduce((sum, row) => sum + row.events, 0),
        rejected: rollups[0]?.rejected ?? 0,
        rollupDays: rollups[0]?.rollupDays ?? 0,
      },
      ttl: [ttlOf(eventIndexes, 'analytics_events'), ttlOf(visitorIndexes, 'analytics_visitors')],
      lag: { latestRollup: latest[0]?.date ?? null, today: new Date().toISOString().slice(0, 10) },
    }
  }

  async queueErasure(
    actor: AuthenticatedUser,
    ownerId: string,
    reason: string,
  ): Promise<ErasureRow> {
    const owner = await this.ownerService.findById(ownerId)
    const existing = await this.erasures.findOne({
      ownerId: new Types.ObjectId(ownerId),
      state: 'pending',
    })
    if (existing) throw new ConflictException('An erasure is already queued for this account')

    const created = await this.erasures.create({
      ownerId: new Types.ObjectId(ownerId),
      slug: owner.slug,
      reason,
      requestedBy: await this.actorEmail(actor),
      dueAt: new Date(Date.now() + ERASURE_DEADLINE_DAYS * 86_400_000),
    })

    await this.record(actor, 'erasure-queued', ownerId, owner.slug, reason)
    return this.toErasureRow(created)
  }

  async erasureQueue(): Promise<ErasureRow[]> {
    const rows = await this.erasures.find().sort({ state: 1, dueAt: 1 }).limit(100).exec()
    return rows.map((row) => this.toErasureRow(row))
  }

  async runErasure(actor: AuthenticatedUser, requestId: string): Promise<ErasureRow> {
    const request = await this.erasures.findById(requestId)
    if (!request) throw new NotFoundException('Erasure request not found')

    request.state = 'running'
    await request.save()

    try {
      const cascade = await this.lifecycle.erase(String(request.ownerId))

      request.state = 'done'
      request.completedAt = new Date()
      request.failure = null
      request.cascade = toCascade(cascade)
    } catch (error) {
      request.state = 'failed'
      request.failure = error instanceof Error ? error.message : 'Erasure failed'
    }

    await request.save()
    await this.record(actor, 'erasure-run', null, request.slug, request.reason)

    return this.toErasureRow(request)
  }

  async config(): Promise<PlatformConfig> {
    return {
      reservedSlugs: [...RESERVED_SLUGS].sort(),
      limits: {
        slugMin: SLUG_MIN_LENGTH,
        slugMax: SLUG_MAX_LENGTH,
        reasonMax: MAX_REASON_LENGTH,
        erasureDeadlineDays: ERASURE_DEADLINE_DAYS,
      },
      retention: { rawEventDays: 30, rollupMonths: ROLLUP_RETENTION_MONTHS },
      environment: {
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
        name: environmentName(process.env.APP_ENV),
        database: this.connection.name,
        image: process.env.APP_IMAGE_TAG || 'local',
      },
      runtime: [
        {
          key: 'Node',
          value: process.version,
          detail: 'The runtime this API process is executing on.',
        },
        {
          key: 'API prefix',
          value: process.env.API_PREFIX ?? 'api/v1',
          detail: 'Every route is mounted under this prefix.',
        },
        {
          key: 'Allowed origins',
          value: process.env.CORS_ORIGINS ?? 'not set',
          detail: 'A browser request from anywhere else is refused before it reaches a controller.',
        },
        {
          key: 'Asset base',
          value: process.env.ASSETS_BASE_URL || 'served from the app itself',
          detail: 'Where uploaded images and documents are read from.',
        },
      ],
      ingest: [
        {
          key: 'Events per beacon',
          value: String(MAX_EVENTS_PER_BATCH),
          detail: 'A beacon carrying more than this is rejected whole.',
        },
        {
          key: 'Target length',
          value: `${MAX_TARGET_LENGTH} characters`,
          detail: 'Anything longer is refused before it can become a counter key.',
        },
        {
          key: 'Identifier-shaped targets',
          value: IDENTIFIER_TARGET_TYPES.join(', '),
          detail: 'These event types accept only identifiers, so a counter cannot grow unbounded.',
        },
        {
          key: 'Accepted vitals',
          value: VITALS_TARGETS.join(', '),
          detail: 'Any other performance metric is discarded at ingest.',
        },
        {
          key: 'Scroll depths',
          value: SCROLL_DEPTHS.join('%, ') + '%',
          detail: 'Scroll is recorded at four quartiles and nothing in between.',
        },
      ],
      privacy: [
        {
          key: 'Measurement identifier',
          value: 'rotating daily hash, never stored',
          detail: 'Tier one identifies nobody: the salt lives in memory and changes every day.',
        },
        {
          key: 'Enhanced identifier',
          value: 'per owner, consent only',
          detail:
            'A persistent visitor id exists only where an owner enabled it and a visitor agreed.',
        },
        {
          key: 'Raw event retention',
          value: '30 days, TTL enforced',
          detail: 'The database removes them; no job has to remember to.',
        },
        {
          key: 'Rollup retention',
          value: `${ROLLUP_RETENTION_MONTHS} months`,
          detail: 'Purged once a day per owner, on the first beacon of the day.',
        },
        {
          key: 'Erasure deadline',
          value: `${ERASURE_DEADLINE_DAYS} days`,
          detail: 'The clock every queued erasure request runs against.',
        },
      ],
      collections: await this.collectionSizes(),
    }
  }

  private async collectionSizes(): Promise<{ key: string; count: number }[]> {
    const counted = await Promise.all(
      [...CONTENT_COLLECTIONS, 'owners', 'platform_audit', 'erasure_requests'].map(
        async (collection) => ({
          key: collection,
          count: await this.connection
            .collection(collection)
            .estimatedDocumentCount()
            .catch(() => 0),
        }),
      ),
    )

    return counted.filter((row) => row.count > 0).sort((a, b) => b.count - a.count)
  }

  private toErasureRow(row: ErasureRequestDocument): ErasureRow {
    return {
      id: String(row._id),
      slug: row.slug,
      state: row.state,
      reason: row.reason,
      requestedBy: row.requestedBy,
      dueAt: row.dueAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      cascade: row.cascade ?? {},
      failure: row.failure,
      daysLeft: Math.ceil((row.dueAt.getTime() - Date.now()) / 86_400_000),
    }
  }

  private async documentCounts(ownerId: Types.ObjectId): Promise<{ key: string; count: number }[]> {
    const counts = await Promise.all(
      CONTENT_COLLECTIONS.map(async (collection) => ({
        key: collection,
        count: await this.connection
          .collection(collection)
          .countDocuments({ ownerId })
          .catch(() => 0),
      })),
    )

    return counts.filter((row) => row.count > 0)
  }

  private async trafficHistory(
    ownerId: Types.ObjectId,
  ): Promise<{ date: string; sessions: number; visitors: number }[]> {
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)

    const rows = await this.daily
      .find({ ownerId, date: { $gte: from } })
      .sort({ date: 1 })
      .lean<{ date: string; sessions: number; visitors: number }[]>()
      .exec()

    return rows.map((row) => ({
      date: row.date,
      sessions: row.sessions ?? 0,
      visitors: row.visitors ?? 0,
    }))
  }

  private async timelineFor(slug: string): Promise<AccountDetail['timeline']> {
    const rows = await this.audit
      .find({ targetSlug: slug })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean<
        { action: string; actorEmail: string | null; reason: string | null; createdAt: Date }[]
      >()
      .exec()

    return rows.map((row) => ({
      action: row.action,
      actor: row.actorEmail,
      reason: row.reason,
      at: new Date(row.createdAt).toISOString(),
    }))
  }

  async entries(limit: number): Promise<AuditEntry[]> {
    const found = await this.audit
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<AuditEntry[]>()
      .exec()

    return toPlainList(found)
  }

  private async one(ownerId: string): Promise<PortfolioRow> {
    const [row] = await this.portfolios({ query: undefined, status: undefined, limit: 200 }).then(
      (rows) => rows.filter((entry) => entry.id === ownerId),
    )
    if (!row) throw new NotFoundException('Owner not found')
    return row
  }

  private async record(
    actor: AuthenticatedUser,
    action: AuditAction,
    targetOwnerId: string | null,
    targetSlug: string | null,
    reason: string | null,
  ): Promise<void> {
    await this.audit.create({
      actorSub: actor.id,
      actorEmail: await this.actorEmail(actor),
      action,
      targetOwnerId: targetOwnerId ? new Types.ObjectId(targetOwnerId) : null,
      targetSlug,
      reason,
    })
  }

  private async actorEmail(actor: AuthenticatedUser): Promise<string | null> {
    if (actor.email) return actor.email

    try {
      const identity = await this.identities.describe(actor.username)
      return identity.email
    } catch {
      return null
    }
  }

  private async trafficByOwner(
    ids: Types.ObjectId[],
  ): Promise<Map<string, { sessions: number; visitors: number }>> {
    if (ids.length === 0) return new Map()

    const to = new Date().toISOString().slice(0, 10)
    const from = shiftDate(to, -(TRAFFIC_WINDOW_DAYS - 1))

    const rows = await this.daily.aggregate<{
      _id: Types.ObjectId
      sessions: number
      visitors: number
    }>([
      { $match: { ownerId: { $in: ids }, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$ownerId',
          sessions: { $sum: '$sessions' },
          visitors: { $sum: '$visitors' },
        },
      },
    ])

    return new Map(
      rows.map((row) => [String(row._id), { sessions: row.sessions, visitors: row.visitors }]),
    )
  }
}
