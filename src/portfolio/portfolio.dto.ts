import { IsOptional, IsString, Matches } from 'class-validator'
import { LANG_PATTERN } from '@/common/types/portfolio.types'

export class LangQueryDto {
  @IsOptional()
  @IsString()
  @Matches(LANG_PATTERN)
  lang?: string
}

export class LangParamDto {
  @IsString()
  @Matches(LANG_PATTERN)
  lang: string
}
