import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class DegreeTranslation {
  @Prop({ required: true, trim: true })
  title: string

  @Prop({ type: String, default: null, trim: true })
  school: string | null

  @Prop({ type: String, default: null, trim: true })
  location: string | null

  @Prop({ type: String, default: null, trim: true })
  mention: string | null
}

export const DegreeTranslationSchema = SchemaFactory.createForClass(DegreeTranslation)

@Schema({ ...baseSchemaOptions, collection: 'degrees' })
export class Degree {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  years: string

  @Prop({ type: String, default: null, trim: true })
  doc: string | null

  @Prop({ type: String, default: null, trim: true })
  link: string | null

  @Prop({ type: Map, of: DegreeTranslationSchema, required: true })
  translations: Map<string, DegreeTranslation>
}

export type DegreeDocument = HydratedDocument<Degree>
export const DegreeSchema = SchemaFactory.createForClass(Degree)

DegreeSchema.index({ ownerId: 1, order: 1 })
