import { PartialType } from '@nestjs/mapped-types'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { COUNTRY_PATTERN } from '@/common/dto/patterns'
import { LANGUAGE_LEVELS } from '@/common/dto/vocabularies'

export class CreateSpokenLanguageDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  code: string

  @IsString()
  @Matches(COUNTRY_PATTERN)
  country: string

  @IsIn(LANGUAGE_LEVELS)
  level: string

  @IsInt()
  @Min(0)
  @Max(100)
  pct: number

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null
}

export class UpdateSpokenLanguageDto extends PartialType(CreateSpokenLanguageDto) {}
