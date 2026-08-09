import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  AnalyticsDaily,
  type AnalyticsDailyDocument,
} from '@/analytics/schemas/analytics-daily.schema'
import { ownerObjectId } from '@/common/schemas/owned'
import { SaltService } from '@/analytics/salt.service'
import { SCROLL_DEPTHS } from '@/analytics/collect.dto'

const TOP_N = 8
const CARD_LIMIT = 40
const SECTION_ORDER = [
  'hero',
  'about',
  'experience',
  'projects',
  'skills',
  'education',
  'achievements',
  'contact',
]

export interface Breakdown {
  key: string
  count: number
}

export interface CardPerformance {
  key: string
  impressions: number
  clicks: number
  rate: number
}

export interface TrendPoint {
  date: string
  sessions: number
  visitors: number
}

export interface AnalyticsSummary {
  days: number
  from: string
  to: string
  totals: {
    sessions: number
    visitors: number
    bounced: number
    dwellMsAverage: number
    docs: number
  }
  deltas: { sessions: number; visitors: number; dwellMs: number; docs: number }
  trend: TrendPoint[]
  referrers: Breakdown[]
  langs: Breakdown[]
  countries: Breakdown[]
  devices: Breakdown[]
  browsers: Breakdown[]
  entries: Breakdown[]
  sections: Breakdown[]
  cards: CardPerformance[]
  scrollQuartiles: number[]
  docsOpened: Breakdown[]
  outbound: Breakdown[]
  contact: Breakdown[]
  contactRate: number
  returning: number
  newVisitors: number
  shell: Breakdown[]
  shellSessions: number
  errors: Breakdown[]
  vitals: { lcp: number | null; cls: number | null; inp: number | null; ttfb: number | null }
}

type CounterField =
  | 'byLang'
  | 'byCountry'
  | 'byReferrer'
  | 'byDevice'
  | 'byBrowser'
  | 'byEntry'
  | 'sections'
  | 'impressions'
  | 'clicks'
  | 'scroll'
  | 'docs'
  | 'outbound'
  | 'contact'
  | 'shell'
  | 'errors'

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

export function rateOf(part: number, whole: number): number {
  if (whole === 0) return 0
  return Math.min(100, Math.round((part / whole) * 100))
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return Math.round(((current - previous) / previous) * 100)
}

