import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class VolunteeringTranslation {
  @Prop({ required: true, trim: true })
  role: string

  @Prop({ required: true, trim: true })
  period: string

  @Prop({ required: true, trim: true })
  desc: string
}

export const VolunteeringTranslationSchema = SchemaFactory.createForClass(VolunteeringTranslation)

@Schema({ ...baseSchemaOptions, collection: 'volunteering' })
export class Volunteering {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  org: string

  @Prop({ type: String, default: null, trim: true })
  doc: string | null

  @Prop({ type: String, default: null, trim: true })
  link: string | null

  @Prop({ type: Map, of: VolunteeringTranslationSchema, required: true })
  translations: Map<string, VolunteeringTranslation>
}

export type VolunteeringDocument = HydratedDocument<Volunteering>
export const VolunteeringSchema = SchemaFactory.createForClass(Volunteering)

VolunteeringSchema.index({ ownerId: 1, order: 1 })
