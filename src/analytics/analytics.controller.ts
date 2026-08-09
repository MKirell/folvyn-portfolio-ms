import { Controller, Get, Query } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { OwnerId } from '@/common/decorators/current-owner.decorator'
import { ownerObjectId } from '@/common/schemas/owned'
import { RollupService, type AnalyticsSummary } from '@/analytics/rollup.service'
import { EventsQueryDto, SummaryQueryDto } from '@/analytics/collect.dto'
import {
  AnalyticsEvent,
  type AnalyticsEventDocument,
} from '@/analytics/schemas/analytics-event.schema'

const DEFAULT_DAYS = 30
const DEFAULT_LIMIT = 100

@Controller('admin/analytics')
export class AnalyticsController {
  constructor(
    private readonly rollup: RollupService,
    @InjectModel(AnalyticsEvent.name) private readonly events: Model<AnalyticsEventDocument>,
  ) {}

  @Get('summary')
  summary(@OwnerId() ownerId: string, @Query() query: SummaryQueryDto): Promise<AnalyticsSummary> {
    return this.rollup.summary(query.days ?? DEFAULT_DAYS, ownerId)
  }

  @Get('events')
  drillDown(@OwnerId() ownerId: string, @Query() query: EventsQueryDto): Promise<AnalyticsEvent[]> {
    const scope = { ownerId: ownerObjectId(ownerId) }

    return this.events
      .find(query.type ? { ...scope, type: query.type } : scope)
      .sort({ createdAt: -1 })
      .limit(query.limit ?? DEFAULT_LIMIT)
      .lean<AnalyticsEvent[]>()
      .exec()
  }
}
