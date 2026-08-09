import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PlatformController } from '@/platform/platform.controller'
import { PlatformService } from '@/platform/platform.service'
import { AuditEntry, AuditEntrySchema } from '@/platform/audit.schema'
import { Owner, OwnerSchema } from '@/owner/owner.schema'
import { AnalyticsModule } from '@/analytics/analytics.module'
import { AnalyticsDaily, AnalyticsDailySchema } from '@/analytics/schemas/analytics-daily.schema'
import { AnalyticsEvent, AnalyticsEventSchema } from '@/analytics/schemas/analytics-event.schema'
import { ErasureRequest, ErasureRequestSchema } from '@/platform/erasure.schema'
import { PortfolioModule } from '@/portfolio/portfolio.module'

@Module({
  imports: [
    AnalyticsModule,
    PortfolioModule,
    MongooseModule.forFeature([
      { name: AuditEntry.name, schema: AuditEntrySchema },
      { name: Owner.name, schema: OwnerSchema },
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: ErasureRequest.name, schema: ErasureRequestSchema },
    ]),
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
