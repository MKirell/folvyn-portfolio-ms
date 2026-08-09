import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { SLUG_MAX_LENGTH } from '@/owner/slug'

export const EVENT_TYPES = [
  'session',
  'section',
  'dwell',
  'scroll',
  'impression',
  'click',
  'doc',
  'outbound',
  'contact',
  'lang',
  'theme',
  'shell',
  'vitals',
  'error',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const VITALS_TARGETS = ['lcp', 'cls', 'inp', 'ttfb'] as const

export const SCROLL_DEPTHS = [25, 50, 75, 100] as const

export const IDENTIFIER_TARGET_TYPES: readonly EventType[] = ['section', 'impression', 'click']

export const IDENTIFIER_TARGET = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

export const MAX_EVENTS_PER_BATCH = 20
export const MAX_TARGET_LENGTH = 120
export const MAX_EVENT_VALUE = 86_400_000

export class CollectEventDto {
  @IsIn(EVENT_TYPES)
  type: EventType

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TARGET_LENGTH)
  target?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_EVENT_VALUE)
  value?: number

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TARGET_LENGTH)
  path?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  lang?: string

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TARGET_LENGTH)
  referrer?: string

  @IsOptional()
  @IsString()
  @IsIn(['desktop', 'tablet', 'mobile'])
  device?: string
}

export class CollectDto {
  @IsString()
  @MaxLength(64)
  sessionId: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  visitorId?: string

  @IsOptional()
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => CollectEventDto)
  events: CollectEventDto[]
}

export class SummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number
}

export class EventsQueryDto {
  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: EventType

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number
}
