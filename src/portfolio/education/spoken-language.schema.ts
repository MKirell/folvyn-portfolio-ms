import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema({ ...baseSchemaOptions, collection: 'spoken_languages' })
export class SpokenLanguage {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  code: string

  @Prop({ required: true, trim: true, uppercase: true })
  country: string

  @Prop({ required: true, trim: true, lowercase: true })
  level: string

  @Prop({ required: true, min: 0, max: 100 })
  pct: number

  @Prop({ type: String, default: null, trim: true })
  doc: string | null
}

export type SpokenLanguageDocument = HydratedDocument<SpokenLanguage>
export const SpokenLanguageSchema = SchemaFactory.createForClass(SpokenLanguage)

SpokenLanguageSchema.index({ ownerId: 1, order: 1 })
