import { PartialType } from '@nestjs/mapped-types'
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

export class SpokenLanguageTranslationDto {
  @IsString()
  @MaxLength(60)
  name: string

  @IsString()
  @MaxLength(40)
  level: string
}

export class CreateSpokenLanguageDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @Matches(/^[a-z]{2}$/)
  flagCode: string

  @IsInt()
  @Min(0)
  @Max(100)
  pct: number

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null

  @IsTranslationMap(SpokenLanguageTranslationDto)
  translations: Record<string, SpokenLanguageTranslationDto>
}

export class UpdateSpokenLanguageDto extends PartialType(CreateSpokenLanguageDto) {}
