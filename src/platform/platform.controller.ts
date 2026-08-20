import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Connection, ConnectionStates } from 'mongoose'
import { InjectConnection } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Roles } from '@/common/decorators/roles.decorator'
import { Role } from '@/auth/roles'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Owner } from '@/owner/owner.schema'
import { RollupService, shiftDate, type AnalyticsSummary } from '@/analytics/rollup.service'
import { SaltService } from '@/analytics/salt.service'
import { SummaryQueryDto } from '@/analytics/collect.dto'
import {
  AnalyticsDaily,
  type AnalyticsDailyDocument,
} from '@/analytics/schemas/analytics-daily.schema'
import {
  PlatformService,
  type AccountDetail,
  type ErasureRow,
  type IngestReport,
  type ModerationBoard,
  type PlatformConfig,
  type PortfolioRow,
  type ErrorGroup,
  type StorageReport,
} from '@/platform/platform.service'
import { AuditQueryDto, PortfolioQueryDto, SuspendOwnerDto } from '@/platform/platform.dto'
import type { AuditEntry } from '@/platform/audit.schema'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'
import type { OwnerExport } from '@/portfolio/me/owner-lifecycle.service'
import { PrerenderService } from '@/prerender/prerender.service'
import type { PrerenderAttempt } from '@/prerender/prerender.service'

const DEFAULT_DAYS = 30
const DEFAULT_AUDIT_LIMIT = 50
const TOP_PORTFOLIOS = 20

export interface PlatformOverview {
  owners: { total: number; published: number; draft: number; suspended: number }
  signups: { last7: number; last30: number }
  traffic: AnalyticsSummary
  portfolios: { slug: string; status: string; sessions: number; visitors: number }[]
}

export interface PlatformHealth {
  database: 'up' | 'down'
  errors: { key: string; count: number }[]
  errorGroups: ErrorGroup[]
  storage: StorageReport
  vitals: AnalyticsSummary['vitals']
  sessions: number
  errorRate: number
  image: string | null
  prerender: PrerenderHealth
}

export interface PrerenderHealth {
  configured: boolean
  attempts: PrerenderAttempt[]
  failing: number
}

