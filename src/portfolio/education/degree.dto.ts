import { PartialType } from '@nestjs/mapped-types'
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'
import { CITY_MAX, COUNTRY_PATTERN, MONTH_PATTERN } from '@/common/dto/patterns'
import { HONORS } from '@/common/dto/vocabularies'

export class DegreeTranslationDto {
  @IsString()
  @MaxLength(120)
  title: string
}

export class CreateDegreeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @Matches(MONTH_PATTERN)
  startDate: string

  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN)
  endDate?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  school?: string | null

  @IsOptional()
  @IsString()
  @Matches(COUNTRY_PATTERN)
  country?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(CITY_MAX)
  city?: string | null

  @IsOptional()
  @IsIn(HONORS)
  honors?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  link?: string | null

  @IsTranslationMap(DegreeTranslationDto)
  translations: Record<string, DegreeTranslationDto>
}

export class UpdateDegreeDto extends PartialType(CreateDegreeDto) {}