export function shiftDate(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00.000Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

@Injectable()
export class RollupService {
  constructor(
    @InjectModel(AnalyticsDaily.name) private readonly daily: Model<AnalyticsDailyDocument>,
  ) {}

  async summary(days: number, ownerId?: string): Promise<AnalyticsSummary> {
    const to = SaltService.today()
    const from = shiftDate(to, -(days - 1))
    const previousTo = shiftDate(from, -1)
    const previousFrom = shiftDate(previousTo, -(days - 1))

    const [current, previous] = await Promise.all([
      this.range(from, to, ownerId),
      this.range(previousFrom, previousTo, ownerId),
    ])

    const totals = this.totals(current)
    const before = this.totals(previous)

    return {
      days,
      from,
      to,
      totals,
      deltas: {
        sessions: percentChange(totals.sessions, before.sessions),
        visitors: percentChange(totals.visitors, before.visitors),
        dwellMs: percentChange(totals.dwellMsAverage, before.dwellMsAverage),
        docs: percentChange(totals.docs, before.docs),
      },
      trend: this.trend(current, from, days),
      referrers: this.merge(current, 'byReferrer'),
      langs: this.merge(current, 'byLang'),
      countries: this.merge(current, 'byCountry'),
      devices: this.merge(current, 'byDevice'),
      browsers: this.merge(current, 'byBrowser'),
      entries: this.sections(current, 'byEntry'),
      sections: this.sections(current),
      cards: this.cards(current),
      scrollQuartiles: this.quartiles(current),
      docsOpened: this.merge(current, 'docs'),
      outbound: this.merge(current, 'outbound'),
      contact: this.merge(current, 'contact'),
      contactRate:
        totals.sessions === 0
          ? 0
          : Math.round((this.totalOf(current, 'contact') / totals.sessions) * 100),
      returning: current.reduce((sum, day) => sum + (day.returning ?? 0), 0),
      newVisitors: current.reduce((sum, day) => sum + (day.newVisitors ?? 0), 0),
      shell: this.merge(current, 'shell'),
      shellSessions: current.reduce((sum, day) => sum + (day.shellSessions ?? 0), 0),
      errors: this.merge(current, 'errors'),
      vitals: {
        lcp: percentile(this.samples(current, 'lcpSamples'), 0.75),
        cls: percentile(this.samples(current, 'clsSamples'), 0.75),
        inp: percentile(this.samples(current, 'inpSamples'), 0.75),
        ttfb: percentile(this.samples(current, 'ttfbSamples'), 0.75),
      },
    }
  }

  private range(from: string, to: string, ownerId?: string): Promise<AnalyticsDaily[]> {
    const scope = ownerId ? { ownerId: ownerObjectId(ownerId) } : {}

    return this.daily
      .find({ ...scope, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .lean<AnalyticsDaily[]>()
      .exec()
  }

  private totals(days: AnalyticsDaily[]): AnalyticsSummary['totals'] {
    const dwellMsTotal = days.reduce((sum, day) => sum + (day.dwellMsTotal ?? 0), 0)
    const dwellSamples = days.reduce((sum, day) => sum + (day.dwellSamples ?? 0), 0)

    return {
      sessions: days.reduce((sum, day) => sum + (day.sessions ?? 0), 0),
      visitors: days.reduce((sum, day) => sum + (day.visitors ?? 0), 0),
      bounced: days.reduce((sum, day) => sum + (day.bounced ?? 0), 0),
      dwellMsAverage: dwellSamples === 0 ? 0 : Math.round(dwellMsTotal / dwellSamples),
      docs: days.reduce((sum, day) => sum + this.sum(day, 'docs'), 0),
    }
  }

  private trend(days: AnalyticsDaily[], from: string, count: number): TrendPoint[] {
    const found = new Map(days.map((day) => [day.date, day]))

    return Array.from({ length: count }, (_, index) => {
      const date = shiftDate(from, index)
      const day = found.get(date)
      return { date, sessions: day?.sessions ?? 0, visitors: day?.visitors ?? 0 }
    })
  }

  private entries(day: AnalyticsDaily, field: CounterField): [string, number][] {
    const value = day[field]
    if (!value) return []
    return value instanceof Map ? [...value.entries()] : Object.entries(value)
  }

  private sum(day: AnalyticsDaily, field: CounterField): number {
    return this.entries(day, field).reduce((total, [, count]) => total + count, 0)
  }

  private merge(days: AnalyticsDaily[], field: CounterField): Breakdown[] {
    const totals = new Map<string, number>()

    for (const day of days) {
      for (const [key, count] of this.entries(day, field)) {
        totals.set(key, (totals.get(key) ?? 0) + count)
      }
    }

    return [...totals.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N)
  }

  private totalOf(days: AnalyticsDaily[], field: CounterField): number {
    return days.reduce((sum, day) => sum + this.sum(day, field), 0)
  }

  private sections(days: AnalyticsDaily[], field: CounterField = 'sections'): Breakdown[] {
    const merged = new Map(this.merge(days, field).map((row) => [row.key, row.count]))
    const known = SECTION_ORDER.filter((key) => merged.has(key)).map((key) => ({
      key,
      count: merged.get(key) as number,
    }))
    const extra = [...merged.entries()]
      .filter(([key]) => !SECTION_ORDER.includes(key))
      .map(([key, count]) => ({ key, count }))

    return [...known, ...extra]
  }

  private cards(days: AnalyticsDaily[]): CardPerformance[] {
    const impressions = new Map<string, number>()
    const clicks = new Map<string, number>()

    for (const day of days) {
      for (const [key, count] of this.entries(day, 'impressions')) {
        impressions.set(key, (impressions.get(key) ?? 0) + count)
      }
      for (const [key, count] of this.entries(day, 'clicks')) {
        clicks.set(key, (clicks.get(key) ?? 0) + count)
      }
    }

    return [...new Set([...impressions.keys(), ...clicks.keys()])]
      .map((key) => {
        const seen = impressions.get(key) ?? 0
        const clicked = clicks.get(key) ?? 0
        return { key, impressions: seen, clicks: clicked, rate: rateOf(clicked, seen) }
      })
      .sort((a, b) => b.rate - a.rate || b.impressions - a.impressions)
      .slice(0, CARD_LIMIT)
  }

  private quartiles(days: AnalyticsDaily[]): number[] {
    const merged = new Map(this.merge(days, 'scroll').map((row) => [row.key, row.count]))
    return SCROLL_DEPTHS.map((depth) => merged.get(String(depth)) ?? 0)
  }

  private samples(
    days: AnalyticsDaily[],
    field: 'lcpSamples' | 'clsSamples' | 'inpSamples' | 'ttfbSamples',
  ): number[] {
    return days.flatMap((day) => day[field] ?? [])
  }
}
