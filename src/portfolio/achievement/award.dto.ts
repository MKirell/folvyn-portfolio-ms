import { PartialType } from '@nestjs/mapped-types'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'
import { CITY_MAX } from '@/common/dto/patterns'

export class AwardTranslationDto {
  @IsString()
  @MaxLength(120)
  title: string
}

export class CreateAwardDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @MaxLength(60)
  icon: string

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(CITY_MAX)
  city?: string | null

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  date?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  images?: string[]

  @IsTranslationMap(AwardTranslationDto)
  translations: Record<string, AwardTranslationDto>
}

export class UpdateAwardDto extends PartialType(CreateAwardDto) {}
