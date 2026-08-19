import { PartialType } from '@nestjs/mapped-types'
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator'
import { LANG_PATTERN } from '@/common/types/portfolio.types'

export class CreateLocaleDto {
  @IsString()
  @Matches(LANG_PATTERN)
  code: string

  @IsString()
  @Matches(/^[a-z]{2}$/)
  flagCode: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number
}

export class UpdateLocaleDto extends PartialType(CreateLocaleDto) {}
