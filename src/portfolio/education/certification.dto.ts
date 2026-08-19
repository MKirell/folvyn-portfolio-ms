import { PartialType } from '@nestjs/mapped-types'
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

export class CreateCertificationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number

  @IsString()
  @MaxLength(60)
  icon: string

  @IsString()
  @MaxLength(120)
  title: string

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  date: string

  @IsString()
  @MaxLength(80)
  issuer: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  doc?: string | null
}

export class UpdateCertificationDto extends PartialType(CreateCertificationDto) {}
