import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

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

  @Prop({ required: true, trim: true })
  date: string

  @Prop({ type: String, default: null, trim: true })
  doc: string | null
}

export type CertificationDocument = HydratedDocument<Certification>
export const CertificationSchema = SchemaFactory.createForClass(Certification)

CertificationSchema.index({ ownerId: 1, order: 1 })
