import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class ExperienceTranslation {
  @Prop({ required: true, trim: true })
  role: string

  @Prop({ type: [String], default: [] })
  bullets: string[]
}

export const ExperienceTranslationSchema = SchemaFactory.createForClass(ExperienceTranslation)

@Schema({ ...baseSchemaOptions, collection: 'experiences' })
export class Experience {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  startDate: string

  @Prop({ type: String, default: null, trim: true })
  endDate: string | null

  @Prop({ type: String, default: null, trim: true, uppercase: true })
  country: string | null

  @Prop({ type: String, default: null, trim: true })
  city: string | null

  @Prop({ required: true, trim: true })
  company: string

  @Prop({ type: [String], default: [] })
  tags: string[]

  @Prop({ type: String, default: null, trim: true })
  doc: string | null

  @Prop({ type: String, default: null, trim: true })
  link: string | null

  @Prop({ type: Map, of: ExperienceTranslationSchema, required: true })
  translations: Map<string, ExperienceTranslation>
}

export type ExperienceDocument = HydratedDocument<Experience>
export const ExperienceSchema = SchemaFactory.createForClass(Experience)

ExperienceSchema.index({ ownerId: 1, order: 1 })