@Roles(Role.Platform)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly rollup: RollupService,
    private readonly prerender: PrerenderService,
    @InjectModel(Owner.name) private readonly owners: Model<Owner>,
    @InjectModel(AnalyticsDaily.name) private readonly daily: Model<AnalyticsDailyDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Get('overview')
  async overview(@Query() query: SummaryQueryDto): Promise<PlatformOverview> {
    const days = query.days ?? DEFAULT_DAYS
    const to = SaltService.today()
    const from = shiftDate(to, -(days - 1))

    const [counts, signups, traffic, portfolios] = await Promise.all([
      this.counts(),
      this.signups(),
      this.rollup.summary(days),
      this.byTraffic(from, to),
    ])

    return { owners: counts, signups, traffic, portfolios }
  }

  @Get('health')
  async health(@Query() query: SummaryQueryDto): Promise<PlatformHealth> {
    const days = query.days ?? DEFAULT_DAYS

    const [traffic, errorGroups, storage] = await Promise.all([
      this.rollup.summary(days),
      this.platform.errorGroups(days),
      this.platform.storage(),
    ])

    return {
      database: this.connection.readyState === ConnectionStates.connected ? 'up' : 'down',
      errors: traffic.errors,
      errorGroups,
      storage,
      vitals: traffic.vitals,
      sessions: traffic.totals.sessions,
      errorRate:
        traffic.totals.sessions === 0
          ? 0
          : Math.round(
              (errorGroups.reduce((sum, group) => sum + group.count, 0) / traffic.totals.sessions) *
                1000,
            ) / 10,
      image: process.env.APP_IMAGE_TAG || null,
      prerender: {
        configured: this.prerender.enabled,
        attempts: this.prerender.recent(),
        failing: this.prerender.recent().filter((attempt) => !attempt.succeeded).length,
      },
    }
  }

  @Get('portfolios')
  portfolios(@Query() query: PortfolioQueryDto): Promise<PortfolioRow[]> {
    return this.platform.portfolios(query)
  }

  @Post('portfolios/:id/suspend')
  suspend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendOwnerDto,
  ): Promise<PortfolioRow> {
    return this.platform.suspend(actor, id, dto.reason)
  }

  @Post('portfolios/:id/restore')
  restore(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string): Promise<PortfolioRow> {
    return this.platform.restore(actor, id)
  }

  @Get('portfolios/:id/export')
  exportOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<OwnerExport> {
    return this.platform.exportOne(actor, id)
  }

  @Delete('portfolios/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  erase(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendOwnerDto,
  ): Promise<void> {
    return this.platform.erase(actor, id, dto.reason)
  }

  @Get('traffic')
  traffic(@Query() query: SummaryQueryDto): Promise<AnalyticsSummary> {
    return this.rollup.summary(query.days ?? DEFAULT_DAYS)
  }

  @Get('portfolios/:id')
  account(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AccountDetail> {
    return this.platform.accountDetail(actor, id)
  }

  @Get('moderation')
  moderation(): Promise<ModerationBoard> {
    return this.platform.moderation()
  }

  @Get('ingest')
  ingest(@Query() query: SummaryQueryDto): Promise<IngestReport> {
    return this.platform.ingest(query.days ?? DEFAULT_DAYS)
  }

  @Get('erasures')
  erasures(): Promise<ErasureRow[]> {
    return this.platform.erasureQueue()
  }

  @Post('portfolios/:id/erasure')
  queueErasure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendOwnerDto,
  ): Promise<ErasureRow> {
    return this.platform.queueErasure(actor, id, dto.reason)
  }

  @Post('erasures/:id/run')
  runErasure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ErasureRow> {
    return this.platform.runErasure(actor, id)
  }

  @Get('config')
  config(): Promise<PlatformConfig> {
    return this.platform.config()
  }

  @Get('audit')
  audit(@Query() query: AuditQueryDto): Promise<AuditEntry[]> {
    return this.platform.entries(query.limit ?? DEFAULT_AUDIT_LIMIT)
  }

  private async counts(): Promise<PlatformOverview['owners']> {
    const [total, published, draft, suspended] = await Promise.all([
      this.owners.countDocuments().exec(),
      this.owners.countDocuments({ status: 'published' }).exec(),
      this.owners.countDocuments({ status: 'draft' }).exec(),
      this.owners.countDocuments({ status: 'suspended' }).exec(),
    ])

    return { total, published, draft, suspended }
  }

  private async signups(): Promise<PlatformOverview['signups']> {
    const since = (back: number): Date => new Date(Date.now() - back * 86_400_000)

    const [last7, last30] = await Promise.all([
      this.owners.countDocuments({ createdAt: { $gte: since(7) } }).exec(),
      this.owners.countDocuments({ createdAt: { $gte: since(30) } }).exec(),
    ])

    return { last7, last30 }
  }

  private async byTraffic(from: string, to: string): Promise<PlatformOverview['portfolios']> {
    const rows = await this.daily.aggregate<{
      sessions: number
      visitors: number
      slug: string
      status: string
    }>([
      { $match: { date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$ownerId',
          sessions: { $sum: '$sessions' },
          visitors: { $sum: '$visitors' },
        },
      },
      { $sort: { visitors: -1, sessions: -1 } },
      { $limit: TOP_PORTFOLIOS },
      { $lookup: { from: 'owners', localField: '_id', foreignField: '_id', as: 'owner' } },
      { $unwind: '$owner' },
      { $project: { sessions: 1, visitors: 1, slug: '$owner.slug', status: '$owner.status' } },
    ])

    return rows.map(({ slug, status, sessions, visitors }) => ({
      slug,
      status,
      sessions,
      visitors,
    }))
  }
}
