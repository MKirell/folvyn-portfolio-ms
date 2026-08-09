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

export class AwardTranslationDto {
  @IsString()
  @MaxLength(120)
  title: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  place?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string | null
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
  @Matches(/^[a-z]{2}$/)
  flagCode?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  images?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null

  @IsTranslationMap(AwardTranslationDto)
  translations: Record<string, AwardTranslationDto>
}

export class UpdateAwardDto extends PartialType(CreateAwardDto) {}
