import { PartialType } from '@nestjs/mapped-types'
import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator'
import { IsTranslationMap } from '@/common/dto/translations.dto'

export class VolunteeringTranslationDto {
  @IsString()
  @MaxLength(100)
  role: string

  @IsString()
  @MaxLength(60)
  period: string

  @IsString()
  @MaxLength(300)
  desc: string
}

export class CreateVolunteeringDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @MaxLength(80)
  org: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  link?: string | null

  @IsTranslationMap(VolunteeringTranslationDto)
  translations: Record<string, VolunteeringTranslationDto>
}

export class UpdateVolunteeringDto extends PartialType(CreateVolunteeringDto) {}
