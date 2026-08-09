import { PartialType } from '@nestjs/mapped-types'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export class ExperienceTranslationDto {
  @IsString()
  @MaxLength(120)
  role: string

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  bullets: string[]
}

export class CreateExperienceDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsOptional()
  @IsBoolean()
  current?: boolean

  @IsString()
  @Matches(MONTH_PATTERN)
  startDate: string

  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN)
  endDate?: string | null

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country?: string | null

  @IsString()
  @MaxLength(120)
  company: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  link?: string | null

  @IsTranslationMap(ExperienceTranslationDto)
  translations: Record<string, ExperienceTranslationDto>
}

export class UpdateExperienceDto extends PartialType(CreateExperienceDto) {}
