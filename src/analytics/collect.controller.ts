import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { Public } from '@/common/decorators/public.decorator'
import { AnalyticsService } from '@/analytics/analytics.service'
import { CollectDto } from '@/analytics/collect.dto'

export const COLLECT_THROTTLE = { limit: 60, ttl: 60_000 }

@Public()
@Controller('collect')
export class CollectController {
  constructor(private readonly service: AnalyticsService) {}

  @Post()
  @Throttle({ default: COLLECT_THROTTLE })
  @HttpCode(HttpStatus.NO_CONTENT)
  async collect(@Body() dto: CollectDto, @Req() request: Request): Promise<void> {
    await this.service.ingest(dto, {
      userAgent: request.get('user-agent') ?? undefined,
      acceptLanguage: request.get('accept-language') ?? undefined,
      country: request.get('cloudfront-viewer-country') ?? undefined,
    })
  }
}
