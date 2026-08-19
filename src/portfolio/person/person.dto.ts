import { PartialType } from '@nestjs/mapped-types'
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'
import { CITY_MAX, COUNTRY_PATTERN } from '@/common/dto/patterns'

export class PersonTranslationDto {
  @IsString()
  @MaxLength(100)
  headline: string

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  aboutParagraphs: string[]
}

export class UpsertPersonDto {
  @IsString()
  @MaxLength(60)
  givenName: string

  @IsString()
  @MaxLength(60)
  familyName: string

  @IsEmail()
  email: string

  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone: string

  @IsUrl({ protocols: ['https'], require_protocol: true })
  linkedin: string

  @IsUrl({ protocols: ['https'], require_protocol: true })
  github: string

  @IsString()
  @MaxLength(120)
  affiliation: string

  @IsString()
  @Matches(COUNTRY_PATTERN)
  country: string

  @IsString()
  @MaxLength(CITY_MAX)
  city: string

  @IsString()
  @MaxLength(255)
  photo: string

  @IsOptional()
  @IsObject()
  resumes?: Record<string, string>

  @IsTranslationMap(PersonTranslationDto)
  translations: Record<string, PersonTranslationDto>
}

export class UpdatePersonDto extends PartialType(UpsertPersonDto) {}
