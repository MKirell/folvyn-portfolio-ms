import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class AwardTranslation {
  @Prop({ required: true, trim: true })
  title: string
}

export const AwardTranslationSchema = SchemaFactory.createForClass(AwardTranslation)

@Schema({ ...baseSchemaOptions, collection: 'awards' })
export class Award {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  icon: string

  @Prop({ type: String, default: null, trim: true })
  country: string | null

  @Prop({ type: String, default: null, trim: true })
  city: string | null

  @Prop({ type: String, default: null, trim: true })
  date: string | null

  @Prop({ type: [String], default: [] })
  images: string[]

  @Prop({ type: Map, of: AwardTranslationSchema, required: true })
  translations: Map<string, AwardTranslation>
}

export type AwardDocument = HydratedDocument<Award>
export const AwardSchema = SchemaFactory.createForClass(Award)

AwardSchema.index({ ownerId: 1, order: 1 })
