import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { OwnerService } from '@/owner/owner.service'
import { ownerObjectId } from '@/common/schemas/owned'
import { SaltService } from '@/analytics/salt.service'
import {
  AnalyticsEvent,
  type AnalyticsEventDocument,
} from '@/analytics/schemas/analytics-event.schema'
import {
  AnalyticsDaily,
  RESERVOIR_LIMIT,
  type AnalyticsDailyDocument,
} from '@/analytics/schemas/analytics-daily.schema'
import {
  AnalyticsVisitor,
  type AnalyticsVisitorDocument,
} from '@/analytics/schemas/analytics-visitor.schema'
import {
  IDENTIFIER_TARGET,
  IDENTIFIER_TARGET_TYPES,
  SCROLL_DEPTHS,
  VITALS_TARGETS,
  type CollectDto,
  type CollectEventDto,
} from '@/analytics/collect.dto'

const BOUNCE_MS = 10_000
const DUPLICATE_KEY = 11000
export const ROLLUP_RETENTION_MONTHS = 25

export interface RequestMeta {
  userAgent?: string
  acceptLanguage?: string
  country?: string
}

export function sanitizeKey(value: string | undefined): string {
  return (value ?? 'unknown').slice(0, 120).replace(/[.$]/g, '_').trim().replace(/^$/, 'unknown')
}

export function deviceFrom(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').toLowerCase()
  if (/ipad|tablet/.test(ua)) return 'tablet'
  if (/mobi|android|iphone/.test(ua)) return 'mobile'
  return 'desktop'
}

