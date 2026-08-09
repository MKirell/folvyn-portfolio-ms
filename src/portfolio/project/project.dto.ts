import { PartialType } from '@nestjs/mapped-types'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

export class ProjectTranslationDto {
  @IsString()
  @MaxLength(60)
  period: string

  @IsString()
  @MaxLength(60)
  badge: string

  @IsString()
  @MaxLength(320)
  desc: string
}

export class CreateProjectDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @MaxLength(80)
  title: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[]

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  link?: string | null

  @IsTranslationMap(ProjectTranslationDto)
  translations: Record<string, ProjectTranslationDto>
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
