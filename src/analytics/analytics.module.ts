import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AnalyticsController } from '@/analytics/analytics.controller'
import { CollectController } from '@/analytics/collect.controller'
import { Owner, OwnerSchema } from '@/owner/owner.schema'
import { AnalyticsService } from '@/analytics/analytics.service'
import { RollupService } from '@/analytics/rollup.service'
import { SaltService } from '@/analytics/salt.service'
import { AnalyticsEvent, AnalyticsEventSchema } from '@/analytics/schemas/analytics-event.schema'
import { AnalyticsDaily, AnalyticsDailySchema } from '@/analytics/schemas/analytics-daily.schema'
import {
  AnalyticsVisitor,
  AnalyticsVisitorSchema,
} from '@/analytics/schemas/analytics-visitor.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: AnalyticsVisitor.name, schema: AnalyticsVisitorSchema },
      { name: Owner.name, schema: OwnerSchema },
    ]),
  ],
  controllers: [CollectController, AnalyticsController],
  providers: [AnalyticsService, RollupService, SaltService],
  exports: [AnalyticsService, RollupService, MongooseModule],
})
export class AnalyticsModule {}
