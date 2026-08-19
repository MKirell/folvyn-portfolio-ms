import { PartialType } from '@nestjs/mapped-types'
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

export class SkillCategoryTranslationDto {
  @IsString()
  @MaxLength(80)
  title: string
}

export class CreateSkillCategoryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @MaxLength(60)
  icon: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  accentTags?: string[]

  @IsTranslationMap(SkillCategoryTranslationDto)
  translations: Record<string, SkillCategoryTranslationDto>
}

export class UpdateSkillCategoryDto extends PartialType(CreateSkillCategoryDto) {}
