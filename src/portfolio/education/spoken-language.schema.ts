import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class SpokenLanguageTranslation {
  @Prop({ required: true, trim: true })
  name: string

  @Prop({ required: true, trim: true })
  level: string
}

export const SpokenLanguageTranslationSchema =
  SchemaFactory.createForClass(SpokenLanguageTranslation)

@Schema({ ...baseSchemaOptions, collection: 'spoken_languages' })
export class SpokenLanguage {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  flagCode: string

  @Prop({ required: true, min: 0, max: 100 })
  pct: number

  @Prop({ type: String, default: null, trim: true })
  doc: string | null

  @Prop({ type: Map, of: SpokenLanguageTranslationSchema, required: true })
  translations: Map<string, SpokenLanguageTranslation>
}

export type SpokenLanguageDocument = HydratedDocument<SpokenLanguage>
export const SpokenLanguageSchema = SchemaFactory.createForClass(SpokenLanguage)

SpokenLanguageSchema.index({ ownerId: 1, order: 1 })
