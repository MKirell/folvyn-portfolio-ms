import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { CONSENT_MODES, type ConsentMode } from '@/owner/owner.schema'
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '@/owner/slug'

export class UpdateMeDto {
  @IsOptional()
  @IsIn(CONSENT_MODES)
  consentMode?: ConsentMode

  @IsOptional()
  @IsString()
  @MinLength(SLUG_MIN_LENGTH)
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string
}

export class SlugParamDto {
  @IsString()
  @MinLength(SLUG_MIN_LENGTH)
  @MaxLength(SLUG_MAX_LENGTH)
  slug: string
}
