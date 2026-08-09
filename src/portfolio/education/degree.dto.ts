import { PartialType } from '@nestjs/mapped-types'
import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

export class DegreeTranslationDto {
  @IsString()
  @MaxLength(120)
  title: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  school?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(80)
  location?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mention?: string | null
}

export class CreateDegreeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @MaxLength(30)
  years: string

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
