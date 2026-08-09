import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  Min,
  ValidateNested,
} from 'class-validator'

export class ReorderEntryDto {
  @IsMongoId()
  id: string

  @IsInt()
  @Min(0)
  order: number
}

export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReorderEntryDto)
  entries: ReorderEntryDto[]
}
