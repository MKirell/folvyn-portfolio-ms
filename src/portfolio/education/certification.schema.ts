import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class CertificationTranslation {
  @Prop({ required: true, trim: true })
  date: string
}

export const CertificationTranslationSchema = SchemaFactory.createForClass(CertificationTranslation)

@Schema({ ...baseSchemaOptions, collection: 'certifications' })
export class Certification {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  icon: string

  @Prop({ required: true, trim: true })
  title: string

  @Prop({ required: true, trim: true })
  issuer: string

  @Prop({ type: String, default: null, trim: true })
  doc: string | null

  @Prop({ type: Map, of: CertificationTranslationSchema, required: true })
  translations: Map<string, CertificationTranslation>
}

export type CertificationDocument = HydratedDocument<Certification>
export const CertificationSchema = SchemaFactory.createForClass(Certification)

CertificationSchema.index({ ownerId: 1, order: 1 })
