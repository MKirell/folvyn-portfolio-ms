import { PartialType } from '@nestjs/mapped-types'
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

export class ProfileTranslationDto {
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  subtitles: string[]

  @IsString()
  @MaxLength(240)
  tagline: string
}

export class UpsertProfileDto {
  @IsTranslationMap(ProfileTranslationDto)
  translations: Record<string, ProfileTranslationDto>
}

export class UpdateProfileDto extends PartialType(UpsertProfileDto) {}