export function browserFrom(userAgent: string | undefined): string {
  const ua = userAgent ?? ''
  if (/Edg\//.test(ua)) return 'edge'
  if (/OPR\//.test(ua)) return 'opera'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\//.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'other'
}

export function retentionCutoff(today: string, months = ROLLUP_RETENTION_MONTHS): string {
  const at = new Date(`${today}T00:00:00.000Z`)
  at.setUTCMonth(at.getUTCMonth() - months)
  return at.toISOString().slice(0, 10)
}

export function acceptsTarget(event: CollectEventDto): boolean {
  if (event.type === 'vitals') {
    return VITALS_TARGETS.some((name) => name === event.target) && event.value !== undefined
  }
  if (event.type === 'scroll') {
    return SCROLL_DEPTHS.some((depth) => depth === event.value)
  }
  if (IDENTIFIER_TARGET_TYPES.includes(event.type)) {
    return typeof event.target === 'string' && IDENTIFIER_TARGET.test(event.target)
  }
  return true
}

export function referrerHostOf(referrer: string | undefined): string {
  if (!referrer) return '(direct)'
  try {
    return new URL(referrer).hostname.replace(/^www\./, '') || '(direct)'
  } catch {
    return '(direct)'
  }
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    @InjectModel(AnalyticsEvent.name) private readonly events: Model<AnalyticsEventDocument>,
    @InjectModel(AnalyticsDaily.name) private readonly daily: Model<AnalyticsDailyDocument>,
    @InjectModel(AnalyticsVisitor.name) private readonly visitors: Model<AnalyticsVisitorDocument>,
    private readonly salt: SaltService,
    private readonly owners: OwnerService,
  ) {}

  async ingest(dto: CollectDto, meta: RequestMeta): Promise<void> {
    const ownerId = await this.resolveOwner(dto.slug)
    if (!ownerId) return

    const events = dto.events.filter(acceptsTarget)
    const rejected = dto.events.length - events.length

    const now = new Date()
    const date = SaltService.today(now)
    const country = meta.country?.toUpperCase().slice(0, 2)
    const visitorDay = this.salt.visitorDay([meta.userAgent, meta.acceptLanguage, country], now)
    const device = deviceFrom(meta.userAgent)
    const browser = browserFrom(meta.userAgent)

    if (events.length === 0) {
      if (rejected > 0) {
        await this.daily.updateOne(
          { ownerId, date: SaltService.today(now) },
          { $inc: { rejected }, $setOnInsert: { ownerId, date: SaltService.today(now) } },
          { upsert: true },
        )
      }
      return
    }

    const documents = events.map((event) => ({
      ownerId,
      type: event.type,
      sessionId: dto.sessionId,
      visitorDay,
      path: event.path,
      lang: event.lang,
      referrerHost: event.type === 'session' ? referrerHostOf(event.referrer) : undefined,
      country,
      device: event.device ?? device,
      browser,
      target: event.target,
      value: event.value,
      createdAt: now,
      updatedAt: now,
    }))

    const inc: Record<string, number> = rejected > 0 ? { rejected } : {}
    const push: Record<string, { $each: number[]; $slice: number }> = {}
    let hasSession = false
    let usedShell = false

    for (const event of events) {
      this.accumulate(event, inc, push, { country, device, browser })
      if (event.type === 'session') hasSession = true
      if (event.type === 'shell') usedShell = true
    }

    if (hasSession && (await this.claim(ownerId, date, 'visitor', visitorDay))) {
      inc.visitors = (inc.visitors ?? 0) + 1
    }

    if (hasSession && dto.visitorId) {
      const firstToday = await this.claim(ownerId, date, 'consented', dto.visitorId)

      if (firstToday) {
        const seenBefore = await this.visitors.exists({
          ownerId,
          kind: 'consented',
          visitorDay: dto.visitorId,
          date: { $ne: date },
        })

        if (seenBefore) inc.returning = (inc.returning ?? 0) + 1
        else inc.newVisitors = (inc.newVisitors ?? 0) + 1
      }
    }
    if (usedShell && (await this.claim(ownerId, date, 'shell', dto.sessionId))) {
      inc.shellSessions = (inc.shellSessions ?? 0) + 1
    }

    const bounced = events.some((event) => event.type === 'dwell' && (event.value ?? 0) < BOUNCE_MS)
    if (bounced && (await this.claim(ownerId, date, 'bounce', dto.sessionId))) {
      inc.bounced = (inc.bounced ?? 0) + 1
    }

    const entry = events.find((event) => event.type === 'section')?.target
    if (entry && (await this.claim(ownerId, date, 'entry', dto.sessionId))) {
      inc[`byEntry.${sanitizeKey(entry)}`] = (inc[`byEntry.${sanitizeKey(entry)}`] ?? 0) + 1
    }

    await this.purgeExpiredRollups(ownerId, date)

    const update: Record<string, unknown> = {}
    if (Object.keys(inc).length > 0) update.$inc = inc
    if (Object.keys(push).length > 0) update.$push = push

    await Promise.all([
      this.events.insertMany(documents, { ordered: false }),
      Object.keys(update).length > 0
        ? this.daily.updateOne(
            { ownerId, date },
            { ...update, $setOnInsert: { ownerId, date } },
            { upsert: true },
          )
        : Promise.resolve(),
    ])
  }

  async removeAllOwnedBy(ownerId: string): Promise<number> {
    const owner = ownerObjectId(ownerId)

    const [events, daily, visitors] = await Promise.all([
      this.events.deleteMany({ ownerId: owner }).exec(),
      this.daily.deleteMany({ ownerId: owner }).exec(),
      this.visitors.deleteMany({ ownerId: owner }).exec(),
    ])

    return events.deletedCount + daily.deletedCount + visitors.deletedCount
  }

  private async resolveOwner(slug: string | undefined): Promise<Types.ObjectId | null> {
    if (!slug) return null

    const owner = await this.owners.findPublishedBySlug(slug).catch(() => null)
    return owner ? new Types.ObjectId(owner.id) : null
  }

  private accumulate(
    event: CollectEventDto,
    inc: Record<string, number>,
    push: Record<string, { $each: number[]; $slice: number }>,
    context: { country?: string; device: string; browser: string },
  ): void {
    const bump = (field: string, by = 1): void => {
      inc[field] = (inc[field] ?? 0) + by
    }

    switch (event.type) {
      case 'session':
        bump('sessions')
        bump(`byLang.${sanitizeKey(event.lang)}`)
        bump(`byCountry.${sanitizeKey(context.country)}`)
        bump(`byReferrer.${sanitizeKey(referrerHostOf(event.referrer))}`)
        bump(`byDevice.${sanitizeKey(event.device ?? context.device)}`)
        bump(`byBrowser.${sanitizeKey(context.browser)}`)
        break
      case 'section':
        bump(`sections.${sanitizeKey(event.target)}`)
        break
      case 'impression':
        bump(`impressions.${sanitizeKey(event.target)}`)
        break
      case 'click':
        bump(`clicks.${sanitizeKey(event.target)}`)
        break
      case 'scroll':
        bump(`scroll.${event.value}`)
        break
      case 'dwell':
        bump('dwellMsTotal', event.value ?? 0)
        bump('dwellSamples')
        break
      case 'doc':
        bump(`docs.${sanitizeKey(event.target)}`)
        break
      case 'outbound':
        bump(`outbound.${sanitizeKey(event.target)}`)
        break
      case 'contact':
        bump(`contact.${sanitizeKey(event.target)}`)
        break
      case 'shell':
        bump(`shell.${sanitizeKey(event.target)}`)
        break
      case 'error':
        bump(`errors.${sanitizeKey(event.target)}`)
        break
      case 'vitals': {
        const metric = event.target as (typeof VITALS_TARGETS)[number]
        push[`${metric}Samples`] = {
          $each: [...(push[`${metric}Samples`]?.$each ?? []), event.value as number],
          $slice: -RESERVOIR_LIMIT,
        }
        break
      }
      default:
        break
    }
  }

  private async purgeExpiredRollups(ownerId: Types.ObjectId, date: string): Promise<void> {
    if (!(await this.claim(ownerId, date, 'purge', date))) return

    try {
      const removed = await this.daily
        .deleteMany({ ownerId, date: { $lt: retentionCutoff(date) } })
        .exec()

      if (removed.deletedCount > 0) {
        this.logger.log(`Purged ${removed.deletedCount} rollups past retention`)
      }
    } catch {
      this.logger.warn('Could not purge rollups past retention')
    }
  }

  private async claim(
    ownerId: Types.ObjectId,
    date: string,
    kind: string,
    key: string,
  ): Promise<boolean> {
    try {
      await this.visitors.create({ ownerId, date, kind, visitorDay: key })
      return true
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false
      this.logger.warn(`Could not claim ${kind} for ${date}`)
      return false
    }
  }
}
