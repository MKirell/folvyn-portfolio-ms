import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { OWNER_STATUSES, type OwnerStatus } from '@/owner/owner.schema'

export const MAX_REASON_LENGTH = 300

export class SuspendOwnerDto {
  @IsString()
  @MaxLength(MAX_REASON_LENGTH)
  reason: string
}

export class PortfolioQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  query?: string

  @IsOptional()
  @IsIn(OWNER_STATUSES)
  status?: OwnerStatus

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}

export class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
